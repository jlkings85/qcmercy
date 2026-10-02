import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {qcDeviceLocationStatements} from '../lib/qc-device-location.ts';
import {controlRange} from '../lib/control-ranges.ts';
const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_abandoned_zuras.sql','utf8'));
const db={prepare(query){return {bind(...args){return {run(){return sql.prepare(query).run(...args);}};}};}};
const asset=(id,truckId,status='active')=>sql.prepare("INSERT INTO assets(id,kind,asset_key,label,details) VALUES(?,'device',?,?,?)").run(id,id,id,JSON.stringify({serial:id,truckId,status,departmentId:'county'}));
asset('A','truck1','hold');asset('B','truck2');
const details=id=>JSON.parse(sql.prepare('SELECT details FROM assets WHERE id=?').get(id).details);
function save(id,device,truck,time,status='pass',fail=false){sql.exec('BEGIN');try{
 sql.prepare('INSERT INTO records(id,operator_id,device_id,occurred_at,created_at,status,snapshot) VALUES(?,?,?,?,?,?,?)').run(id,'staff',device,time,'2026-10-02T16:00:00Z',status,JSON.stringify({device:{id:device,serial:device},truck:{id:truck,label:truck},lowRange:{min:35,max:75}}));
 for(const s of qcDeviceLocationStatements(db,id,{id:'staff',name:'Staff'},'2026-10-02T16:00:00Z'))s.run();
 if(fail)throw Error('simulated failure');sql.exec('COMMIT');
 }catch(e){sql.exec('ROLLBACK');throw e;}}
save('first','A','truck2','2026-10-02T12:00:00Z','exception');
assert.equal(details('A').truckId,'truck2');assert.equal(details('B').truckId,'');assert.equal(details('A').status,'hold','Moving never clears a hold');
const original=sql.prepare("SELECT snapshot FROM records WHERE id='first'").get().snapshot;
save('second','A','truck1','2026-10-02T13:00:00Z');
assert.equal(details('A').truckId,'truck1');assert.equal(sql.prepare("SELECT snapshot FROM records WHERE id='first'").get().snapshot,original,'Original truck and ranges remain unchanged');
save('late','A','truck2','2026-10-02T11:00:00Z');assert.equal(details('A').truckId,'truck1','Older check cannot move the device back');
save('third','B','truck2','2026-10-02T14:00:00Z');
save('late-destination','A','truck2','2026-10-02T13:30:00Z');assert.equal(details('A').truckId,'truck1');assert.equal(details('B').truckId,'truck2','Older check cannot replace newer truck information');
assert.throws(()=>save('failed','A','truck2','2026-10-02T15:00:00Z','pass',true));assert.equal(details('A').truckId,'truck1');assert.equal(details('B').truckId,'truck2');assert.equal(sql.prepare("SELECT count(*) n FROM audit WHERE id='qc-location:failed'").get().n,0,'QC, movement and audit roll back together');
save('tie','A','truck2','2026-10-02T14:00:00Z');assert.equal(details('A').truckId,'truck2');assert.equal(details('B').truckId,'');
const audit=JSON.parse(sql.prepare("SELECT details FROM audit WHERE id='qc-location:first'").get().details);assert.equal(audit.previousTruckId,'truck1');assert.equal(audit.displacedDevices[0].id,'B');assert.equal(audit.recordId,'first');
assert.deepEqual([controlRange('low',[],'s','l').min,controlRange('low',[],'s','l').max],[44,74]);assert.deepEqual([controlRange('high',[],'s','h').min,controlRange('high',[],'s','h').max],[250,350]);
console.log('QC location: transfers, replacement, holds, older records, ties, rollback, audit and unchanged history passed. New defaults: 44–74 / 250–350.');
