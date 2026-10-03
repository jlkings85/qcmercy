// Real Better Auth handlers, Drizzle adapter, and all SQL migrations.
// In-memory database and intercepted email only. No live accounts or messages.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
function prepare(query,args=[]){const normalized=args.map(x=>typeof x==='boolean'?Number(x):x);return {bind(...a){return prepare(query,a);},async first(){return sql.prepare(query).get(...normalized)||null;},async all(){const results=sql.prepare(query).all(...normalized);return {results,meta:{changes:Number(sql.prepare('SELECT changes() n').get().n)}};},async raw(){const stmt=sql.prepare(query);stmt.setReturnArrays(true);return stmt.all(...normalized);},async run(){return {meta:{changes:Number(sql.prepare(query).run(...normalized).changes)}};}};}
const db={prepare,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const stmt of statements)result.push(await stmt.all());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const folder=mkdtempSync(join(process.cwd(),'.auth-test-'));
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
writeFileSync(join(folder,'auth-schema.mjs'),transpile(readFileSync('db/auth-schema.ts','utf8')));
writeFileSync(join(folder,'hub-oauth.mjs'),transpile(readFileSync('lib/hub-oauth.ts','utf8')));
writeFileSync(join(folder,'auth-config.mjs'),transpile(readFileSync('lib/auth-config.ts','utf8')).replace("'../db/auth-schema'","'./auth-schema.mjs'").replace("'./hub-oauth'","'./hub-oauth.mjs'"));
const {createClinicalAuth,tokenHash}=await import(pathToFileURL(join(folder,'auth-config.mjs')));
writeFileSync(join(folder,'enrollment.mjs'),transpile(readFileSync('lib/enrollment.ts','utf8')).replace("'./auth-config'","'./auth-config.mjs'"));
const {claimEnrollment,linkedOperator}=await import(pathToFileURL(join(folder,'enrollment.mjs')));
const messages=[];
const runtime={db,baseUrl:'https://clinical.test',secret:'test-only-authentication-secret-with-64-characters-never-deploy-this',ownerEmail:'owner@example.test',setupToken:'test-only-owner-setup-secret-at-least-32-characters',sendEmail:async(to,subject,text)=>{messages.push({to,subject,text});}};
const auth=createClinicalAuth(runtime);
const headers=(ip='192.0.2.1')=>({origin:'https://clinical.test','Content-Type':'application/json','cf-connecting-ip':ip});
async function post(path,body,extra={},expected=200){const result=await auth.handler(new Request('https://clinical.test/api/auth/'+path,{method:'POST',headers:{...headers(),...extra},body:JSON.stringify(body)}));const raw=await result.text();assert.equal(result.status,expected,path+': '+raw);return {response:result,body:JSON.parse(raw)};}
function lastUrl(){const found=messages.at(-1)?.text.match(/https:\/\/\S+/);assert.ok(found);return found[0];}
function cookie(result){return result.response.headers.getSetCookie().filter(x=>x.includes('session_token=')).map(x=>x.split(';')[0]).join('; ');}
let checks=0;function check(test,label){assert.ok(test,label);checks++;console.log('PASS '+label);}
try{
 const password='A-long-test-password-123!';const setup='test-only-owner-setup-secret-at-least-32-characters';
 await post('sign-up/email',{email:'attacker@example.test',name:'Attacker',password},{'x-clinical-invitation':setup},403);
 await post('sign-up/email',{email:'owner@example.test',name:'Owner',password},{'x-clinical-invitation':'incorrect'},403);
 check(sql.prepare('SELECT COUNT(*) n FROM auth_user').get().n===0,'Public signup cannot claim the first administrator');
 await post('sign-up/email',{email:'owner@example.test',name:'Owner',password},{'x-clinical-invitation':setup},403);
 check(true,'Owner signup requires the existing historical operator database');
 sql.prepare("INSERT INTO operators(id,auth_id,name,email,role) VALUES('owner','old-chatgpt-id','Owner','owner@example.test','admin')").run();
 await post('sign-up/email',{email:'owner@example.test',name:'Owner',password,callbackURL:'/login?verified=1'},{'x-clinical-invitation':setup});
 check(messages.length===1&&messages[0].to==='owner@example.test','Account creation sends verification to the designated email');
 await post('sign-in/email',{email:'owner@example.test',password},{},403);
 const verify=await auth.handler(new Request(lastUrl()));assert.ok([200,302].includes(verify.status));
 const login=await post('sign-in/email',{email:'owner@example.test',password});const ownerCookie=cookie(login);check(!!ownerCookie,'Verified owner can sign in with email and password');
 const ownerSession=await auth.api.getSession({headers:new Headers({cookie:ownerCookie})});check(ownerSession?.user.emailVerified,'Login uses a database-backed, verified session');
 check(!await auth.api.getSession({headers:new Headers({'oai-authenticated-user-id':ownerSession.user.id,'oai-authenticated-user-email':'owner@example.test'})}),'Old identity headers cannot grant access on independent hosting');
 check(!await auth.api.getSession({headers:new Headers({cookie:ownerCookie+'tampered'})}),'Tampered session cookies are rejected');
 const salt=sql.prepare('SELECT password FROM auth_account').get().password;check(salt!==password&&!salt.includes(password),'Passwords are stored as hashes');
 const ownerUser={userId:ownerSession.user.id,email:ownerSession.user.email};
 await assert.rejects(()=>claimEnrollment(runtime,ownerUser,'wrong'));
 await claimEnrollment(runtime,ownerUser,setup);
 check((await linkedOperator(db,ownerUser))?.id==='owner','Verified owner is attached to the existing operator ID');
 check(sql.prepare("SELECT auth_id FROM operators WHERE id='owner'").get().auth_id==='old-chatgpt-id','Legacy identity provenance is preserved');
 await claimEnrollment(runtime,ownerUser,setup);
 check(sql.prepare('SELECT count(*) n FROM audit').get().n===1,'Activation retries do not duplicate audit records');
 const invite='a'.repeat(48);sql.prepare("INSERT INTO operators(id,name,email,role,credential_status,expires,details) VALUES('staff','Invited Staff','student@example.test','operator','verified','2027-01-01','{\"validSince\":\"2026-01-01\"}')").run();
 sql.prepare("INSERT INTO qc_invitations(id,token_hash,operator_id,created_at,expires_at,created_by) VALUES('invite',?,'staff',?,?,'owner')").run(await tokenHash(invite),new Date().toISOString(),new Date(Date.now()+86400000).toISOString());
 await post('sign-up/email',{email:'different@example.test',name:'Wrong Email',password},{'cf-connecting-ip':'192.0.2.2','x-clinical-invitation':invite},403);
 await post('sign-up/email',{email:'student@example.test',name:'Invited Student',password,callbackURL:'/login?verified=1'},{'cf-connecting-ip':'192.0.2.2','x-clinical-invitation':invite});
 const studentVerify=await auth.handler(new Request(lastUrl()));assert.ok([200,302].includes(studentVerify.status));
 const studentLogin=await post('sign-in/email',{email:'student@example.test',password},{'cf-connecting-ip':'192.0.2.2'});check(!!cookie(studentLogin),'Only the invited email can create a staff login');
 const staffSession=await auth.api.getSession({headers:new Headers({cookie:cookie(studentLogin)})});
 const staffUser={userId:staffSession.user.id,email:staffSession.user.email};
 check(!await linkedOperator(db,staffUser),'An account without redeemed invitation cannot access QC');
 sql.prepare("UPDATE qc_invitations SET expires_at='2000-01-01' WHERE id='invite'").run();
 await assert.rejects(()=>claimEnrollment(runtime,staffUser,invite));
 sql.prepare("UPDATE qc_invitations SET expires_at=?,revoked_at=? WHERE id='invite'").run(new Date(Date.now()+86400000).toISOString(),new Date().toISOString());
 await assert.rejects(()=>claimEnrollment(runtime,staffUser,invite));
 sql.prepare("UPDATE qc_invitations SET revoked_at=NULL WHERE id='invite'").run();
 await assert.rejects(()=>claimEnrollment(runtime,{...staffUser,email:'wrong@example.test'},invite));
 await claimEnrollment(runtime,staffUser,invite);
 check(!!sql.prepare("SELECT used_at FROM qc_invitations WHERE id='invite'").get().used_at,'Invitations are consumed only when verified account access is activated');
 check((await linkedOperator(db,staffUser)).role==='operator','Activation preserves the assigned role and credential record');
 sql.prepare("UPDATE operators SET active=0 WHERE id='staff'").run();
 check(!await linkedOperator(db,staffUser),'Deactivating a person immediately blocks QC access despite their session');
 sql.prepare("UPDATE operators SET active=1 WHERE id='staff'").run();
 const initialCookie=cookie(studentLogin);
 await post('request-password-reset',{email:'student@example.test',redirectTo:'/reset-password'},{'cf-connecting-ip':'192.0.2.2'});
 const redirect=await auth.handler(new Request(lastUrl()));assert.equal(redirect.status,302);const resetUrl=new URL(redirect.headers.get('location'),'https://clinical.test');const token=resetUrl.searchParams.get('token');assert.ok(token);
 await post('reset-password',{token,newPassword:'A-different-strong-password-456!'},{'cf-connecting-ip':'192.0.2.2'});
 check(!await auth.api.getSession({headers:new Headers({cookie:initialCookie})}),'Password resets revoke prior sessions');
 await post('sign-in/email',{email:'student@example.test',password},{'cf-connecting-ip':'192.0.2.3'},401);
 const resetLogin=await post('sign-in/email',{email:'student@example.test',password:'A-different-strong-password-456!'},{'cf-connecting-ip':'192.0.2.3'});
 check(!!cookie(resetLogin),'New password works and the old password fails');
 await post('reset-password',{token,newPassword:'Another-strong-password-789!'},{'cf-connecting-ip':'192.0.2.3'},400);check(true,'Password reset tokens are single use');
 await post('sign-out',{}, {cookie:cookie(resetLogin),'cf-connecting-ip':'192.0.2.3'});
 check(!await auth.api.getSession({headers:new Headers({cookie:cookie(resetLogin)})}),'Sign-out invalidates the session');
 await post('sign-in/email',{email:'owner@example.test',password},{origin:'https://evil.test','cf-connecting-ip':'192.0.2.4'},403);check(true,'Cross-origin sign-in requests are rejected');
 for(let i=0;i<5;i++)await post('sign-in/email',{email:'owner@example.test',password:'wrong-password'},{'cf-connecting-ip':'192.0.2.5'},401);
 await post('sign-in/email',{email:'owner@example.test',password},{'cf-connecting-ip':'192.0.2.5'},429);check(true,'Repeated sign-in attempts are rate limited in the database');
 console.log(JSON.stringify({passed:checks,emailMessagesIntercepted:messages.length}));
}finally{sql.close();rmSync(folder,{recursive:true,force:true});}
