import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {savePerson,createSetupLink,activate,configureApp,directory} from '../people.mjs';
import {saveMember,liveGrant} from '../access.mjs';
import {verifyPassword} from 'better-auth/crypto';
function adapter(sql){function prepare(q,args=[]){return {bind(...a){return prepare(q,a);},async first(){return sql.prepare(q).get(...args)||null;},async all(){const results=sql.prepare(q).all(...args);return{results,meta:{changes:Number(sql.prepare('SELECT changes() n').get().n)}};},async run(){return{meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}};}return{prepare,async batch(stmts){sql.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.all());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};}
function core(){const s=new DatabaseSync(':memory:');s.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('../ClinicalQC/drizzle').filter(f=>f.endsWith('.sql')).sort())s.exec(readFileSync('../ClinicalQC/drizzle/'+f,'utf8'));return s;}
const sql=core();for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));
const shifts=core();shifts.exec("CREATE TABLE programs(id TEXT PRIMARY KEY,name TEXT,active INTEGER);CREATE TABLE courses(id TEXT PRIMARY KEY,name TEXT,program_id TEXT,level TEXT,active INTEGER);CREATE TABLE people(id TEXT PRIMARY KEY,auth_id TEXT,name TEXT,email TEXT,role TEXT,program_id TEXT,course_id TEXT,level TEXT DEFAULT '',active INTEGER,created_at TEXT,is_preceptor INTEGER DEFAULT 0,is_fto INTEGER DEFAULT 0); INSERT INTO programs VALUES('p1','EMT Program',1); INSERT INTO courses VALUES('c1','Class 1','p1','EMT',1);");
const narcs=core();narcs.exec("CREATE TABLE clinicalnarcs_records(space TEXT,revision INTEGER,request_id TEXT UNIQUE,state TEXT,event TEXT,created_at TEXT,UNIQUE(space,revision));CREATE TABLE narcs_login_links(person_id TEXT PRIMARY KEY,email TEXT UNIQUE,auth_user_id TEXT UNIQUE,created_at TEXT,event_id TEXT);");
const state={people:[{id:'n-owner',name:'Owner',email:'owner@test.example',role:'admin',regions:[],active:true}],kits:[{id:'kit-original',seal:'KEEP'}],vials:[{lot:'DO-NOT-CHANGE'}]};narcs.prepare("INSERT INTO clinicalnarcs_records VALUES('live',1,'original',?,'{}','now')").run(JSON.stringify(state));
const credentialPeople=new Map();const env={DB:adapter(sql),SHIFTS_DB:adapter(shifts),NARCS_DB:adapter(narcs),HUB_ORIGIN:'https://hub.test',PRIVATE_APPS:{async provisionCredentialPerson(actor,p){assert.equal(actor,'owner');if(!credentialPeople.has(p.email))credentialPeople.set(p.email,{...p,id:'original-credential-person'});return{ok:true};}}};
for(const [id,role]of [['owner',1],['staff',0]]){sql.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,1,1)').run(id,id,id+'@test.example');sql.prepare('INSERT INTO hub_members VALUES(?,?,1,?)').run(id,role,'now');}
let newId,token;
test('administrator adds one person; duplicate emails, nonadmins and stale edits are rejected',async()=>{
 const input={name:'New Person',email:'NEW@test.example',phone:'555-0101',employeeId:'101',region:'North'};
 await assert.rejects(savePerson(env,'staff',input),e=>e.status===403);
 const p=await savePerson(env,'owner',input);newId=p.id;
 assert.equal(sql.prepare('SELECT email_verified FROM auth_user WHERE id=?').get(newId).email_verified,0);
 await assert.rejects(savePerson(env,'owner',{...input,email:'new@test.example'}),e=>e.status===409);
 await savePerson(env,'owner',{...input,id:newId,revision:1,name:'Updated Person'});
 await assert.rejects(savePerson(env,'owner',{...input,id:newId,revision:1}),e=>e.status===409);
 assert.equal(sql.prepare('SELECT name FROM auth_user WHERE id=?').get(newId).name,'Updated Person');
 await assert.rejects(savePerson(env,'owner',{...input,id:newId,revision:2,email:'changed@test.example'}),e=>e.status===409);
});
test('one-time setup links are private, replaceable, cannot reset established accounts and respect suspension',async()=>{
 const a=await createSetupLink(env,'owner',{userId:newId});const first=a.url.split('#')[1];
 const b=await createSetupLink(env,'owner',{userId:newId});token=b.url.split('#')[1];
 await assert.rejects(activate(env,{token:first}),e=>e.status===400);
 const stored=sql.prepare('SELECT token_hash FROM hub_setup_links WHERE revoked_at IS NULL').get();assert.notEqual(stored.token_hash,token);
 await saveMember(env,'owner',{userId:newId,enabled:false,isAdmin:false});await assert.rejects(activate(env,{token}),e=>e.status===400);
 await saveMember(env,'owner',{userId:newId,enabled:true,isAdmin:false});assert.equal((await activate(env,{token})).email,'new@test.example');
 await assert.rejects(activate(env,{token,password:'short'}),e=>e.status===400);
 await activate(env,{token,password:'New-private-password-123!'});
 const account=sql.prepare("SELECT password FROM auth_account WHERE user_id=? AND provider_id='credential'").get(newId);assert.equal(await verifyPassword({hash:account.password,password:'New-private-password-123!'}),true);
 await assert.rejects(activate(env,{token,password:'Replacement-password-123!'}),e=>e.status===400);
 await assert.rejects(createSetupLink(env,'owner',{userId:newId}),e=>e.status===409);
});
test('existing QC profile and qualifications are retained, new Shifts and credential profiles are idempotent',async()=>{
 sql.prepare("INSERT INTO operators(id,name,email,role,credential_status,expires,details) VALUES('historic-qc','Original','new@test.example','operator','approved','2030-01-01','{\"history\":true}')").run();
 await configureApp(env,'owner',{userId:newId,module:'qc',enabled:true,role:'supervisor'});
 const qc=sql.prepare("SELECT * FROM operators WHERE id='historic-qc'").get();assert.equal(qc.role,'supervisor');assert.equal(qc.credential_status,'approved');assert.equal(qc.expires,'2030-01-01');assert.equal(qc.details,'{"history":true}');assert.equal((await liveGrant(env,newId,'qc')).local_id,'historic-qc');
 await configureApp(env,'owner',{userId:newId,module:'shifts',enabled:true,role:'student',options:{programId:'p1',courseId:'c1',level:'EMT'}});
 const original=shifts.prepare('SELECT * FROM people').get();assert.equal(original.program_id,'p1');assert.equal(original.level,'EMT');
 await configureApp(env,'owner',{userId:newId,module:'shifts',enabled:true,role:'preceptor',options:{isFto:true}});
 assert.equal(shifts.prepare('SELECT COUNT(*) n FROM people').get().n,1);assert.equal(shifts.prepare('SELECT id FROM people').get().id,original.id);assert.equal(shifts.prepare('SELECT is_fto FROM people').get().is_fto,1);
 for(let i=0;i<2;i++)await configureApp(env,'owner',{userId:newId,module:'credentials',enabled:true,role:'member'});assert.equal(credentialPeople.size,1);
 assert.equal((await liveGrant(env,newId,'credentials')).account.role,'member');
});
test('Narcs appends audited revisions while preserving inventory; role changes and disable apply centrally',async()=>{
 for(const role of ['user','supervisor'])await configureApp(env,'owner',{userId:newId,module:'narcs',enabled:true,role,options:{regions:['North']}});
 const latest=narcs.prepare("SELECT state,event FROM clinicalnarcs_records ORDER BY revision DESC LIMIT 1").get(),s=JSON.parse(latest.state);
 assert.deepEqual(s.kits,state.kits);assert.deepEqual(s.vials,state.vials);assert.equal(s.people.length,2);assert.equal(s.people[1].role,'supervisor');assert.equal(JSON.parse(latest.event).signature.authUserId,'owner');
 assert.equal(narcs.prepare('SELECT COUNT(*) n FROM narcs_login_links').get().n,1);
 await configureApp(env,'owner',{userId:newId,module:'narcs',enabled:false,role:'supervisor'});assert.equal(await liveGrant(env,newId,'narcs'),null);
 await assert.rejects(configureApp(env,'staff',{userId:newId,module:'forms',enabled:true,role:'admin'}),e=>e.status===403);
 await assert.rejects(configureApp(env,'owner',{userId:newId,module:'forms',enabled:true,role:'owner'}),e=>e.status===400);
 const d=await directory(env);assert.equal(d.people.find(p=>p.id===newId).employee_id,'101');assert.equal(d.apps.find(g=>g.user_id===newId&&g.module==='shifts').options.isFto,true);
});
test('failed provisioning remains disabled and existing user passwords are unchanged',async()=>{
 const before=sql.prepare('SELECT password FROM auth_account WHERE user_id=?').get(newId).password;
 await assert.rejects(configureApp({...env,PRIVATE_APPS:{async provisionCredentialPerson(){throw Error('temporary unavailable');}}},'owner',{userId:newId,module:'credentials',enabled:true,role:'admin'}),e=>e.status===503);
 assert.equal(await liveGrant(env,newId,'credentials'),null);assert.equal(sql.prepare('SELECT password FROM auth_account WHERE user_id=?').get(newId).password,before);
});
