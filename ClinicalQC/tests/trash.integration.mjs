import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import {planTrash,TRASH_TABLES} from '../lib/trash-plan.ts';
const sql=new DatabaseSync(':memory:');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const owner={id:'owner',name:'Owner',role:'admin'};let allowed=true;
const statement=(query,...args)=>({query,args});
const all=(query,...args)=>sql.prepare(query).all(...args),one=(query,...args)=>sql.prepare(query).get(...args);
class Problem extends Error{constructor(msg,code=400){super(msg);this.code=code}}
globalThis.trashMocks={requireOwner:async()=>{if(!allowed)throw new Problem('Owner only',403);return owner},rows:async(...a)=>all(...a),one:async(...a)=>one(...a),stmt:statement,db:()=>({batch:async ops=>{sql.exec('BEGIN');try{for(const o of ops)sql.prepare(o.query).run(...o.args);sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}}),uid:()=>crypto.randomUUID(),now:()=>new Date().toISOString(),auditStmt:(u,id,event,details)=>statement('INSERT INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),u.id,u.name,'now',id,event,JSON.stringify(details)),Problem};
const planCode=ts.transpileModule(readFileSync('lib/trash-plan.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const planUrl='data:text/javascript;base64,'+Buffer.from(planCode).toString('base64');
let code=readFileSync('app/api/trash/route.ts','utf8').replace("import {requireOwner} from '@/lib/owner';",'const {requireOwner}=globalThis.trashMocks;').replace("import {rows,one,stmt,db,uid,now,auditStmt,Problem} from '@/lib/server';",'const {rows,one,stmt,db,uid,now,auditStmt,Problem}=globalThis.trashMocks;').replace("'@/lib/trash-plan'",JSON.stringify(planUrl));
code=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const post=async b=>{const r=await POST(new Request('https://qc.example/api/trash',{method:'POST',headers:{origin:'https://qc.example','Content-Type':'application/json'},body:JSON.stringify(b)}));return {status:r.status,...await r.json()}};
for(const id of ['owner','staff'])sql.prepare('INSERT INTO operators(id,email,name,role,credential_status) VALUES(?,?,?,?,?)').run(id,id+'@example.com',id,id==='owner'?'admin':'user','verified');
function record(id,parent){sql.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run(id,'staff','meter','2026-10-02','now','exception',JSON.stringify({input:{repeatOf:parent},operator:{name:'Staff'}}));}
record('original',null);record('repeat','original');record('unrelated',null);
sql.prepare('INSERT INTO exceptions(id,record_id,operator_id,category,title,created_at,updated_at,details) VALUES(?,?,?,?,?,?,?,?)').run('ex','original','staff','qc','Failed','now','now','{}');
sql.prepare('INSERT INTO actions VALUES(?,?,?,?,?,?,?,?)').run('action','ex','owner','Owner','now','review','notes','{}');
let p=await post({op:'preview',category:'records',ids:['original']});assert.equal(p.total,4);assert.equal(all('SELECT * FROM records').length,3,'Preview never writes');
allowed=false;assert.equal((await post({op:'trash',category:'records',ids:['original'],fingerprint:p.fingerprint,confirm:'MOVE TO TRASH'})).status,403);allowed=true;
assert.equal((await post({op:'preview',category:'operators',ids:['owner']})).status,400);
assert.equal((await post({op:'trash',category:'records',ids:['original'],fingerprint:'stale',confirm:'MOVE TO TRASH'})).status,409);
assert.equal((await post({op:'trash',category:'records',ids:['original'],fingerprint:p.fingerprint,confirm:'MOVE TO TRASH'})).ok,true);
assert.equal(all('SELECT * FROM records').length,1);assert.equal(all('SELECT * FROM exceptions').length,0);assert.equal(all('SELECT * FROM actions').length,0);
const group=one('SELECT * FROM qc_trash');assert.equal(group.item_count,4);
assert.equal((await post({op:'restore',id:group.id})).ok,true);assert.equal(all('SELECT * FROM records').length,3);assert.equal(all('SELECT * FROM exceptions').length,1);assert.equal(all('SELECT * FROM actions').length,1);
assert.equal((await post({op:'restore',id:group.id})).status,400,'Cannot restore twice');
p=await post({op:'preview',category:'records',ids:['original']});await post({op:'trash',category:'records',ids:['original'],fingerprint:p.fingerprint,confirm:'MOVE TO TRASH'});
const second=one('SELECT * FROM qc_trash WHERE restored_at IS NULL');record('original',null);assert.equal((await post({op:'restore',id:second.id})).status,400);assert.equal(all('SELECT * FROM exceptions').length,0,'Conflicting restoration is fully rolled back');
// Foreign-key linked user access is archived before the operator and restored after it.
sql.prepare('INSERT INTO qc_invitations(id,operator_id,token_hash,created_at,expires_at,created_by) VALUES(?,?,?,?,?,?)').run('invite','staff','hash','now','later','owner');
p=await post({op:'preview',category:'operators',ids:['staff']});assert.equal(p.total,2);assert.equal((await post({op:'trash',category:'operators',ids:['staff'],fingerprint:p.fingerprint,confirm:'MOVE TO TRASH'})).ok,true);const ug=one("SELECT * FROM qc_trash WHERE category='operators'");assert.equal((await post({op:'restore',id:ug.id})).ok,true);
assert.equal((await GET(new Request('https://qc.example/api/trash?category=operators'))).status,200);
console.log('Trash integration passed: preview, owner authorization, stale preview, linked removal, restoration, FK ordering, and conflict rollback.');
