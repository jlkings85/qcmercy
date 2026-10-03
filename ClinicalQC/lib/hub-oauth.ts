import {genericOAuth} from 'better-auth/plugins';
export function hubOAuth(db:D1Database,hubOrigin:string){
 if(new URL(hubOrigin).origin!==hubOrigin||!hubOrigin.startsWith('https://'))throw Error('Invalid Mercy EMS identity address.');
 return genericOAuth({config:[{
  providerId:'mercy-hub',name:'Mercy EMS',clientId:'clinical-qc',
  discoveryUrl:hubOrigin+'/api/auth/.well-known/openid-configuration',requireIdTokenVerification:true,
  scopes:['openid','email','profile'],pkce:true,tokenEndpointAuth:{method:'none'},disableSignUp:true,disableImplicitSignUp:true,
  getUserInfo:async tokens=>{
   const response=await fetch(hubOrigin+'/api/auth/oauth2/userinfo',{headers:{Authorization:'Bearer '+tokens.accessToken},signal:AbortSignal.timeout(10000)});
   if(!response.ok)return null;
   return await response.json() as any;
  },
  mapProfileToUser:async profile=>{
   const mapping=profile.module_account as {module?:string;auth_user_id?:string;local_id?:string;email?:string}|undefined;
   if(profile.email_verified!==true||mapping?.module!=='qc'||mapping.auth_user_id!==profile.sub)throw Error('Unlinked Mercy EMS account.');
   const local=await db.prepare(`SELECT u.id,u.email,u.name FROM auth_user u JOIN qc_login_links l ON l.auth_user_id=u.id JOIN operators o ON o.id=l.operator_id
    JOIN hub_grants g ON g.user_id=u.id AND g.module='qc' AND g.local_id=o.id JOIN hub_members m ON m.user_id=u.id
    WHERE u.id=? AND o.id=? AND o.active=1 AND u.email_verified=1 AND m.enabled=1 AND g.enabled=1`).bind(String(profile.sub),String(mapping.local_id)).first<{id:string;email:string;name:string}>();
   if(!local||local.email.toLowerCase()!==String(profile.email).toLowerCase())throw Error('Mercy EMS access is not enabled for this QC profile.');
   return {email:local.email,emailVerified:true,name:local.name};
  },
 }]});
}
