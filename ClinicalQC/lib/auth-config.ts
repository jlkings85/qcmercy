import {betterAuth} from 'better-auth';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {createAuthMiddleware,APIError} from 'better-auth/api';
import {drizzle} from 'drizzle-orm/d1';
import * as schema from '../db/auth-schema';
import {hubOAuth} from './hub-oauth';

export type AuthRuntime={db:D1Database;baseUrl:string;secret:string;ownerEmail:string;setupToken:string;hubOrigin?:string;sendEmail:(to:string,subject:string,text:string)=>Promise<unknown>;background?:(promise:Promise<unknown>)=>void};
export const emailKey=(value:string)=>value.trim().toLowerCase();
export async function tokenHash(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function validEnrollment(db:D1Database,email:string,code:string){
 if(!code||code.length>120)return false;
 return !!await db.prepare(`SELECT o.id FROM qc_invitations i JOIN operators o ON o.id=i.operator_id
 WHERE i.token_hash=? AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>?
 AND lower(trim(o.email))=? AND o.active=1 AND NOT EXISTS(SELECT 1 FROM qc_login_links l WHERE l.operator_id=o.id)`).bind(await tokenHash(code),new Date().toISOString(),emailKey(email)).first();
}
export async function validOwnerEnrollment(runtime:AuthRuntime,email:string,code:string){
 if(emailKey(email)!==emailKey(runtime.ownerEmail)||runtime.setupToken.length<32||!code||code.length>120||await tokenHash(code)!==await tokenHash(runtime.setupToken))return false;
 return !!await runtime.db.prepare(`SELECT o.id FROM operators o WHERE lower(trim(o.email))=? AND o.active=1 AND o.role='admin'
 AND NOT EXISTS(SELECT 1 FROM qc_login_links l JOIN operators a ON a.id=l.operator_id WHERE a.role='admin')`).bind(emailKey(email)).first();
}
export function createClinicalAuth(runtime:AuthRuntime){
 const origin=new URL(runtime.baseUrl).origin;
 if(runtime.secret.length<32)throw Error('Set a strong BETTER_AUTH_SECRET before enabling login.');
 if(!origin.startsWith('https://')&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))throw Error('BETTER_AUTH_URL must use HTTPS outside local development.');
 return betterAuth({
  appName:'ClinicalQC',baseURL:origin,secret:runtime.secret,
  database:drizzleAdapter(drizzle(runtime.db,{schema}),{provider:'sqlite',schema,transaction:false}),
  trustedOrigins:[origin],
  emailAndPassword:{enabled:true,requireEmailVerification:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:false,revokeSessionsOnPasswordReset:true,
   sendResetPassword:async({user,url})=>{await runtime.sendEmail(user.email,'Reset your ClinicalQC password','Use this link to choose a new password. If you did not request this, you can ignore this email.\n\n'+url);}},
  emailVerification:{sendOnSignUp:true,autoSignInAfterVerification:false,expiresIn:3600,
   sendVerificationEmail:async({user,url})=>{await runtime.sendEmail(user.email,'Verify your ClinicalQC email','Verify your email address to activate your login. Your administrator controls your QC access and testing credentials.\n\n'+url);}},
  session:{expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
  account:{accountLinking:runtime.hubOrigin?{enabled:true,trustedProviders:['mercy-hub']}:{enabled:false}},
  plugins:runtime.hubOrigin?[hubOAuth(runtime.db,runtime.hubOrigin)]:[],
  user:{changeEmail:{enabled:false}},
  rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/sign-in/email':{window:60,max:5},'/sign-up/email':{window:60,max:5},'/request-password-reset':{window:60,max:3},'/send-verification-email':{window:60,max:3}}},
  advanced:{...(runtime.background?{backgroundTasks:{handler:runtime.background}}:{}),cookiePrefix:'clinicalqc',useSecureCookies:origin.startsWith('https://'),ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
  hooks:{before:createAuthMiddleware(async ctx=>{
   if(ctx.path!=='/sign-up/email')return;
   const email=emailKey(String(ctx.body?.email||''));
   const code=ctx.headers?.get('x-clinical-invitation')||'';
   const owner=await validOwnerEnrollment(runtime,email,code);
   if(!owner&&!await validEnrollment(runtime.db,email,code))throw new APIError('FORBIDDEN',{message:'Use the invitation and email address provided by your ClinicalQC administrator.'});
  })},
 });
}
