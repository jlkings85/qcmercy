import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import {createClinicalAuth} from './auth-config';
import {runtimeValues,sendEmail} from './email';
import {execution} from './execution';
export function authRuntime(){
 const c=runtimeValues();
 if(!env.DB||!c.BETTER_AUTH_URL||!c.BETTER_AUTH_SECRET||!c.QC_OWNER_EMAIL)throw Error('ClinicalQC login is awaiting deployment configuration.');
 const context=execution.getStore();
 return {db:env.DB,baseUrl:c.BETTER_AUTH_URL,secret:c.BETTER_AUTH_SECRET,ownerEmail:c.QC_OWNER_EMAIL,setupToken:c.QC_SETUP_TOKEN||'',...(c.HUB_LOGIN_ENABLED==='true'&&c.HUB_ORIGIN?{hubOrigin:c.HUB_ORIGIN}:{}),sendEmail,...context?{background:(promise:Promise<unknown>)=>context.waitUntil(promise)}:{}};
}
export function authentication(){return createClinicalAuth(authRuntime());}
export async function getCurrentUser(request?:Request){
 const result=await authentication().api.getSession({headers:request?.headers||await headers()});
 if(!result?.user.emailVerified)return null;
 const config=runtimeValues();
 if(config.HUB_LOGIN_ENABLED==='true'){
  const access=await authRuntime().db.prepare("SELECT g.enabled,m.enabled member_enabled FROM hub_grants g JOIN hub_members m ON m.user_id=g.user_id WHERE g.user_id=? AND g.module='qc'").bind(result.user.id).first<{enabled:number;member_enabled:number}>();
  if(access&&(!access.enabled||!access.member_enabled))return null;
 }
 return {userId:result.user.id,email:result.user.email,fullName:result.user.name};
}
export function applicationUrl(path:string){return new URL(path,authRuntime().baseUrl).href;}
