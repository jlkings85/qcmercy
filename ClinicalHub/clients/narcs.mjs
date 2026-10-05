import {betterAuth} from 'better-auth';
import {genericOAuth} from 'better-auth/plugins';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {drizzle} from 'drizzle-orm/d1';
import * as schema from '../auth-schema.ts';
import {NARCS_PROFILES} from '../access.mjs';
import {startSharedLogin} from './start-login.mjs';

// This client uses the existing native auth schema, secret, cookie name and
// profile links. It never creates a user, roster entry, signature or inventory event.
export function createNarcsSSO(env){
 const origin=new URL(env.BETTER_AUTH_URL).origin,hubOrigin=env.HUB_ORIGIN;
 if(!env.HUB_DB||!env.DB||!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32||origin!=='https://narcs.clinicalapps.app'&&origin!=='https://narcs.test')throw Error('Narcs shared login is not configured.');
 if(!hubOrigin||new URL(hubOrigin).origin!==hubOrigin||!hubOrigin.startsWith('https://'))throw Error('Invalid shared login origin.');
 return betterAuth({
  appName:'ClinicalNarcs',baseURL:origin,secret:env.BETTER_AUTH_SECRET,
  database:drizzleAdapter(drizzle(env.DB,{schema}),{provider:'sqlite',schema,transaction:false}),
  trustedOrigins:[origin],
  account:{accountLinking:{enabled:true,trustedProviders:['mercy-hub']}},
  session:{expiresIn:60*60*12,updateAge:60*30,cookieCache:{enabled:false}},
  user:{changeEmail:{enabled:false}},
  advanced:{cookiePrefix:'clinicalnarcs',useSecureCookies:true,ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
  rateLimit:{enabled:true,storage:'database',window:60,max:60},
  plugins:[genericOAuth({config:[{
   providerId:'mercy-hub',name:'ClinicalApps',clientId:'clinical-narcs',
   discoveryUrl:hubOrigin+'/api/auth/.well-known/openid-configuration',requireIdTokenVerification:true,
   scopes:['openid','email','profile'],pkce:true,tokenEndpointAuth:{method:'none'},disableSignUp:true,disableImplicitSignUp:true,
   getUserInfo:async tokens=>{const r=await fetch(hubOrigin+'/api/auth/oauth2/userinfo',{headers:{Authorization:'Bearer '+tokens.accessToken},signal:AbortSignal.timeout(10000)});return r.ok?r.json():null;},
   mapProfileToUser:async profile=>{
    const mapping=profile.module_account;
    if(profile.email_verified!==true||mapping?.module!=='narcs'||!profile.sub||!mapping.local_id||!mapping.auth_user_id)throw Error('Unlinked shared account.');
    const grant=await env.HUB_DB.prepare(`SELECT g.local_id FROM hub_grants g JOIN hub_members m ON m.user_id=g.user_id WHERE g.user_id=? AND g.module='narcs' AND g.local_id=? AND g.enabled=1 AND m.enabled=1`).bind(String(profile.sub),String(mapping.local_id)).first();
    const local=await env.DB.prepare(NARCS_PROFILES+` WHERE json_extract(j.value,'$.id')=?`).bind(String(mapping.local_id)).first();
    if(!grant||!local?.active||local.auth_user_id!==mapping.auth_user_id||local.email.toLowerCase()!==String(mapping.email).toLowerCase())throw Error('Shared access is not enabled for this Narcs profile.');
    return {email:local.email,name:local.name,emailVerified:true};
   },
  }]})],
 });
}

export function withNarcsSSO(native){return {...native,async fetch(request,env,context){
 if(env.HUB_LOGIN_ENABLED!=='true')return native.fetch(request,env,context);
 try{
  const url=new URL(request.url),path=url.pathname;
  if(url.origin!==new URL(env.BETTER_AUTH_URL).origin)return native.fetch(request,env,context);
  const auth=createNarcsSSO(env);
  if(path==='/suite-login'&&request.method==='GET')return startSharedLogin(request,env,req=>auth.handler(req),'/');
  if(path==='/api/auth/callback/mercy-hub')return auth.handler(request);
  // Every protected request rechecks central access, even for older native sessions.
  // Native logout remains available to a suspended user.
  if(request.headers.get('cookie')?.includes('clinicalnarcs.session_token=')&&path!=='/api/auth/sign-out'){
   const session=await auth.api.getSession({headers:request.headers});
   if(session?.user.emailVerified){
    const link=await env.DB.prepare('SELECT person_id FROM narcs_login_links WHERE auth_user_id=?').bind(session.user.id).first();
    if(link){
     const access=await env.HUB_DB.prepare(`SELECT g.enabled,m.enabled member_enabled FROM hub_grants g JOIN hub_members m ON m.user_id=g.user_id WHERE g.module='narcs' AND g.local_id=?`).bind(link.person_id).first();
     if(access&&(!access.enabled||!access.member_enabled))return new Response(path.startsWith('/api/')?JSON.stringify({error:'Your shared ClinicalNarcs access has been suspended.'}):'<!doctype html><html lang="en"><title>Access suspended</title><meta name="viewport" content="width=device-width"><main><h1>ClinicalNarcs access suspended</h1><p>Contact your ClinicalApps administrator to restore access.</p><a href="https://clinicalapps.app/">Return to ClinicalApps</a></main></html>',{status:403,headers:{'Content-Type':path.startsWith('/api/')?'application/json':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
   }
  }
  return native.fetch(request,env,context);
 }catch(error){console.error('Narcs SSO request failed',{type:error?.name});return Response.json({error:'Shared access could not be checked. Please try again.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}};}
