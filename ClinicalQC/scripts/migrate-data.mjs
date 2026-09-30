import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const tables=['operators','assets','records','exceptions','actions','audit','import_batches','history_rows','temperature_records','application_settings'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ident=name=>'"'+name.replaceAll('"','""')+'"';
function readSnapshot(path){
 const database=new DatabaseSync(path,{readOnly:true});
 try{return Object.fromEntries(tables.map(table=>{
  const columns=database.prepare('PRAGMA table_info('+ident(table)+')').all().map(c=>c.name);
  if(!columns.length)throw Error('Missing required source table: '+table);
  const rows=database.prepare('SELECT * FROM '+ident(table)+' ORDER BY rowid').all().map(r=>columns.map(c=>r[c]));
  return [table,{columns,rows}];
 }));}finally{database.close();}
}
export function manifest(path){const snapshot=readSnapshot(path);return {format:'clinicalqc-full-database-v1',tables:Object.fromEntries(tables.map(t=>[t,{columns:snapshot[t].columns,count:snapshot[t].rows.length,sha256:hash(snapshot[t])}]))};}
const literal=value=>value===null?'NULL':typeof value==='string'?"'"+value.replaceAll("'","''")+"'":typeof value==='number'&&Number.isFinite(value)?String(value):(()=>{throw Error('Unsupported value in source database');})();
export function prepare(source,out){
 const snapshot=readSnapshot(source),summary=manifest(source);
 if(!snapshot.operators.rows.length)throw Error('The source has no operators. Use the complete current ClinicalQC database.');
 const qi=snapshot.operators.columns;const role=qi.indexOf('role'),active=qi.indexOf('active');
 if(!snapshot.operators.rows.some(r=>r[role]==='admin'&&r[active]===1))throw Error('No active administrator exists in source.');
 // First statement blocks repeated imports or merges with any pre-existing business data.
 const any=tables.map(t=>`EXISTS(SELECT 1 FROM ${ident(t)})`).join(' OR ');
 const lines=["CREATE TABLE qc_migration_empty_guard (id INTEGER CHECK(id=0));",`INSERT INTO qc_migration_empty_guard(id) SELECT CASE WHEN ${any} THEN 1 ELSE 0 END;`];
 for(const t of tables){const {columns,rows}=snapshot[t];for(const row of rows){const sql=`INSERT INTO ${ident(t)}(${columns.map(ident).join(',')}) VALUES(${row.map(literal).join(',')});`;if(Buffer.byteLength(sql)>95000)throw Error('A source row exceeds safe D1 statement size; use a bound-parameter migration for table '+t);lines.push(sql);}}
 lines.push('DROP TABLE qc_migration_empty_guard;');
 mkdirSync(dirname(resolve(out)),{recursive:true});
 writeFileSync(out,lines.join('\n')+'\n',{mode:0o600,flag:'wx'});
 writeFileSync(out+'.manifest.json',JSON.stringify(summary,null,2)+'\n',{mode:0o600,flag:'wx'});
 return summary;
}
export function verify(expectedFile,destination){
 const expected=JSON.parse(readFileSync(expectedFile,'utf8')),actual=manifest(destination);
 if(expected.format!==actual.format)throw Error('Unsupported migration manifest');
 for(const t of tables){if(JSON.stringify(expected.tables[t])!==JSON.stringify(actual.tables[t]))throw Error('Migration mismatch in '+t);}
 return actual;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,first,second]=process.argv.slice(2);
 if(!first||!second||!['prepare','verify'].includes(command))throw Error('Usage: node scripts/migrate-data.mjs prepare source.sqlite migration-private/data.sql | verify data.sql.manifest.json destination.sqlite');
 const result=command==='prepare'?prepare(first,second):verify(first,second);
 console.log(JSON.stringify({status:command==='prepare'?'Prepared (not imported)':'Verified',tables:Object.fromEntries(tables.map(t=>[t,result.tables[t].count]))}));
}
