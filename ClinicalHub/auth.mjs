import {betterAuth} from 'better-auth';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {drizzle} from 'drizzle-orm/d1';
import {jwt} from 'better-auth/plugins';
import {oauthProvider} from '@better-auth/oauth-provider';
import {createAuthMiddleware,APIError,getSessionFromCtx} from 'better-auth/api';
import {schema} from './schema.mjs';
import {member,liveGrant} from './access.mjs';
export function createHubAuth(env){
 if(!env.HUB_SECRET||env.HUB_SECRET.length<32)throw Error('Shared login is not configured.');
 return betterAuth({
  appName:'Mercy EMS',baseURL:env.HUB_ORIGIN,secret:env.HUB_SECRET,
  database:drizzleAdapter(drizzle(env.DB,{schema}),{provider:'sqlite',schema,transaction:false}),
  trustedOrigins:[env.HUB_ORIGIN],
  emailAndPassword:{enabled:true,disableSignUp:true,requireEmailVerification:true,minPasswordLength:12,maxPasswordLength:128,revokeSessionsOnPasswordReset:true},
  session:{expiresIn:28800,updateAge:3600,cookieCache:{enabled:false}},
  account:{accountLinking:{enabled:false}},user:{changeEmail:{enabled:false}},
  advanced:{cookiePrefix:'mercy-hub',useSecureCookies:true,ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
  rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/sign-in/email':{window:60,max:5}}},
  disabledPaths:['/token','/update-user','/change-email','/delete-user','/sign-up/email','/request-password-reset','/reset-password','/send-verification-email'],
  plugins:[jwt(),oauthProvider({
   loginPage:'/login',consentPage:'/consent',grantTypes:['authorization_code'],scopes:['openid','email','profile'],
   allowDynamicClientRegistration:false,allowUnauthenticatedClientRegistration:false,clientPrivileges:()=>false,
   customUserInfoClaims:async({user,jwt:claims})=>{
    const module=String(claims.client_id||claims.azp||'').replace(/^clinical-/, '');
    const g=await liveGrant(env,user.id,module);
    if(!g)throw new APIError('FORBIDDEN',{message:'Module access is not enabled.'});
    return {module_account:{module,local_id:g.local_id,auth_user_id:g.account.auth_user_id,email:g.account.email,role:g.account.role}};
   },
  })],
  hooks:{before:createAuthMiddleware(async ctx=>{
   if(ctx.path==='/sign-in/email'){
    const email=String(ctx.body?.email||'').trim().toLowerCase();
    const row=await env.DB.prepare('SELECT m.user_id FROM hub_members m JOIN auth_user u ON u.id=m.user_id WHERE lower(u.email)=? AND m.enabled=1 AND u.email_verified=1').bind(email).first();
    if(!row)throw new APIError('UNAUTHORIZED',{message:'Invalid email or password.'});
   }
   if(ctx.path==='/oauth2/authorize'){
    const session=await getSessionFromCtx(ctx);
    if(session){
     const module=String(ctx.query?.client_id||'').replace(/^clinical-/,'');
     if(!session.user.emailVerified||!await liveGrant(env,session.user.id,module))throw new APIError('FORBIDDEN',{message:'Your administrator has not linked an active account for this module.'});
    }
   }
  })},
 });
}
