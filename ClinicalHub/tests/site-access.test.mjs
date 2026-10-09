import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {build} from 'esbuild';
import {signIdentity,verifyIdentity} from '../sites/assertion.mjs';
function adapter(sql){function prepare(q,args=[]){return{bind(...a){return prepare(q,a);},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return{meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}};}return{prepare,async batch(s){sql.exec('BEGIN');try{const r=[];for(const x of s)r.push(await x.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};}
const secret='tests-only-shared-signature-secret-not-for-production';
const user={id:'person-a',email:'a@example.test',name:'Person A',role:'member'},other={...user,id:'person-b',email:'b@example.test'},admin={...user,id:'admin',role:'admin'};
test('signed identity rejects tampering, wrong app, method, path and expiry',async()=>{
 const request=new Request('https://forms.clinicalapps.app/api/forms'),token=await signIdentity(secret,user,'forms',request);
 assert.equal((await verifyIdentity(secret,token,'forms',request)).id,user.id);
 for(const [s,t,m,r]of [[secret,token+'x','forms',request],[secret,token,'credentials',request],[secret,token,'forms',new Request(request.url,{method:'POST'})],[secret,token,'forms',new Request(request.url+'?other=1')],['wrong-but-long-enough-secret-for-this-test',token,'forms',request]])await assert.rejects(verifyIdentity(s,t,m,r));
 const now=Date.now;Date.now=()=>now()+60000;try{await assert.rejects(verifyIdentity(secret,token,'forms',request));}finally{Date.now=now;}
});
async function harness(root,module,exports){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync(root+'/drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+file,'utf8'));
 globalThis['__'+module]={DB:adapter(sql),BUCKET:{put:async()=>{},get:async()=>({body:'file'})}};
 mkdirSync('test-results',{recursive:true});
 await build({stdin:{contents:exports+`\nexport {runSharedIdentity} from '${root}/lib/shared-identity.ts';`,resolveDir:root,loader:'ts'},outfile:`test-results/site-${module}.mjs`,bundle:true,platform:'node',format:'esm',alias:{'@':root},plugins:[{name:'test-runtime',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'runtime',namespace:'test'}));b.onResolve({filter:/chatgpt-auth/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='runtime'?`export const env=globalThis.__${module};`:'export const getChatGPTUser=async()=>null;',loader:'js'}));}}]});
 const api=await import(`../test-results/site-${module}.mjs`);
 async function call(who,path,handler,body){const request=new Request('https://'+module+'.clinicalapps.app'+path,{method:body?'POST':'GET',headers:body?{Origin:'https://'+module+'.clinicalapps.app','content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});if(who)request.headers.set('X-ClinicalApps-Identity',await signIdentity(secret,who,module,request));return api.runSharedIdentity(request,secret,()=>handler(request));}
 return{sql,api,call};
}
test('Forms members cannot access other submissions or files, edit forms, or resolve reviews',{skip:!process.env.FORMS_SOURCE},async()=>{
 const root=process.env.FORMS_SOURCE;const {sql,api,call}=await harness(root,'forms',`export * as forms from '${root}/app/api/forms/route.ts';export * as submissions from '${root}/app/api/submissions/route.ts';export * as uploads from '${root}/app/api/uploads/route.ts';`);
 assert.equal((await call(null,'/api/forms',api.forms.GET)).status,401);
 assert.equal((await call(user,'/api/forms',api.forms.POST,{})).status,403);
 const forms=await (await call(user,'/api/forms',api.forms.GET)).json();assert.equal(forms.length,2);
 const draft={id:'stable-draft-id',formId:forms[0].id,version:forms[0].version,draft:true,answers:{}};
 const saved=await call(user,'/api/submissions',api.submissions.POST,draft);assert.equal(saved.status,200,await saved.clone().text());
 assert.equal((await call(other,'/api/submissions',api.submissions.POST,draft)).status,404);
 assert.equal((await (await call(other,'/api/submissions',api.submissions.GET)).json()).length,0);
 assert.equal((await (await call(user,'/api/submissions',api.submissions.GET)).json()).length,1);
 assert.equal((await call(user,'/api/submissions',api.submissions.PATCH,{id:draft.id,status:'resolved',note:'x'})).status,403);
 sql.prepare('INSERT INTO uploads(id,name,type,size,created_at,owner_id) VALUES(?,?,?,?,?,?)').run('file-a','a.pdf','application/pdf',1,'now',user.id);
 assert.equal((await call(other,'/api/uploads?id=file-a',api.uploads.GET)).status,404);
 assert.equal((await call(user,'/api/uploads?id=file-a',api.uploads.GET)).status,200);
 sql.prepare('UPDATE submissions SET owner_id=NULL WHERE id=?').run(draft.id);
 assert.equal((await (await call(user,'/api/submissions',api.submissions.GET)).json()).length,0);
 assert.equal((await (await call(admin,'/api/submissions',api.submissions.GET)).json()).length,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
});
test('Credentials shared identity retains historical person IDs and restricts member access',{skip:!process.env.CREDENTIALS_SOURCE},async()=>{
 const root=process.env.CREDENTIALS_SOURCE;const {sql,api,call}=await harness(root,'credentials',`export * as server from '${root}/lib/server.ts';`);
 sql.prepare('INSERT INTO program(id,owner_id,owner_email,created_at,catalog_version) VALUES(?,?,?,?,1)').run('mercy','historical-owner','owner@example.test','now');
 sql.prepare('INSERT INTO people(id,name,email,user_id,agency,created_at) VALUES(?,?,?,?,?,?)').run('old-person','A',user.email,'historical-person-auth','','now');
 const own=await call(user,'/check',async()=>Response.json(await api.server.personAccess('old-person')));assert.equal((await own.json()).user.userId,'historical-person-auth');
 await assert.rejects(call(other,'/check',()=>api.server.personAccess('old-person')),e=>e.status===403);
 await assert.rejects(call(user,'/check',()=>api.server.administrator()),e=>e.status===403);
 await call(admin,'/check',()=>api.server.administrator());
 assert.equal(sql.prepare('SELECT owner_id FROM program').get().owner_id,'historical-owner');
 assert.equal(sql.prepare('SELECT user_id FROM people').get().user_id,'historical-person-auth');
});
