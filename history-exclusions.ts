import {excludedHistoricalDepartment,historicalScopeLabel} from './history-scope';
import {rows,one,stmt,db,auditStmt,now,Problem} from './server';
export async function excludeHistoricalDepartments(actor:{id:string,name:string},expectedAttempts?:number){
 const eventId='historical-scope-exclusion-neonatal-lifeline-2026-09-29';
 const prior=await one('SELECT details FROM audit WHERE id=?',eventId);if(prior)return {ok:true,alreadyApplied:true,...JSON.parse(prior.details)};
 const active=await rows("SELECT id,status,json_extract(snapshot,'$.department.label') AS department,json_extract(snapshot,'$.provenance.batchId') AS batchId,json_extract(snapshot,'$.input.repeatOf') AS repeatOf,json_extract(snapshot,'$.truck.label') AS truck,json_extract(snapshot,'$.device.serial') AS serial FROM records WHERE json_extract(snapshot,'$.historical')=1 AND status NOT IN ('historical_superseded','historical_excluded')");
 const selected=active.filter(r=>excludedHistoricalDepartment(r.department||'')),keep=active.filter(r=>!excludedHistoricalDepartment(r.department||''));
 if(expectedAttempts!==undefined&&selected.length!==expectedAttempts)throw new Problem('Historical scope changed. Review the selected records before applying the exclusion.',409);
 const ts=now(),ids=selected.map(r=>r.id),ops:any[]=[],exceptionIds:string[]=[];
 for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50),marks=chunk.map(()=>'?').join(',');
  const ex=await rows(`SELECT id FROM exceptions WHERE record_id IN (${marks}) AND status!='excluded'`,...chunk);exceptionIds.push(...ex.map(e=>e.id));
  ops.push(stmt(`UPDATE records SET snapshot=json_set(snapshot,'$.provenance.scopeExclusion',json_object('reason',?,'excludedAt',?,'previousStatus',status)),status='historical_excluded' WHERE id IN (${marks})`,historicalScopeLabel,ts,...chunk));
  ops.push(stmt(`UPDATE exceptions SET details=json_set(details,'$.scopeExclusion',json_object('reason',?,'excludedAt',?,'previousStatus',status)),status='excluded',updated_at=?,revision=revision+1 WHERE record_id IN (${marks}) AND status!='excluded'`,historicalScopeLabel,ts,ts,...chunk));
 }
 const batches=[...new Set(selected.map(r=>r.batchId).filter(Boolean))];
 for(const batchId of batches){const excluded=selected.filter(r=>r.batchId===batchId),retained=keep.filter(r=>r.batchId===batchId);ops.push(stmt("UPDATE import_batches SET details=json_set(details,'$.scopeExclusions',json(?),'$.activeRows',?,'$.activeAttempts',?) WHERE id=?",JSON.stringify({reason:historicalScopeLabel,appliedAt:ts,sessions:excluded.filter(r=>!r.repeatOf).length,attempts:excluded.length,departments:[...new Set(excluded.map(r=>r.department))]}),retained.filter(r=>!r.repeatOf).length,retained.length,batchId))}
 const result={excludedSessions:selected.filter(r=>!r.repeatOf).length,excludedAttempts:selected.length,excludedExceptions:exceptionIds.length,departments:[...new Set(selected.map(r=>r.department))].sort(),remainingSessions:keep.filter(r=>!r.repeatOf).length,remainingAttempts:keep.length,remainingMissingTrucks:keep.filter(r=>!r.repeatOf&&r.truck==='Not recorded').length,remainingMissingSerials:keep.filter(r=>!r.repeatOf&&r.serial==='Not recorded').length,reason:historicalScopeLabel,recordIds:ids,exceptionIds};
 ops.push(auditStmt(actor,eventId,'Historical departments excluded',{...result,preserved:true},eventId));await db().batch(ops);
 return {ok:true,...result};
}
