import {rows,one,stmt,db,auditStmt,uid,now,Problem,decode} from './server';
type R=Record<string,any>;
export const meterSerialKey=(serial:string)=>serial.replace(/\s+/g,'').toLowerCase();

export async function importMeterRegister(entries:R[],index:number,manifest:R,actor:{id:string,name:string}){
 const eventId=`meter-register:${manifest.fileHash}:part:${index}`,prior=await one('SELECT details FROM audit WHERE id=?',eventId);
 if(prior)return {ok:true,alreadyImported:true,...JSON.parse(prior.details)};
 const departments=(await rows("SELECT * FROM assets WHERE kind='department'")).map(decode);
 const devices=(await rows("SELECT * FROM assets WHERE kind='device'")).map(decode);
 const bySerial=new Map<string,R>();
 for(const d of devices){const key=meterSerialKey(d.serial||d.asset_key);if(bySerial.has(key))throw new Problem('Duplicate serial numbers already exist in the register.',409);bySerial.set(key,d)}
 const ts=now(),ops:any[]=[],seen=new Set<string>();let created=0,existingPreserved=0,assigned=0,unassigned=0;
 for(const e of entries){
  if(typeof e.serial!=='string'||!e.serial.trim()||!Array.isArray(e.sourceRows)||!e.sourceRows.length)throw new Problem('Invalid meter source data.');
  const serial=e.serial.trim().replace(/\s+/g,' '),key=meterSerialKey(serial);
  if(seen.has(key))throw new Problem('The import contains a duplicate meter.');seen.add(key);
  const candidates=new Map<string,R>();
  for(const r of e.sourceRows){
   if(!Number.isInteger(r.row)||r.row<4||typeof r.department!=='string'||typeof r.serial!=='string'||meterSerialKey(r.serial)!==key)throw new Problem('Invalid meter source row.');
   const matches=departments.filter(d=>d.label.trim().toLowerCase()===r.department.trim().toLowerCase());
   if(matches.length!==1)throw new Problem('The source department must match exactly one registered department: '+r.department,409);
   if(!matches[0].active)throw new Problem('The source department is inactive: '+r.department,409);
   candidates.set(matches[0].id,matches[0]);
  }
  const old=bySerial.get(key),id=old?.id||uid();
  // Keep a current manual assignment if one was added while the import was prepared.
  const departmentId=old?.departmentId||(candidates.size===1?[...candidates.keys()][0]:'');
  if(departmentId)assigned++;else unassigned++;
  const meterImport={filename:manifest.filename,fileHash:manifest.fileHash,sheet:manifest.sheet,sourceRows:e.sourceRows,columns:{department:'A',serial:'B'},departments:[...candidates.values()].map(d=>({id:d.id,label:d.label})),importedAt:ts,importedBy:actor.name,assignment:old?.departmentId?'Existing register assignment preserved':departmentId?'Single department in source':'Multiple departments in source; not assigned'};
  const details={...(old?JSON.parse(old.details):{}),departmentId,serial:old?.serial||serial,model:old?.model||'',truckId:old?.truckId||'',status:old?.status||'active',meterImport};
  if(old){
   existingPreserved++;
   ops.push(stmt('UPDATE assets SET details=?,revision=revision+1 WHERE id=? AND revision=?',JSON.stringify(details),id,old.revision),auditStmt(actor,id,'Meter source imported',{before:old,meterImport,assignmentPreserved:!!old.departmentId},`asset:${id}:${old.revision}`));
  }else{
   created++;
   ops.push(stmt("INSERT INTO assets (id,kind,asset_key,label,details,active,revision) VALUES (?,'device',?,?,?,1,1)",id,key,'Glucometer '+serial,JSON.stringify(details)),auditStmt(actor,id,'Meter imported',{serial,departmentId,meterImport}));
  }
 }
 const summary={index,meters:entries.length,created,existingPreserved,assigned,unassigned};
 ops.push(auditStmt(actor,eventId,'Meter register part imported',summary,eventId));await db().batch(ops);return {ok:true,...summary};
}

export async function meterRegisterSummary(manifest:R){
 const meters=(await rows("SELECT * FROM assets WHERE kind='device' AND json_extract(details,'$.meterImport.fileHash')=?",manifest.fileHash)).map(decode);
 const partIds=manifest.chunkHashes.map((_:string,index:number)=>`meter-register:${manifest.fileHash}:part:${index}`);
 const parts=await rows(`SELECT id FROM audit WHERE id IN (${partIds.map(()=>'?').join(',')})`,...partIds);
 if(meters.length!==manifest.meters||parts.length!==manifest.chunkHashes.length)throw new Problem('Meter import is incomplete.',409);
 const sourceRows=meters.reduce((n,m)=>n+m.meterImport.sourceRows.length,0);
 if(sourceRows!==manifest.sourceRows)throw new Problem('The imported source row count does not match.',409);
 const departments=(await rows("SELECT * FROM assets WHERE kind='department'")).map(decode);
 return {ok:true,meters:meters.length,sourceRows,assigned:meters.filter(m=>m.departmentId).length,unassigned:meters.filter(m=>!m.departmentId).map(m=>({serial:m.serial,departments:m.meterImport.departments.map((d:R)=>d.label)})),modelsNotRecorded:meters.filter(m=>!m.model).length,truckAssignments:meters.filter(m=>m.truckId).length,byDepartment:departments.map(d=>({department:d.label,meters:meters.filter(m=>m.departmentId===d.id).length})).filter(d=>d.meters)};
}
