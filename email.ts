import {env} from 'cloudflare:workers';
export function runtimeValues(){return env as unknown as Record<string,string|undefined>;}
export async function sendEmail(to:string,subject:string,text:string,idempotencyKey?:string){
 const config=runtimeValues();if(!config.RESEND_API_KEY||!config.QC_EMAIL_FROM)throw Error('Email delivery is not configured.');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.RESEND_API_KEY,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:JSON.stringify({from:config.QC_EMAIL_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('The email provider did not accept this message.');
 const result=await response.json() as {id?:string};if(!result.id)throw Error('Email delivery could not be confirmed.');return result.id;
}
