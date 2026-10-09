import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {verifyIdentity} from '../sites/assertion.mjs';
await build({entryPoints:['sites/provisioning.mjs'],outfile:'test-results/provisioning.mjs',bundle:true,format:'esm',platform:'node',plugins:[{name:'cf-rpc-test',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cf',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export class WorkerEntrypoint {constructor(env){this.env=env}}'}));}}]});
const {Provisioning}=await import('../test-results/provisioning.mjs');
test('credential directory RPC checks the administrator and signs only the fixed private endpoint',async()=>{
 const secret='test-credential-signing-secret-at-least-32-characters';let calls=0;
 const env={DB:{prepare:()=>({bind:id=>({first:async()=>id==='admin'?{id,name:'Admin',email:'admin@example.test'}:null})})},CREDENTIALS_SIGNING_SECRET:secret,CREDENTIALS_SITE_TOKEN:'private-token'};
 const rpc=new Provisioning(env),original=globalThis.fetch;
 globalThis.fetch=async(request,opts)=>{calls++;assert.equal(request.url,'https://mercy-emr-credentials.jlkings85.chatgpt.site/api/credentials');assert.equal(opts.redirect,'manual');assert.equal(request.headers.get('OAI-Sites-Authorization'),'Bearer private-token');const user=await verifyIdentity(secret,request.headers.get('X-ClinicalApps-Identity'),'credentials',request);assert.equal(user.id,'admin');assert.equal(user.role,'admin');assert.deepEqual(await request.json(),{action:'directoryPerson',name:'New',email:'new@example.test'});return Response.json({id:'preserved'});};
 try{await assert.rejects(rpc.provisionCredentialPerson('member',{name:'New',email:'new@example.test'}));assert.equal(calls,0);await rpc.provisionCredentialPerson('admin',{name:'New',email:'new@example.test'});assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
