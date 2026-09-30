import {excludedHistoricalDepartment,historicalScopeLabel} from './history-scope';
import {parseLegacyDate,reportedOutcome,sha256} from './history-parser';
import {Problem,db,stmt,rows,one,uid,now,auditStmt} from './server';
type R=Record<string,any>;
const actor={id:'site-owner-authorized-import',name:'Owner-authorized import from chat'};
const text=(value:any)=>typeof value==='string'?value.trim():'';
export function workbookSupply(raw:string,label:string){
 const parts=raw.split('|').map(v=>v.trim()),date=parts[1]?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),range=parts[2]?.match(/QC Range\s+(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/i);
 const expires=date?`${date[3]}-${date[1].padStart(2,'0')}-${date[2].padStart(2,'0')}`:null;
 return {supply:{id:'',label,lot:parts[0]||'Not recorded',expires,discard:null,sourceText:raw},range:range?{min:Number(range[1]),max:Number(range[2]),units:'',source:'Reference range recorded in the source workbook'}:null};
}
export function compareWorkbookReading(raw:string,range:R|null){if(!raw||!/^\d+(\.\d+)?$/.test(raw)||!range)return 'not_verified';const n=Number(raw);return n>=range.min&&n<=range.max?'in_range':'out_of_range'}
export async function importWorkbookChunk(entries:R[],index:number,manifest:R){
 if(!Array.isArray(entries)||!entries.length||entries.length>100)throw new Problem('Invalid workbook chunk.');
 const batchId='workbook-'+manifest.workbookHash,partId=`${batchId}:part:${index}`;
 if(await one('SELECT id FROM audit WHERE id=?',partId))return {ok:true,alreadyImported:true,index};
 const excludedRows=entries.filter(e=>excludedHistoricalDepartment(e.department||'')).length;entries=entries.filter(e=>!excludedHistoricalDepartment(e.department||''));
 const ts=now();let batch=await one('SELECT * FROM import_batches WHERE id=?',batchId);
 if(!batch){
  const details={sourceType:'workbook',state:'importing',workbookHash:manifest.workbookHash,dateStart:manifest.dateStart,dateEnd:manifest.dateEnd,expectedRows:manifest.expectedRows,expectedAttempts:manifest.expectedAttempts,summaryRows:manifest.summaryRows,dailyOnlyRows:manifest.dailyOnlyRows,missingTrucks:manifest.missingTrucks,missingSerials:manifest.missingSerials,serialsFromComments:manifest.serialsFromComments,sourceReviewCount:manifest.sourceReviewCount,sourceReviewStatuses:manifest.sourceReviewStatuses,completedParts:[],scopePolicy:historicalScopeLabel,warnings:[historicalScopeLabel,'Only 2026 source records are included. Missing identifiers are retained as gaps for review. Source credentials do not grant current testing access.'],sourcePolicy:'Summary Database values take precedence over matching daily rows. Daily-only rows are included. Original source values and differences are retained.'};
  await stmt('INSERT OR IGNORE INTO import_batches (id,file_hash,filename,created_at,actor_id,actor_name,source_rows,imported_rows,skipped_rows,record_count,details) VALUES (?,?,?,?,?,?,?,0,0,0,?)',batchId,manifest.workbookHash,manifest.filename,ts,actor.id,actor.name,manifest.expectedRows,JSON.stringify(details)).run();
  batch=await one('SELECT * FROM import_batches WHERE id=?',batchId);
 }
 if(JSON.parse(batch.details).state!=='importing')throw new Problem('This workbook import is already complete.',409);
 const departments=await rows("SELECT id,label FROM assets WHERE kind='department'"),deps=new Map(departments.map(d=>[d.label.toLowerCase(),d.id]));const ops:any[]=[];
 for(const e of entries){if(!text(e.department)||!text(e.networkId)||!Number.isInteger(e.sourceRow)||!text(e.sourceSheet))throw new Problem('Source identity is incomplete.');if(!deps.has(e.department.toLowerCase())){const id=uid();deps.set(e.department.toLowerCase(),id);ops.push(stmt('INSERT INTO assets (id,kind,asset_key,label,details,active,revision) VALUES (?,?,?,?,?,1,1)',id,'department',e.department.toLowerCase(),e.department,JSON.stringify({source:'2026 historical workbook'})))}}
 let recordCount=0,exceptionCount=0;
 for(const e of entries){
  const occurredAt=parseLegacyDate(e.recordedDate);if(!/^[A-Z][a-z]{2}\s+\d{1,2}\s+2026\s/.test(e.recordedDate))throw new Problem('Only 2026 source dates are authorized.');
  const fingerprint=await sha256(JSON.stringify([manifest.workbookHash,e.sourceSheet,e.sourceRow,e])),identity=await sha256(JSON.stringify(['workbook',manifest.workbookHash,e.sourceSheet,e.sourceRow]));
  const firstId='history-'+fingerprint+'-1',departmentId=deps.get(e.department.toLowerCase()),operatorId='historical:'+await sha256(e.networkId.toLowerCase());
  ops.push(stmt('INSERT INTO history_rows (fingerprint,identity_key,batch_id,record_id,source_row) VALUES (?,?,?,?,?)',fingerprint,identity,batchId,firstId,e.sourceRow));
  const low=workbookSupply(e.lowSupply,'Level 1 control'),high=workbookSupply(e.highSupply,'Level 3 control'),strip=workbookSupply(e.stripSupply,'Test strips');
  const deviceId=e.serial?'historical-device:'+await sha256(e.serial.replace(/\s/g,'').toLowerCase()):'historical-unidentified:'+fingerprint;
  const attempts=[{number:1,low:e.low,high:e.high,result:e.result},...(e.repeatLow||e.repeatHigh||e.repeatResult?[{number:2,low:e.repeatLow,high:e.repeatHigh,result:e.repeatResult}]:[])];
  const issues:string[]=[],gaps:string[]=[];if(!e.truck)gaps.push('Truck / vehicle was not recorded in the source');if(!e.serial)gaps.push('Device serial number was not recorded in the source');
  if(e.remediation)issues.push('Source remediation: '+e.remediation);
  if(e.sourceReview)issues.push(`Workbook QC review: ${e.sourceReview.status}${e.sourceReview.remediation?' · '+e.sourceReview.remediation:''}`);
  for(const a of attempts){
   const id='history-'+fingerprint+'-'+a.number,lr=compareWorkbookReading(a.low,low.range),hr=compareWorkbookReading(a.high,high.range),comparisonIssues:string[]=[];
   if(lr==='out_of_range')comparisonIssues.push(`Attempt ${a.number}: Level 1 ${a.low} outside recorded range ${low.range!.min}–${low.range!.max}`);
   if(hr==='out_of_range')comparisonIssues.push(`Attempt ${a.number}: Level 3 ${a.high} outside recorded range ${high.range!.min}–${high.range!.max}`);
   if(!a.low||!a.high)comparisonIssues.push(`Attempt ${a.number}: control reading missing`);
   if(reportedOutcome(a.result)==='historical_exception')comparisonIssues.push(`Attempt ${a.number}: ${a.result.replace(/<[^>]*>/g,'')}`);
   issues.push(...comparisonIssues);
   const reported=reportedOutcome(a.result),status=comparisonIssues.length?'historical_exception':reported;
   const missing=[...(!e.serial?['Device serial number']:[]),...(!e.truck?['Truck']:[]),'Measurement units','Temperatures','Preparation checks','Attestation'];
   if(!e.credentialEvidence?.length)missing.push('Credential evidence');
   const snapshot={historical:true,provenance:{sourceType:'workbook',batchId,filename:manifest.filename,fileHash:manifest.workbookHash,sourceSheet:e.sourceSheet,sourceRow:e.sourceRow,originalNetworkId:e.networkId,originalDate:e.recordedDate,reportedResult:a.result,sourceValues:e.sourceValues,dailySource:e.dailySource||null,sourceReview:e.sourceReview||null,remediation:e.remediation||'',serialSource:e.serialSource,originalSerialSelection:e.originalSerialSelection||null,importedAt:ts,importedBy:actor.name,missing,repeatTimeKnown:a.number===1},department:{id:departmentId,label:e.department},device:{id:deviceId,label:e.serial?'Historical glucometer':'Unidentified historical device',serial:e.serial||'Not recorded',model:'Not recorded'},truck:{id:'',label:e.truck||'Not recorded'},strip:strip.supply,low:low.supply,high:high.supply,lowRange:low.range,highRange:high.range,operator:{id:operatorId,name:e.credentialEvidence?.length===1?e.credentialEvidence[0].name:e.networkId,networkId:e.networkId.toLowerCase(),credentialStatus:'historical_not_verified',credentialEvidence:e.credentialEvidence||[],expires:null,credentialRef:'Source workbook evidence retained; current testing authorization not verified'},input:{networkId:e.networkId.toLowerCase(),departmentId,occurredAt,lowValue:a.low!==''?Number(a.low):null,highValue:a.high!==''?Number(a.high):null,lowError:'',highError:'',clean:null,stored:null,attested:null,notes:e.comments,seriesId:firstId,...(a.number===2?{repeatOf:firstId}:{})},status,issues:comparisonIssues,lowResult:lr,highResult:hr};
   if((a.low&&!Number.isFinite(snapshot.input.lowValue))||(a.high&&!Number.isFinite(snapshot.input.highValue)))throw new Problem('Invalid numeric workbook reading.');
   ops.push(stmt('INSERT INTO records (id,operator_id,device_id,occurred_at,created_at,status,snapshot) VALUES (?,?,?,?,?,?,?)',id,operatorId,deviceId,occurredAt,ts,status,JSON.stringify(snapshot)));recordCount++;
  }
  const createException=(category:string,title:string,reviewIssues:string[],status:string,reviewSource:R|null)=>{
   const id=uid(),details={historical:true,sourceType:'workbook',batchId,issues:reviewIssues,operatorName:e.networkId,deviceSerial:e.serial||'Not recorded',truckLabel:e.truck||'Not recorded',departmentId,departmentLabel:e.department,sourceDate:e.recordedDate,filename:manifest.filename,sourceSheet:e.sourceSheet,sourceRow:e.sourceRow,sourceReview:reviewSource};
   ops.push(stmt('INSERT INTO exceptions (id,record_id,device_id,operator_id,category,title,status,created_at,updated_at,details) VALUES (?,?,?,?,?,?,?,?,?,?)',id,firstId,deviceId,operatorId,category,title,status,ts,ts,JSON.stringify(details)));
   ops.push(stmt('INSERT INTO actions (id,exception_id,actor_id,actor_name,created_at,action,notes,details) VALUES (?,?,?,?,?,?,?,?)',uid(),id,actor.id,actor.name,ts,'Historical review imported',reviewSource?`Source status: ${reviewSource.status}. ${reviewSource.remediation||'No remediation note recorded.'} Sent: ${reviewSource.sentRaw||'not recorded'}; fixed: ${reviewSource.fixedRaw||'not recorded'} (source values).`:'Identified while importing the historical source. No current device hold or credential change was applied.',JSON.stringify({sourceReview:reviewSource,sourceDate:e.recordedDate})));exceptionCount++;
  };
  if(issues.length)createException('historical','Historical review: '+issues[0],issues,e.sourceReview?.status==='Resolved'?'closed':'open',e.sourceReview||null);
  if(gaps.length)createException('historical_traceability','Historical identification: '+gaps[0],gaps,'open',null);
 }
 ops.push(stmt("UPDATE import_batches SET imported_rows=imported_rows+?,record_count=record_count+?,skipped_rows=skipped_rows+?,details=json_insert(details,'$.completedParts[#]',?) WHERE id=?",entries.length,recordCount,excludedRows,index,batchId),auditStmt(actor,batchId,'Historical workbook part imported',{part:index,sourceRows:entries.length,excludedRows,attempts:recordCount,exceptions:exceptionCount,sourceHash:manifest.workbookHash},partId));
 try{await db().batch(ops)}catch(e){if(await one('SELECT id FROM audit WHERE id=?',partId))return {ok:true,alreadyImported:true,index};throw e}
 return {ok:true,index,imported:entries.length,excludedRows,recordCount,exceptionCount};
}
export async function finalizeWorkbookImport(manifest:R){
 const batchId='workbook-'+manifest.workbookHash,batch=await one('SELECT * FROM import_batches WHERE id=?',batchId);if(!batch)throw new Problem('Workbook import has not started.');
 const detail=JSON.parse(batch.details);if(detail.state==='complete')return {ok:true,alreadyComplete:true,rows:batch.imported_rows,attempts:batch.record_count};
 const counts=await one("SELECT count(*) AS attempts,sum(CASE WHEN json_extract(snapshot,'$.input.repeatOf') IS NULL THEN 1 ELSE 0 END) AS sessions,sum(CASE WHEN occurred_at<'2026-01-01T06:00:00.000Z' OR occurred_at>='2027-01-01T06:00:00.000Z' THEN 1 ELSE 0 END) AS outsideYear FROM records WHERE json_extract(snapshot,'$.provenance.batchId')=?",batchId);
 const sourceRows=await one('SELECT count(*) AS n FROM history_rows WHERE batch_id=?',batchId);
 if(counts.attempts!==(manifest.expectedEligibleAttempts??manifest.expectedAttempts)||counts.sessions!==(manifest.expectedEligibleRows??manifest.expectedRows)||sourceRows.n!==(manifest.expectedEligibleRows??manifest.expectedRows)||counts.outsideYear||new Set(detail.completedParts).size!==manifest.chunkHashes.length)throw new Problem('Workbook totals are not complete. Finish the remaining parts before replacing the earlier import.',409);
 const old=await one('SELECT * FROM import_batches WHERE id=?','68b831f5-9f3a-447b-8cf5-15652a5cc764');
 if(!old||old.file_hash!=='17dea7ebc3c83e12bee055aca145684705f6ee6f68a0ccce995931fddbdf8084')throw new Problem('The earlier import no longer matches the expected batch. Review before replacing it.',409);
 const oldRecords=await rows("SELECT id,status,snapshot FROM records WHERE json_extract(snapshot,'$.provenance.batchId')=?",old.id);
 if(oldRecords.length!==27||oldRecords.some(r=>!JSON.parse(r.snapshot).historical||!JSON.parse(r.snapshot).provenance.originalDate.includes('2024')))throw new Problem('The earlier import has changed. Review before replacing it.',409);
 const ts=now(),reason='Owner requested only 2026 historical data from the current workbook.';
 await db().batch([
  stmt("UPDATE records SET status='historical_superseded' WHERE json_extract(snapshot,'$.provenance.batchId')=?",old.id),
  stmt("UPDATE import_batches SET details=json_set(details,'$.state','superseded','$.supersededAt',?,'$.reason',?,'$.replacedBy',?) WHERE id=?",ts,reason,batchId,old.id),
  stmt("UPDATE import_batches SET details=json_set(details,'$.state','complete','$.completedAt',?,'$.supersededBatch',?) WHERE id=?",ts,old.id,batchId),
  auditStmt(actor,old.id,'Historical batch superseded',{reason,replacedBy:batchId,recordIds:oldRecords.map(r=>r.id),count:oldRecords.length,preserved:true}),
  auditStmt(actor,batchId,'2026 workbook import completed',{sessions:counts.sessions,attempts:counts.attempts,sourceRows:sourceRows.n,originalWorkbookHash:manifest.workbookHash,superseded2024Records:oldRecords.length})
 ]);
 return {ok:true,rows:counts.sessions,attempts:counts.attempts,superseded2024Records:oldRecords.length};
}
