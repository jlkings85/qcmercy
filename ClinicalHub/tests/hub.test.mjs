import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {build} from 'esbuild';
import {hashPassword} from 'better-auth/crypto';
mkdirSync('test-results',{recursive:true});
await build({entryPoints:['worker.mjs'],outfile:'test-results/worker.mjs',bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.html':'text','.css':'text','.txt':'text'}});
await build({entryPoints:['auth.mjs'],outfile:'test-results/auth.mjs',bundle:true,format:'esm',platform:'node',packages:'external'});
await build({entryPoints:['../ClinicalQC/lib/auth-config.ts'],outfile:'test-results/qc-auth.mjs',bundle:true,format:'esm',platform:'node',packages:'external'});
const shiftsRoot=process.env.CLINICALSHIFTS_SOURCE||'../../clinicalshifts';
const hasShiftsSource=existsSync(shiftsRoot+'/lib/auth-config.ts');
if(hasShiftsSource)await build({entryPoints:[shiftsRoot+'/lib/auth-config.ts'],outfile:'test-results/shifts-auth.mjs',bundle:true,format:'esm',platform:'node',packages:'external'});
const {default:worker}=await import('../test-results/worker.mjs');
const {createHubAuth}=await import('../test-results/auth.mjs');
const {createClinicalAuth}=await import('../test-results/qc-auth.mjs');
const createShiftsAuth=hasShiftsSource?(await import('../test-results/shifts-auth.mjs')).createClinicalAuth:null;
function adapter(sql){function prepare(query,args=[]){return {bind(...a){return prepare(query,a);},async first(){return sql.prepare(query).get(...args)||null;},async all(){const results=sql.prepare(query).all(...args);return{results,meta:{changes:Number(sql.prepare('SELECT changes() n').get().n)}};},async raw(){const s=sql.prepare(query);s.setReturnArrays(true);return s.all(...args);},async run(){return{meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}return{prepare,async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.all());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};}
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('../ClinicalQC/drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('../ClinicalQC/drizzle/'+f,'utf8'));
sql.exec(readFileSync('migrations/0001_hub.sql','utf8'));
const env={DB:adapter(sql),HUB_ORIGIN:'https://hub.test',HUB_SECRET:'testing-only-long-secret-not-for-any-production-environment'};
const password='Testing-only-strong-password-2026!';const hash=await hashPassword(password);
for(const [id,role]of [['owner','admin'],['staff','operator'],['outsider','operator']]){
 sql.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(id,id,id+'@example.test',Date.now(),Date.now());
 sql.prepare('INSERT INTO auth_account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,\'credential\',?,?,?,?)').run(id,id,id,hash,Date.now(),Date.now());
 sql.prepare('INSERT INTO operators(id,name,email,role) VALUES(?,?,?,?)').run(id,id,id+'@example.test',role);
 sql.prepare('INSERT INTO qc_login_links(operator_id,auth_user_id,created_at,event_id) VALUES(?,?,?,?)').run(id,id,new Date().toISOString(),id);
 if(id!=='outsider'){
  sql.prepare('INSERT INTO hub_members(user_id,is_admin,enabled,created_at) VALUES(?,?,1,?)').run(id,role==='admin'?1:0,new Date().toISOString());
  sql.prepare('INSERT INTO hub_grants(user_id,module,local_id,enabled,updated_at) VALUES(?,\'qc\',?,1,?)').run(id,id,new Date().toISOString());
 }
}
sql.prepare('INSERT INTO hub_oauthClient(id,clientId,name,redirectUris,scopes,grantTypes,responseTypes,tokenEndpointAuthMethod,requirePKCE,skipConsent,disabled,applicationType) VALUES(?,?,?,?,?,?,?,?,1,1,0,?)').run('qc','clinical-qc','ClinicalQC',JSON.stringify(['https://qc.test/api/auth/callback/mercy-hub']),JSON.stringify(['openid','email','profile']),JSON.stringify(['authorization_code']),JSON.stringify(['code']),'none','web');
async function call(path,{body,cookie,headers={},method=body?'POST':'GET'}={}){return worker.fetch(new Request('https://hub.test'+path,{method,headers:{...(body?{'Content-Type':'application/json',Origin:'https://hub.test'}:{}),...(cookie?{cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),env);}
const cookies=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function login(email){const r=await call('/api/auth/sign-in/email',{body:{email,password}});assert.equal(r.status,200,await r.clone().text());return cookies(r);}
let ownerCookie,staffCookie;
test('authenticated dashboard, role boundaries, and exact historical links',async()=>{
 assert.equal((await call('/api/dashboard')).status,401);
 assert.equal((await call('/api/auth/sign-in/email',{body:{email:'outsider@example.test',password}})).status,401);
 ownerCookie=await login('owner@example.test');staffCookie=await login('staff@example.test');
 const d=await (await call('/api/dashboard',{cookie:ownerCookie})).json();assert.equal(d.user.isAdmin,true);assert.equal(d.modules.length,5);assert.equal(d.modules.find(m=>m.id==='qc').connected,false);
 const sd=await (await call('/api/dashboard',{cookie:staffCookie})).json();assert.equal(sd.user.isAdmin,false);assert.deepEqual(sd.modules.map(m=>m.id),['qc','guidelines']);
 assert.equal((await call('/api/admin/accounts',{cookie:staffCookie})).status,403);
 assert.equal((await call('/api/dashboard',{cookie:ownerCookie+'tampered'})).status,401);
 assert.equal((await call('/api/admin/grants',{cookie:ownerCookie,body:{userId:'staff',module:'qc',localId:'staff',enabled:false},headers:{Origin:'https://evil.test'}})).status,403);
 assert.equal((await call('/api/admin/grants',{cookie:ownerCookie,body:{userId:'staff',module:'qc',localId:'owner',enabled:true}})).status,400);
 assert.equal((await call('/api/auth/sign-up/email',{body:{email:'new@example.test',password,name:'New'}})).status,404);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM operators').get().n,3);
});
test('OAuth uses exact redirect URIs, S256 PKCE and one-time authorization codes',async()=>{
 const verifier='a-very-long-random-test-verifier-for-pkce-12345678901234567890';
 const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
 const params=new URLSearchParams({client_id:'clinical-qc',redirect_uri:'https://qc.test/api/auth/callback/mercy-hub',response_type:'code',scope:'openid email profile',state:'test-state-123456789',code_challenge:challenge,code_challenge_method:'S256'});
 const bad=new URLSearchParams(params);bad.set('redirect_uri','https://evil.test/callback');
 const invalid=await call('/api/auth/oauth2/authorize?'+bad,{cookie:ownerCookie});assert.ok(invalid.status>=400||(invalid.headers.get('location')?.includes('error=')&&!invalid.headers.get('location')?.startsWith('https://evil.test')),JSON.stringify({status:invalid.status,location:invalid.headers.get('location'),text:await invalid.text()}));
 const noPkce=new URLSearchParams(params);noPkce.delete('code_challenge');noPkce.delete('code_challenge_method');
 const missing=await call('/api/auth/oauth2/authorize?'+noPkce,{cookie:ownerCookie});const missingText=await missing.clone().text();assert.ok(missing.status>=400||missing.headers.get('location')?.includes('error='),missingText);
 const authorize=await call('/api/auth/oauth2/authorize?'+params,{cookie:ownerCookie});
 let dest=authorize.headers.get('location');if(!dest){const b=await authorize.json();dest=b.url;}
 assert.ok(dest,'Authorization redirect');const result=new URL(dest);assert.equal(result.origin,'https://qc.test');assert.equal(result.searchParams.get('state'),'test-state-123456789');
 const code=result.searchParams.get('code');assert.ok(code);
 const tokenBody=new URLSearchParams({grant_type:'authorization_code',client_id:'clinical-qc',redirect_uri:params.get('redirect_uri'),code,code_verifier:verifier});
 const tokenRequest=()=>new Request('https://hub.test/api/auth/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:tokenBody});
 const tokenResponse=await worker.fetch(tokenRequest(),env);assert.equal(tokenResponse.status,200,await tokenResponse.clone().text());
 const tokens=await tokenResponse.json();assert.ok(tokens.access_token);assert.ok(tokens.id_token);
 const userInfo=await call('/api/auth/oauth2/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}});assert.equal(userInfo.status,200,await userInfo.clone().text());
 const identity=await userInfo.json();assert.equal(identity.sub,'owner');assert.equal(identity.module_account.local_id,'owner');
 sql.prepare('UPDATE hub_grants SET enabled=0 WHERE user_id=\'owner\'').run();
 assert.equal((await call('/api/auth/oauth2/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}})).status,403);
 sql.prepare('UPDATE hub_grants SET enabled=1 WHERE user_id=\'owner\'').run();
 assert.ok((await worker.fetch(tokenRequest(),env)).status>=400,'Authorization codes are single-use');
});
test('ClinicalQC signs in through the hub and preserves the existing user and operator IDs',async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init);if(new URL(req.url).origin==='https://hub.test')return worker.fetch(req,env);throw Error('Unexpected network call in local SSO test: '+new URL(req.url).origin);};
 try{
  const qc=createClinicalAuth({db:env.DB,baseUrl:'https://qc.test',secret:'test-qc-secret-independent-of-the-hub-and-long-enough',ownerEmail:'owner@example.test',setupToken:'',hubOrigin:env.HUB_ORIGIN,sendEmail:async()=>{throw Error('No email should be sent');}});
  const start=await qc.handler(new Request('https://qc.test/api/auth/sign-in/social',{method:'POST',headers:{Origin:'https://qc.test','Content-Type':'application/json'},body:JSON.stringify({provider:'mercy-hub',callbackURL:'/'})}));
  assert.equal(start.status,200,await start.clone().text());const data=await start.json();assert.equal(new URL(data.url).origin,'https://hub.test');
  const authorize=await worker.fetch(new Request(data.url,{headers:{cookie:ownerCookie}}),env);
  const callbackURL=authorize.headers.get('location')||(await authorize.json()).url;
  assert.ok(callbackURL,'Hub returns callback URL');
  const callback=await qc.handler(new Request(callbackURL,{headers:{cookie:cookies(start)}}));
  assert.ok(!callback.headers.get('location')?.includes('error='),callback.headers.get('location'));
  const session=await qc.api.getSession({headers:new Headers({cookie:cookies(callback)})});
  assert.equal(session?.user.id,'owner');assert.equal(sql.prepare('SELECT COUNT(*) n FROM auth_user').get().n,3);
  assert.equal(sql.prepare('SELECT operator_id FROM qc_login_links WHERE auth_user_id=\'owner\'').get().operator_id,'owner');
 }finally{globalThis.fetch=originalFetch;}
});
test('ClinicalShifts cross-email link uses only the explicit verified profile, preserving its role',{skip:!hasShiftsSource},async()=>{
 const shiftsSql=new DatabaseSync(':memory:');shiftsSql.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync(shiftsRoot+'/drizzle').filter(f=>f.endsWith('.sql')).sort())shiftsSql.exec(readFileSync(shiftsRoot+'/drizzle/'+f,'utf8'));
 const shiftsDb=adapter(shiftsSql);env.SHIFTS_DB=shiftsDb;
 shiftsSql.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES(\'shift-auth\',\'Existing Owner\',\'different@example.test\',1,?,?)').run(Date.now(),Date.now());
 shiftsSql.prepare('INSERT INTO people(id,auth_id,name,email,role,created_at) VALUES(\'historical-person\',\'shift-auth\',\'Existing Owner\',\'different@example.test\',\'admin\',?)').run(new Date().toISOString());
 sql.prepare('INSERT INTO hub_grants(user_id,module,local_id,enabled,updated_at) VALUES(\'owner\',\'shifts\',\'historical-person\',1,?)').run(new Date().toISOString());
 sql.prepare('INSERT INTO hub_oauthClient(id,clientId,name,redirectUris,scopes,grantTypes,responseTypes,tokenEndpointAuthMethod,requirePKCE,skipConsent,disabled,applicationType) VALUES(?,?,?,?,?,?,?,?,1,1,0,?)').run('shifts','clinical-shifts','ClinicalShifts',JSON.stringify(['https://shifts.test/api/auth/callback/mercy-hub']),JSON.stringify(['openid','email','profile']),JSON.stringify(['authorization_code']),JSON.stringify(['code']),'none','web');
 const originalFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init);if(new URL(req.url).origin==='https://hub.test')return worker.fetch(req,env);throw Error('Unexpected network call');};
 try{
  const shifts=createShiftsAuth({db:shiftsDb,hubDb:env.DB,baseUrl:'https://shifts.test',secret:'another-distinct-long-secret-used-only-in-this-test',ownerEmail:'different@example.test',setupToken:'',hubOrigin:env.HUB_ORIGIN,sendEmail:async()=>{throw Error('No email');}});
  const start=await shifts.handler(new Request('https://shifts.test/api/auth/sign-in/social',{method:'POST',headers:{Origin:'https://shifts.test','Content-Type':'application/json'},body:JSON.stringify({provider:'mercy-hub',callbackURL:'/'})}));assert.equal(start.status,200,await start.clone().text());
  const {url}=await start.json();const authorization=await worker.fetch(new Request(url,{headers:{cookie:ownerCookie}}),env);
  const callbackURL=authorization.headers.get('location')||(await authorization.json()).url;
  const callback=await shifts.handler(new Request(callbackURL,{headers:{cookie:cookies(start)}}));assert.ok(!callback.headers.get('location')?.includes('error='),callback.headers.get('location'));
  const session=await shifts.api.getSession({headers:new Headers({cookie:cookies(callback)})});assert.equal(session?.user.id,'shift-auth');assert.equal(session?.user.email,'different@example.test');
  assert.equal(shiftsSql.prepare('SELECT role FROM people WHERE id=\'historical-person\'').get().role,'admin');assert.equal(shiftsSql.prepare('SELECT COUNT(*) n FROM auth_user').get().n,1);
 }finally{globalThis.fetch=originalFetch;}
});
test('access changes are audited, do not alter module records, and disabled members are denied',async()=>{
 const r=await call('/api/admin/grants',{cookie:ownerCookie,body:{userId:'staff',module:'qc',localId:'staff',enabled:false}});assert.equal(r.status,200,await r.text());
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM hub_audit').get().n,1);
 assert.equal(sql.prepare('SELECT active FROM operators WHERE id=\'staff\'').get().active,1);
 const d=await (await call('/api/dashboard',{cookie:staffCookie})).json();assert.deepEqual(d.modules.map(m=>m.id),['guidelines']);
 sql.prepare('UPDATE hub_members SET enabled=0 WHERE user_id=\'staff\'').run();assert.equal((await call('/api/dashboard',{cookie:staffCookie})).status,401);
 const html=await call('/');assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const r2=await call('/api/auth/sign-out',{cookie:ownerCookie,body:{}});assert.equal(r2.status,200);assert.equal((await call('/api/dashboard',{cookie:ownerCookie})).status,401);
});
