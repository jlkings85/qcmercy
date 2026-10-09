import {WorkerEntrypoint} from 'cloudflare:workers';
import {signIdentity} from './assertion.mjs';
// This named RPC entrypoint is only exposed through the hub's service binding.
export class Provisioning extends WorkerEntrypoint {
 async provisionCredentialPerson(actorId,person){
  const actor=await this.env.DB.prepare('SELECT u.id,u.email,u.name FROM auth_user u JOIN hub_members m ON m.user_id=u.id WHERE u.id=? AND u.email_verified=1 AND m.enabled=1 AND m.is_admin=1').bind(actorId).first();
  if(!actor)throw Error('Administrator access is required.');
  const url='https://mercy-emr-credentials.jlkings85.chatgpt.site/api/credentials';
  const request=new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://mercy-emr-credentials.jlkings85.chatgpt.site'},body:JSON.stringify({action:'directoryPerson',name:person.name,email:person.email})});
  request.headers.set('X-ClinicalApps-Identity',await signIdentity(this.env.CREDENTIALS_SIGNING_SECRET,{...actor,role:'admin'},'credentials',request));
  request.headers.set('OAI-Sites-Authorization','Bearer '+this.env.CREDENTIALS_SITE_TOKEN);
  const result=await fetch(request,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!result.ok)throw Error('Credential directory could not be updated. Retry the app access change.');
  await result.body?.cancel();return{ok:true};
 }
}
