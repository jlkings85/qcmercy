// Isolated SQLite and captured messages only. No real emails or production writes.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import {invitationCandidates,sendStaffInvitation} from '../lib/bulk-invitations.ts';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
function prepare(query,args=[]){return {bind(...values){return prepare(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){const rows=sql.prepare(query).all(...args);return {success:true,results:rows,meta:{changes:Number(sql.prepare('SELECT changes() n').get().n)}};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}
const db={prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const add=(id,email,active=1,role='operator')=>sql.prepare("INSERT INTO operators(id,name,email,active,role,credential_status,expires) VALUES(?,?,?,?,?,'verified','2020-01-01')").run(id,id,email,active,role);
add('owner','owner@mercyems.net',1,'admin');add('staff','staff@mercyems.net');add('inactive','inactive@mercyems.net',0);add('placeholder','placeholder@historical.invalid');add('duplicate1','duplicate@mercyems.net');add('duplicate2','DUPLICATE@mercyems.net');add('active','active@mercyems.net');add('failed','failed@mercyems.net');add('changed','changed@mercyems.net');
sql.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('active-auth','Active','active@mercyems.net',1,Date.now(),Date.now());
sql.prepare('INSERT INTO qc_login_links(operator_id,auth_user_id,created_at,event_id) VALUES(?,?,?,?)').run('active','active-auth',new Date().toISOString(),'active-event');
const actor={id:'owner',name:'Owner'},messages=[];
const sender=async(...args)=>{messages.push(args);return 'provider-'+messages.length;};
const input=(id,email=id+'@mercyems.net',resend=false)=>({operatorId:id,expectedEmail:email,expectedRevision:1,requestId:'bulk-'+crypto.randomUUID(),resend});
let people=await invitationCandidates(db);
assert.equal(people.find(p=>p.id==='staff').eligible,true,'Expired testing credentials do not block login invitations');
for(const id of ['inactive','placeholder','duplicate1','duplicate2','active'])assert.equal(people.find(p=>p.id===id).eligible,false,id);
const request=input('staff');
assert.equal((await sendStaffInvitation(db,actor,request,'https://qc.example.org',sender)).status,'sent');
assert.equal(messages.length,1);assert.equal(messages[0][0],'staff@mercyems.net');
const token=messages[0][2].match(/#invite=([a-f0-9]+)/)[1];
const invitation=sql.prepare('SELECT * FROM qc_invitations WHERE id=?').get(request.requestId);
assert.notEqual(invitation.token_hash,token);assert.equal(invitation.token_hash.length,64);
assert.ok(Date.parse(invitation.expires_at)-Date.parse(invitation.created_at)>=7*86400000-1000);
assert.equal((await sendStaffInvitation(db,actor,request,'https://qc.example.org',sender)).status,'sent');assert.equal(messages.length,1,'Repeated request does not send twice');
assert.equal((await sendStaffInvitation(db,actor,input('staff'),'https://qc.example.org',sender)).status,'skipped');assert.equal(messages.length,1,'Pending invitations require explicit resend');
assert.equal((await sendStaffInvitation(db,actor,input('staff','staff@mercyems.net',true),'https://qc.example.org',sender)).status,'sent');assert.equal(messages.length,2);assert.ok(sql.prepare('SELECT revoked_at FROM qc_invitations WHERE id=?').get(request.requestId).revoked_at);
for(const id of ['inactive','placeholder','duplicate1','active'])assert.equal((await sendStaffInvitation(db,actor,input(id,people.find(p=>p.id===id).email),'https://qc.example.org',sender)).status,'skipped');
assert.equal(messages.length,2);
assert.equal((await sendStaffInvitation(db,actor,input('changed','old@mercyems.net'),'https://qc.example.org',sender)).status,'skipped');
sql.prepare('UPDATE operators SET revision=2 WHERE id=?').run('changed');
assert.equal((await sendStaffInvitation(db,actor,input('changed'),'https://qc.example.org',sender)).status,'skipped');
const failure=input('failed');assert.equal((await sendStaffInvitation(db,actor,failure,'https://qc.example.org',async()=>{throw Error('Provider rejected');})).status,'failed');
assert.ok(sql.prepare('SELECT revoked_at FROM qc_invitations WHERE id=?').get(failure.requestId).revoked_at);
assert.equal(sql.prepare("SELECT count(*) n FROM audit WHERE event='Login invitation email failed'").get().n,1);
assert.equal(sql.prepare("SELECT count(*) n FROM audit WHERE event='Login invitation email sent'").get().n,2);
assert.equal(sql.prepare('SELECT count(*) n FROM qc_login_links').get().n,1,'Invitations do not activate accounts');
assert.equal(sql.prepare("SELECT expires FROM operators WHERE id='staff'").get().expires,'2020-01-01','Testing credentials are unchanged');

// Exercise the actual API route with controlled identity and delivery dependencies.
let user={id:'owner',name:'Owner',role:'admin'},reads=0,sends=0;
class Problem extends Error{constructor(message,code=400){super(message);this.code=code;}}
const deps={operator:async()=>{if(!user)throw new Problem('Sign in',401);return user;},admin:u=>{if(u.role!=='admin')throw new Problem('Admin only',403);},db:()=>db,Problem,applicationUrl:()=> 'https://qc.example.org',runtimeValues:()=>({RESEND_API_KEY:'test',QC_EMAIL_FROM:'test'}),sendEmail:sender,invitationCandidates:async()=>{reads++;return [];},sendStaffInvitation:async()=>{sends++;return {status:'sent'};}};
const source=readFileSync('app/api/invitations/bulk/route.ts','utf8').replace(/^import .*;\n/gm,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};new Function('exports',...Object.keys(deps),js)(exports,...Object.values(deps));
user=null;assert.equal((await exports.GET()).status,401);
user={role:'supervisor'};assert.equal((await exports.GET()).status,403);assert.equal(reads,0);
user={id:'owner',name:'Owner',role:'admin'};assert.equal((await exports.GET()).status,200);assert.equal(reads,1);
const post=(origin,body=request)=>exports.POST(new Request('https://qc.example.org/api/invitations/bulk',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
assert.equal((await post('https://other.example.org')).status,403);assert.equal(sends,0);
user={role:'operator'};assert.equal((await post('https://qc.example.org')).status,403);assert.equal(sends,0);
user={id:'owner',name:'Owner',role:'admin'};assert.equal((await post('https://qc.example.org',{...request,requestId:'invalid'})).status,400);assert.equal(sends,0);
assert.equal((await post('https://qc.example.org')).status,200);assert.equal(sends,1);
sql.close();console.log('Bulk invitations passed: recipient eligibility, duplicate prevention, explicit resends, provider failure, audit history, unchanged credentials, admin-only access, and cross-origin rejection.');
