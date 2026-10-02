// Production parser/importer, isolated SQLite. No production reads or writes.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
const sql=new DatabaseSync(':memory:');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
function stmt(query,...args){return {async all(){return {results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;},async run(){return sql.prepare(query).run(...args);}};}
const db={prepare(query){return {bind(...args){return stmt(query,...args);}};},async batch(ops){sql.exec('BEGIN');try{for(const op of ops)await op.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
globalThis.__historyTest={db,stmt};
const mock=`const {db:database,stmt}=globalThis.__historyTest;export {stmt};export const db=()=>database;export const rows=async(q,...a)=>(await stmt(q,...a).all()).results;export const one=(q,...a)=>stmt(q,...a).first();export const uid=()=>crypto.randomUUID();export const now=()=>new Date().toISOString();export const decode=r=>({...r,...JSON.parse(r.details||'{}')});export class Problem extends Error{};export const auditStmt=(u,id,event,details)=>stmt('INSERT INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details) VALUES(?,?,?,?,?,?,?)',uid(),u.id,u.name,now(),id,event,JSON.stringify(details));`;
const cache=new Map();function moduleUrl(name){if(cache.has(name))return cache.get(name);const input=name==='server'?mock:readFileSync('lib/'+name+'.ts','utf8');const js=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dep)=>`from '${moduleUrl(dep)}'`);const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(name,url);return url;}
const {previewImport,importHistory}=await import(moduleUrl('history-import'));
const {parseLegacyReport,parseCsv}=await import(moduleUrl('history-parser'));
const header=['Network ID','Select Department','Recorded Date','Level 1 QC','Level 3 QC','QC Result First Test','Level 1 QC (second test, if needed)','Level 3 QC (second test, if needed)','QC Result Second Test','Comments','Glucometer SN - County','Ambulance Number/Supervisor Vehicle - County','Level 1 QC Lot Number | Printed Expiration Date | QC Range','Level 3 QC Lot Number | Printed Expiration Date | QC Range','StatStrip Glucose Test Strip Lot Number | Printed Expiration Date'];
const encode=r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',');
const row=['staff','County','Mar 09 2026 07:28am CDT','61','248','I need to log another QC','61','255','Both QC are in range','A comment, with comma','1060 018 14188','6124','042 415 2301 | 11/30/2026 | QC Range 44-74','042 416 3303 | 12/11/2026 | QC Range 250-350','0324297249 | 10/24/2026'];
const sample=['Daily report','','Select Department','Answer,Count','County,1','Neonatal Transport Team,1','Total,2','','EMS Glucose Control Log Daily Report',encode(header),encode(row),encode(row.map((x,i)=>i===1?'Neonatal Transport Team':x)),'','Q4 - Glucometer SN - County','Answer,Count','1060 018 14188,1','Total,1'].join('\n');
const file=process.argv[2],text=file?readFileSync(file,'utf8'):sample,expected=file?26:1;
const p=await previewImport(text,'report.csv');assert.deepEqual(p.errors,[]);assert.equal(p.newRows,expected);assert.equal(p.excludedRows,file?6:1);assert.equal(p.attempts,expected+1);assert.ok(p.entries.every(e=>e.department!=='EMS Glucose Control Log Daily Report'&&e.serial&&e.truck&&e.lowSupply&&e.highSupply&&e.stripSupply));
assert.equal(sql.prepare('SELECT count(*) n FROM records').get().n,0,'Preview writes nothing');
// Existing inventory must not move or change holds during historical import.
sql.prepare("INSERT INTO assets(id,kind,asset_key,label,details) VALUES('current-meter','device','current','Current',?)").run(JSON.stringify({truckId:'today-truck',status:'hold'}));
const saved=await importHistory(text,'report.csv',{id:'admin',name:'Admin'},p.fileHash);assert.equal(saved.recordCount,expected+1);
const records=sql.prepare('SELECT * FROM records').all().map(r=>({...r,snapshot:JSON.parse(r.snapshot)}));
for(const e of p.entries){const r=records.find(r=>r.snapshot.provenance.sourceRow===e.sourceRow&&!r.snapshot.input.repeatOf);assert.equal(r.snapshot.department.label,e.department);assert.equal(r.snapshot.truck.label,e.truck);assert.equal(r.snapshot.provenance.originalSerialSelection,e.serial);assert.equal(r.snapshot.low.sourceText,e.lowSupply);assert.equal(r.snapshot.high.sourceText,e.highSupply);assert.equal(r.snapshot.strip.sourceText,e.stripSupply);}
assert.equal(records.filter(r=>r.status==='historical_exception').length,1);assert.equal(records.filter(r=>r.snapshot.input.repeatOf).length,1);
for(const r of records){assert.ok(r.snapshot.device.serial!=='Not recorded');assert.ok(r.snapshot.truck.label!=='Not recorded');assert.equal(r.snapshot.lowRange.min,44);assert.equal(r.snapshot.highRange.max,350);assert.ok(r.snapshot.provenance.sourceHeaders);}
assert.equal(sql.prepare('SELECT count(*) n FROM operators').get().n,0);assert.deepEqual(JSON.parse(sql.prepare("SELECT details FROM assets WHERE id='current-meter'").get().details),{truckId:'today-truck',status:'hold'});
const again=await previewImport(text+'\n','other.csv');assert.equal(again.newRows,0);assert.equal(again.duplicates,expected);assert.deepEqual(again.errors,[]);
// Workbook imports use different history-row keys. Match the actual preserved records too.
sql.exec('DELETE FROM history_rows; DELETE FROM import_batches;');const workbook=await previewImport(text+'\n\n','other.csv');assert.equal(workbook.duplicates,expected);assert.equal(workbook.newRows,0);
const first=p.entries[0];const conflict=await previewImport(text.replace(first.serial,'999999999999'),'changed.csv');assert.ok(conflict.errors.some(e=>e.includes('existing QC record')));
await assert.rejects(()=>importHistory(text.replace(first.serial,'999999999999'),'changed.csv',{id:'admin',name:'Admin'}));assert.equal(sql.prepare('SELECT count(*) n FROM records').get().n,expected+1);
const malformed=await previewImport(text.replace('10/24/2026','02/31/2026'),'bad.csv');assert.ok(malformed.errors.length);
assert.ok(parseLegacyReport(sample.replace('Mar 09 2026','Mar 09 2025')).errors.some(e=>e.includes('only 2026')));
const oldHeader=header.slice(0,10).filter(x=>x!=='Select Department');const oldRow=row.slice(0,10).filter((_,i)=>i!==1);const legacy=['Old report','','Select Department','Answer,Count','County,1','Total,1','','County',encode(oldHeader),encode(oldRow)].join('\n');assert.equal(parseLegacyReport(legacy).entries[0].department,'County');assert.deepEqual(parseLegacyReport(legacy).errors,[]);
assert.equal(parseCsv('"a,b","c"\r\n')[0][0],'a,b');
console.log(`Historical CSV checks passed: ${p.sourceRows} source rows, ${p.excludedRows} excluded, ${expected} sessions / ${expected+1} attempts; traceability, repeats, duplicate/conflict checks, and unchanged inventory verified.`);
