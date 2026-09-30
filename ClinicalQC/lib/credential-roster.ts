import {rows,one,stmt,db,auditStmt,uid,now,Problem,date} from './server';
import {credentialValid,centralDay} from './qc-rules';
type R=Record<string,any>;
export async function importCredentialRoster(entries:R[],index:number,manifest:R,actor:{id:string,name:string}){
 const eventId=`credential-roster:${manifest.fileHash}:part:${index}`,prior=await one('SELECT details FROM audit WHERE id=?',eventId);
 if(prior)return {ok:true,alreadyImported:true,...JSON.parse(prior.details)};
 const existing=await rows('SELECT * FROM operators'),byEmail=new Map(existing.map(u=>[u.email.toLowerCase(),u]));
 const byNetwork=new Map(existing.filter(u=>u.network_id).map(u=>[u.network_id.toLowerCase(),u]));
 const ts=now(),ops:any[]=[],seenEmails=new Set<string>(),seenIds=new Set<string>();let created=0,updated=0,emailIdentifiers=0,current=0,expired=0;
 for(const e of entries){
  if(typeof e.email!=='string'||!/^\S+@\S+\.\S+$/.test(e.email)||typeof e.name!=='string'||!e.name.trim()||!Array.isArray(e.sourceRows))throw new Problem('Invalid roster identity or evidence.');
  const email=e.email.trim().toLowerCase(),networkId=e.networkId||null,validSince=date(e.validSince,'credential valid since')!,validUntil=date(e.validUntil,'credential valid until')!;
  if(validSince>validUntil||seenEmails.has(email)||networkId&&(typeof networkId!=='string'||!/[a-z]/.test(networkId)||!/^[a-z0-9._-]{2,80}$/.test(networkId)||seenIds.has(networkId)))throw new Problem('Invalid or duplicate roster data.');
  seenEmails.add(email);if(networkId)seenIds.add(networkId);
  const old=byEmail.get(email),sameNetwork=networkId?byNetwork.get(networkId):null;
  if(sameNetwork&&sameNetwork.id!==old?.id)throw new Problem('A Network ID belongs to another account. Review before importing.',409);
  if(old?.network_id&&networkId&&old.network_id!==networkId)throw new Problem('An existing Network ID conflicts with the roster.',409);
  const id=old?.id||uid(),before=old?JSON.parse(old.details):{},resolvedNetwork=old?.network_id||networkId;
  const credentialImport={filename:manifest.filename,fileHash:manifest.fileHash,sheet:manifest.sheet,sourceRow:e.sourceRow,sourceRows:e.sourceRows,importedAt:ts,importedBy:actor.name,validSinceColumn:'K',validUntilColumn:'L',personalId:e.personalId,networkIdMapping:networkId?'Alphabetic Personal ID':'Network ID not established by this report',organization:e.organization,positions:e.positions,groups:e.groups};
  const details={...before,employeeId:before.employeeId||(/^\d+$/.test(e.personalId)?e.personalId:''),validSince,credentialRef:`EMS1 Academy · ${manifest.filename} · ${manifest.sheet} row ${e.sourceRow} · K/L`,credentialImport};
  const status=old?.credential_status==='suspended'?'suspended':'verified';
  const user={...old,active:old?.active??1,credential_status:status,expires:validUntil,...details,verified_by:actor.id,verified_at:ts};
  if(credentialValid(user))current++;if(validUntil<centralDay())expired++;if(!resolvedNetwork)emailIdentifiers++;
  if(old){updated++;ops.push(stmt('UPDATE operators SET network_id=?,credential_status=?,expires=?,details=?,verified_by=?,verified_at=?,revision=revision+1 WHERE id=? AND revision=?',resolvedNetwork,status,validUntil,JSON.stringify(details),actor.id,ts,id,old.revision),auditStmt(actor,id,'Credential roster updated',{source:manifest.filename,fileHash:manifest.fileHash,sourceRows:e.sourceRows.map((r:R)=>r.row),validSince,validUntil,before:old,rolePreserved:true},`user:${id}:${old.revision}`));}
  else{created++;ops.push(stmt("INSERT INTO operators (id,network_id,email,name,role,active,credential_status,expires,details,verified_by,verified_at,revision) VALUES (?,?,?,?,'operator',1,?,?,?,?,?,1)",id,resolvedNetwork,email,e.name.trim(),status,validUntil,JSON.stringify(details),actor.id,ts),auditStmt(actor,id,'User and credential imported',{source:manifest.filename,fileHash:manifest.fileHash,sourceRows:e.sourceRows.map((r:R)=>r.row),validSince,validUntil,networkId:resolvedNetwork,role:'operator'}));}
 }
 const summary={index,users:entries.length,created,updated,current,expired,emailIdentifiers};
 ops.push(auditStmt(actor,eventId,'Credential roster part imported',summary,eventId));await db().batch(ops);return {ok:true,...summary};
}
export async function credentialRosterSummary(manifest:R){
 const users=(await rows("SELECT * FROM operators WHERE json_extract(details,'$.credentialImport.fileHash')=?",manifest.fileHash)).map(u=>({...u,...JSON.parse(u.details)}));
 const partIds=manifest.chunkHashes.map((_:string,index:number)=>`credential-roster:${manifest.fileHash}:part:${index}`);
 const parts=await rows(`SELECT id FROM audit WHERE id IN (${partIds.map(()=>'?').join(',')})`,...partIds);
 if(users.length!==manifest.users||parts.length!==manifest.chunkHashes.length)throw new Problem('Credential import is incomplete.',409);
 return {ok:true,users:users.length,sourceRows:manifest.sourceRows,current:users.filter(u=>credentialValid(u)).length,expired:users.filter(u=>u.expires<centralDay()).length,emailIdentifiers:users.filter(u=>!u.network_id).length,validSinceColumn:'K',validUntilColumn:'L'};
}
