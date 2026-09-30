import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepare,verify,tables} from '../scripts/migrate-data.mjs';
const folder=mkdtempSync(join(tmpdir(),'qc-migration-'));
function database(name){const path=join(folder,name+'.sqlite'),db=new DatabaseSync(path);for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));return {path,db};}
try{
 const source=database('source'),destination=database('destination');
 source.db.prepare("INSERT INTO operators(id,email,name,role,auth_id,details) VALUES('owner','owner@example.test',?,'admin','old-identity',?)").run("O'Brien",JSON.stringify({validSince:'2026-01-01',credentialRef:'Original evidence'}));
 source.db.prepare("INSERT INTO assets(id,kind,asset_key,label,details) VALUES('meter','device','serial-001','Meter',?)").run(JSON.stringify({serial:'001',truckId:'truck-9999',status:'hold'}));
 for(const id of ['record-b','record-a'])source.db.prepare("INSERT INTO records(id,operator_id,device_id,occurred_at,created_at,status,snapshot) VALUES(?,'owner','meter','2026-01-01T12:00:00Z','2026-01-01T12:00:00Z','historical_pass',?)").run(id,JSON.stringify({truck:{label:'9999'},device:{serial:'001'},lowRange:{min:44,max:74},highRange:{min:250,max:350},lowValue:59,highValue:268}));
 source.db.exec("INSERT INTO exceptions(id,record_id,device_id,operator_id,category,title,status,created_at,updated_at,details) VALUES('exception','record-b','meter','owner','qc','QC issue','closed','2026-01-01','2026-01-02','{}'); INSERT INTO actions(id,exception_id,actor_id,actor_name,created_at,action,notes,details) VALUES('action','exception','owner','Owner','2026-01-02','close','supervisor remediated','{}'); INSERT INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details) VALUES('audit','owner','Owner','2026-01-02','exception','closed','{}'); INSERT INTO import_batches(id,file_hash,filename,created_at,actor_id,actor_name,source_rows,imported_rows,skipped_rows,record_count,details) VALUES('batch','hash','report.xlsx','2026-01-02','owner','Owner',2,2,0,2,'{}'); INSERT INTO history_rows(fingerprint,identity_key,batch_id,record_id,source_row) VALUES('fingerprint','key','batch','record-b',23); INSERT INTO temperature_records(id,location_id,qc_record_id,operator_id,observed_date,created_at,status,snapshot) VALUES('temperature','truck-9999','record-a','owner','2026-01-01','2026-01-01T12:00:00Z','pass','{\"low\":60,\"high\":80,\"current\":70}'); INSERT INTO application_settings(id,details,updated_at,updated_by) VALUES('temperature','{\"qcEnabled\":true,\"storageEnabled\":false}','2026-01-02','owner');");
 const file=join(folder,'migration.sql');const summary=prepare(source.path,file);destination.db.exec(readFileSync(file,'utf8'));verify(file+'.manifest.json',destination.path);
 assert.equal(Object.keys(summary.tables).length,10);
 for(const t of tables)assert.ok(summary.tables[t].count>0);
 assert.equal(destination.db.prepare('SELECT auth_id FROM operators').get().auth_id,'old-identity');
 assert.equal(destination.db.prepare('SELECT COUNT(*) n FROM auth_user').get().n,0);
 assert.deepEqual(destination.db.prepare('SELECT id FROM records ORDER BY rowid').all().map(r=>r.id),['record-b','record-a']);
 assert.throws(()=>destination.db.exec(readFileSync(file,'utf8')));
 assert.equal(destination.db.prepare('SELECT COUNT(*) n FROM records').get().n,2);
 destination.db.exec("UPDATE records SET status='exception' WHERE id='record-a'");assert.throws(()=>verify(file+'.manifest.json',destination.path),/records/);
 source.db.close();destination.db.close();console.log('PASS Full migration preserves all ten business tables, historical identity, snapshots, source rows, audit trail, settings, and tie ordering; duplicate imports and content mismatches are rejected.');
}finally{rmSync(folder,{recursive:true,force:true});}
