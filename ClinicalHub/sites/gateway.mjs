import {betterAuth} from 'better-auth';
import {genericOAuth} from 'better-auth/plugins';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {drizzle} from 'drizzle-orm/d1';
import * as schema from '../auth-schema.ts';
import {liveGrant} from '../access.mjs';
import {startSharedLogin} from '../clients/start-login.mjs';
import {signIdentity} from './assertion.mjs';
export const APPS={forms:{origin:'https://forms.clinicalapps.app',upstream:'https://clinicalforms.jlkings85.chatgpt.site'},credentials:{origin:'https://credentials.clinicalapps.app',upstream:'https://mercy-emr-credentials.jlkings85.chatgpt.site'}};
export function appAuth(env,module){const config=APPS[module];if(!config)throw Error('Unknown app');return betterAuth({appName:'ClinicalApps '+module,baseURL:config.origin,secret:env.SITES_AUTH_SECRET,database:drizzleAdapter(drizzle(env.DB,{schema}),{provider:'sqlite',schema,transaction:false}),trustedOrigins:[config.origin],account:{accountLinking:{enabled:true,trustedProviders:['mercy-hub']}},session:{expiresIn:28800,updateAge:3600,cookieCache:{enabled:false}},advanced:{cookiePrefix:'clinicalapps-'+module,useSecureCookies:true,ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},rateLimit:{enabled:true,storage:'database',window:60,max:60},plugins:[genericOAuth({config:[{providerId:'mercy-hub',clientId:'clinical-'+module,discoveryUrl:env.HUB_ORIGIN+'/api/auth/.well-known/openid-configuration',requireIdTokenVerification:true,pkce:true,scopes:['openid','email','profile'],tokenEndpointAuth:{method:'none'},disableSignUp:true,disableImplicitSignUp:true,getUserInfo:async tokens=>{const r=await fetch(env.HUB_ORIGIN+'/api/auth/oauth2/userinfo',{headers:{Authorization:'Bearer '+tokens.accessToken},signal:AbortSignal.timeout(10000)});return r.ok?r.json():null;},mapProfileToUser:async p=>{const g=await liveGrant(env,p.sub,module);if(p.email_verified!==true||!g||p.module_account?.module!==module||p.module_account.auth_user_id!==p.sub||g.account.email.toLowerCase()!==String(p.email).toLowerCase())throw Error('App access is not enabled.');return {name:g.account.name,email:g.account.email,emailVerified:true};}}]})]});}
const json=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function gateway(request,env,context,transport=fetch){
 const url=new URL(request.url),module=Object.keys(APPS).find(id=>APPS[id].origin===url.origin);if(!module)return json('Unknown application.',404);
 const config=APPS[module],auth=appAuth(env,module);
 if(url.pathname==='/suite-login'&&request.method==='GET')return startSharedLogin(request,{...env,BETTER_AUTH_URL:config.origin},r=>auth.handler(r),'/');
 if(url.pathname.startsWith('/api/auth/')){if(!['/api/auth/callback/mercy-hub','/api/auth/sign-out','/api/auth/get-session'].includes(url.pathname))return json('Not found.',404);return auth.handler(request);}
 const session=await auth.api.getSession({headers:request.headers});
 if(!session?.user.emailVerified)return request.method==='GET'&&!url.pathname.startsWith('/api/')?Response.redirect(config.origin+'/suite-login',302):json('Sign in to ClinicalApps.',401);
 const grant=await liveGrant(env,session.user.id,module);if(!grant)return json('Your administrator has not enabled access to this app.',403);
 if(!['GET','HEAD','OPTIONS'].includes(request.method)&&(request.headers.get('origin')!==config.origin||request.headers.get('sec-fetch-site')==='cross-site'))return json('Submit this request from this application.',403);
 const headers=new Headers(request.headers);
 for(const name of [...headers.keys()])if(name.startsWith('oai-')||name.startsWith('x-clinicalapps-')||name.startsWith('x-forwarded-')||['cookie','authorization','host','forwarded'].includes(name))headers.delete(name);
 const identity={id:session.user.id,email:session.user.email,name:session.user.name,role:grant.account.role};
 headers.set('X-ClinicalApps-Identity',await signIdentity(env[module.toUpperCase()+'_SIGNING_SECRET'],identity,module,request));
 headers.set('OAI-Sites-Authorization','Bearer '+env[module.toUpperCase()+'_SITE_TOKEN']);
 // The browser Origin is validated above. The private app validates this
 // canonical backend Origin and the independently signed person identity.
 if(headers.has('origin'))headers.set('origin',config.upstream);
 const upstream=new URL(url.pathname+url.search,config.upstream);
 const response=await transport(new Request(upstream,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?null:request.body,redirect:'manual',duplex:'half'}));
 const outgoing=new Headers(response.headers);outgoing.delete('set-cookie');outgoing.set('Cache-Control','private, no-store');outgoing.set('Referrer-Policy','same-origin');outgoing.set('X-Content-Type-Options','nosniff');
 const location=outgoing.get('location');if(location){const next=new URL(location,config.upstream);if(next.origin===config.upstream)outgoing.set('location',config.origin+next.pathname+next.search+next.hash);else return json('The private app connection is unavailable.',502);}
 return new Response(response.body,{status:response.status,headers:outgoing});
}
export default {async fetch(request,env,context){try{return await gateway(request,env,context);}catch(e){console.error('Shared app request failed',{type:e?.name});return json('The app connection is temporarily unavailable.',503);}}};

export {Provisioning} from "./provisioning.mjs";
