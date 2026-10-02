import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {exceptionRepeatSql,repeatSummary} from '../lib/exception-repeats.ts';
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE records(id TEXT,device_id TEXT,status TEXT,occurred_at TEXT,created_at TEXT,snapshot TEXT); CREATE TABLE exceptions(id TEXT,record_id TEXT);');
function record(id,parent,time,status='pass',device='meter',historical=false){db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?)').run(id,device,status,time,time,JSON.stringify({historical,input:{repeatOf:parent,lowValue:59,highValue:280},operator:{name:'Tester'}}));}
const query=()=>db.prepare(exceptionRepeatSql(1)).all('ex');
record('original',null,'01','exception');db.prepare('INSERT INTO exceptions VALUES(?,?)').run('ex','original');
assert.equal(query().length,0);
record('unrelated',null,'99');assert.equal(query().length,0);
record('repeat1','original','02');assert.equal(query()[0].id,'repeat1');assert.equal(repeatSummary(query()[0]).operatorName,'Tester');
record('repeat2','repeat1','03','exception');assert.equal(query()[0].status,'exception');
record('wrong-device','repeat2','99','pass','other');record('historical','repeat2','99','pass','meter',true);record('excluded','repeat2','99','historical_excluded');assert.equal(query()[0].id,'repeat2');
record('backdated','original','01');assert.equal(query()[0].id,'repeat2');
record('repeat3','repeat2','04');assert.equal(query()[0].id,'repeat3');
record('same-time','repeat3','04','exception');assert.equal(query()[0].id,'same-time');
assert.equal(db.prepare(exceptionRepeatSql(1)).all('not-authorized').length,0);
assert.throws(()=>exceptionRepeatSql(0));
console.log('Exception repeat tests passed: linked chains, latest outcome, unrelated checks, historical exclusions, identity scoping.');
