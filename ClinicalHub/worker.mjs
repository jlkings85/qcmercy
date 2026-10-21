import {createHubAuth} from './auth.mjs';
import {moduleDestinations,HttpError,member,liveGrant,assertOrigin,saveGrant,saveMember,NARCS_PROFILES} from './access.mjs';
import html from './public/index.html';
import style from './public/style.css';
import client from './public/client.js.txt';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handle(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(url.origin!==env.HUB_ORIGIN)return json({error:'Unrecognized dashboard address.'},404);
 const auth=createHubAuth(env);
 if(path==='/health')return json({status:'ok',service:'mercy-clinical-hub'});
 if(path.startsWith('/api/auth/')||path.startsWith('/.well-known/'))return auth.handler(request);
 if(path==='/style.css')return new Response(style,{headers:{'Content-Type':'text/css; charset=utf-8'}});
 if(path==='/client.js')return new Response(client,{headers:{'Content-Type':'text/javascript; charset=utf-8'}});
 if(path==='/favicon.svg')return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#123f68"/><path d="M28 14h8v14h14v8H36v14h-8V36H14v-8h14z" fill="#fff"/></svg>',{headers:{'Content-Type':'image/svg+xml'}});
 if(['/','/login','/consent','/admin'].includes(path))return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 const session=await auth.api.getSession({headers:request.headers});
 const m=session?.user.emailVerified?await member(env,session.user.id):null;
 if(!m)return json({error:'Sign in to your Mercy EMS account.'},401);
 if(path==='/api/dashboard'&&request.method==='GET'){
  const configs=(await env.DB.prepare('SELECT id,connected FROM hub_modules').all()).results;
  const modules=[];
  for(const mod of moduleDestinations(env)){
   const g=await liveGrant(env,session.user.id,mod.id);
   if(!m.is_admin&&!mod.public&&!g)continue;
   const connected=mod.public||!!configs.find(c=>c.id===mod.id)?.connected;
   modules.push({...mod,connected,hasAccess:mod.public||!!g,role:g?.account.role||null,
    launchUrl:connected&&!mod.public?(g?(mod.id==='evals'?'https://shifts.clinicalapps.app/suite-login/evaluations':mod.url+'/suite-login'):'/admin'):mod.url});
  }
  return json({user:{id:session.user.id,name:session.user.name,email:session.user.email,isAdmin:!!m.is_admin},modules});
 }
 if(path.startsWith('/api/admin/')){
  if(!m.is_admin)throw new HttpError(403,'Administrator access is required.');
  if(path==='/api/admin/accounts'&&request.method==='GET'){
   const users=(await env.DB.prepare('SELECT u.id,u.name,u.email,u.email_verified,m.enabled,m.is_admin FROM auth_user u LEFT JOIN hub_members m ON m.user_id=u.id ORDER BY u.name,u.email').all()).results;
   const grants=(await env.DB.prepare('SELECT * FROM hub_grants').all()).results;
   const profiles={qc:(await env.DB.prepare('SELECT o.id,o.name,o.email,o.role,o.active,l.auth_user_id FROM operators o JOIN qc_login_links l ON l.operator_id=o.id ORDER BY o.name').all()).results,shifts:env.SHIFTS_DB?(await env.SHIFTS_DB.prepare('SELECT p.id,p.name,p.email,p.role,p.active,p.auth_id auth_user_id FROM people p JOIN auth_user u ON u.id=p.auth_id WHERE u.email_verified=1 ORDER BY p.name').all()).results:[]};
   const audit=(await env.DB.prepare('SELECT actor_id,event,target_id,details,created_at FROM hub_audit ORDER BY created_at DESC LIMIT 50').all()).results;
   profiles.narcs=env.NARCS_DB?(await env.NARCS_DB.prepare(NARCS_PROFILES+' ORDER BY name').all()).results:[];
   const siteRoles=(await env.DB.prepare('SELECT user_id,module,role FROM hub_site_roles').all()).results;
   const connections=(await env.DB.prepare('SELECT id,connected FROM hub_modules').all()).results;
   return json({users,grants,profiles,audit,siteRoles,modules:moduleDestinations(env).map(mod=>({id:mod.id,name:mod.name,public:!!mod.public,managed:['qc','shifts','narcs','forms','credentials'].includes(mod.id),connected:!!connections.find(c=>c.id===mod.id)?.connected,dependsOn:mod.id==='evals'?'shifts':null}))});
  }
  if(['/api/admin/grants','/api/admin/members'].includes(path)&&request.method==='POST'){
   assertOrigin(request,env.HUB_ORIGIN);
   if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON is required.');
   const body=await request.text();if(body.length>4096)throw new HttpError(413,'Request is too large.');
   let payload;try{payload=JSON.parse(body);}catch{throw new HttpError(400,'Valid JSON is required.');}
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new HttpError(400,'An account change is required.');
   return json(await (path.endsWith('/members')?saveMember:saveGrant)(env,session.user.id,payload));
  }
 }
 return json({error:'Not found.'},404);
}
export default {async fetch(request,env){
 let response;
 try{response=await handle(request,env);}catch(error){
  if(error instanceof HttpError)response=json({error:error.message},error.status);
  else {console.error('Dashboard request failed',{path:new URL(request.url).pathname,type:error?.name});response=json({error:'Unable to complete this request. Please try again.'},500);}
 }
 const headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('Permissions-Policy','camera=(),microphone=(),geolocation=()');
 headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 headers.set('Strict-Transport-Security','max-age=31536000');headers.set('Cache-Control','no-store');
 return new Response(response.body,{status:response.status,headers});
}};
