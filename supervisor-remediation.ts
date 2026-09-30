import {rows,one,stmt,db,auditStmt,uid,now,Problem} from './server';
import {sha256} from './history-parser';

export const remediationComment='supervisor remediated';
export const userPlaceholder='MercyEMS';
export const userPlaceholderReason='Owner assigned MercyEMS as an administrative placeholder for an unresolved unknown historical user ID. The original ID is retained; this does not identify a tester or verify credentials.';
const eventId='supervisor-remediation-mercyems-2026-09-29';
const openStatuses="('open','assigned','in_review','awaiting_review')";

async function selection(cutoff:string){
 const exceptions=await rows(`SELECT * FROM exceptions WHERE status IN ${openStatuses} AND created_at<=? ORDER BY id`,cutoff);
 const records=await rows(`SELECT * FROM records WHERE json_extract(snapshot,'$.historical')=1 AND status NOT IN ('historical_superseded','historical_excluded') AND created_at<=? AND COALESCE(json_extract(snapshot,'$.operator.isPlaceholder'),0)=0 AND (upper(trim(COALESCE(json_extract(snapshot,'$.provenance.remediation'),'')))='UNKNOWN USERID' OR (json_extract(snapshot,'$.provenance.sourceReview.status')='Open' AND upper(trim(COALESCE(json_extract(snapshot,'$.provenance.sourceReview.remediation'),'')))='UNKNOWN USERID')) ORDER BY id`,cutoff);
 const digest=await sha256(JSON.stringify({cutoff,exceptions:exceptions.map(e=>[e.id,e.revision,e.status,e.details]),records:records.map(r=>[r.id,r.snapshot])}));
 return {exceptions,records,digest};
}

export async function previewSupervisorRemediation(cutoff:string){
 const prior=await one('SELECT details FROM audit WHERE id=?',eventId);if(prior)return {ok:true,alreadyApplied:true,...JSON.parse(prior.details)};
 const {exceptions,records,digest}=await selection(cutoff);
 return {ok:true,digest,openExceptions:exceptions.length,unknownUserSessions:records.filter(r=>!JSON.parse(r.snapshot).input.repeatOf).length,unknownUserAttempts:records.length,comment:remediationComment,userId:userPlaceholder};
}

export async function applySupervisorRemediation(actor:{id:string,name:string},cutoff:string,expectedDigest:string){
 const prior=await one('SELECT details FROM audit WHERE id=?',eventId);if(prior)return {ok:true,alreadyApplied:true,...JSON.parse(prior.details)};
 const {exceptions,records,digest}=await selection(cutoff);
 if(digest!==expectedDigest)throw new Problem('Records changed after preview. Review the current set before applying this update.',409);
 const ts=now(),ops:any[]=[],changed=new Map<string,any>();let sessions=0;
 for(const r of records){
  const s=JSON.parse(r.snapshot),originalOperator=s.operator,originalInputNetworkId=s.input.networkId;
  const placeholder={value:userPlaceholder,reason:userPlaceholderReason,originalOperator,originalInputNetworkId,appliedAt:ts,appliedBy:actor.name,actorId:actor.id};
  s.operator={...originalOperator,name:userPlaceholder,networkId:userPlaceholder,isPlaceholder:true,placeholderReason:userPlaceholderReason};s.input.networkId=userPlaceholder;
  s.provenance={...s.provenance,userPlaceholder:placeholder};changed.set(r.id,placeholder);if(!s.input.repeatOf)sessions++;
  const updated=JSON.stringify(s);
  ops.push(stmt('UPDATE records SET snapshot=? WHERE id=? AND snapshot=?',updated,r.id,r.snapshot));
  // A concurrent record edit causes a NOT NULL violation and rolls back the whole batch.
  ops.push(stmt('INSERT INTO audit (id,actor_id,actor_name,created_at,entity_id,event,details) VALUES (CASE WHEN EXISTS (SELECT 1 FROM records WHERE id=? AND snapshot=?) THEN ? ELSE NULL END,?,?,?,?,?,?)',r.id,updated,uid(),actor.id,actor.name,ts,r.id,'Unknown historical user ID assigned placeholder',JSON.stringify({before:originalOperator,originalInputNetworkId,after:s.operator,sourcePreserved:true,reason:userPlaceholderReason})));
 }
 for(const ex of exceptions){
  const details=JSON.parse(ex.details),placeholder=changed.get(ex.record_id);
  if(placeholder){details.operatorName=userPlaceholder;details.operatorPlaceholder=true;details.originalOperatorName=JSON.parse(ex.details).operatorName;details.operatorPlaceholderReason=userPlaceholderReason}
  details.supervisorRemediation={comment:remediationComment,closedAt:ts,closedBy:actor.name,actorId:actor.id,previousStatus:ex.status};
  ops.push(stmt("UPDATE exceptions SET status='closed',details=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?",JSON.stringify(details),ts,ex.id,ex.revision),
   stmt('INSERT INTO actions (id,exception_id,actor_id,actor_name,created_at,action,notes,details) VALUES (?,?,?,?,?,?,?,?)',uid(),ex.id,actor.id,actor.name,ts,'Close exception',remediationComment,JSON.stringify({status:'closed',previousStatus:ex.status,bulkOperation:eventId,...(placeholder?{userId:userPlaceholder,isPlaceholder:true,originalUserId:placeholder.originalOperator.networkId}:{})})),
   auditStmt(actor,ex.id,'Close exception',{notes:remediationComment,previousStatus:ex.status,status:'closed',beforeDetails:JSON.parse(ex.details),bulkOperation:eventId,sourcePreserved:true},`exception:${ex.id}:${ex.revision}`));
 }
 const summary={closedExceptions:exceptions.length,updatedUserSessions:sessions,updatedUserAttempts:records.length,comment:remediationComment,userId:userPlaceholder,sourcePreserved:true,closedAt:ts,cutoff,recordIds:records.map(r=>r.id),closedExceptionIds:exceptions.map(e=>e.id)};
 ops.push(auditStmt(actor,eventId,'Owner-authorized exception closure and unknown user placeholders',summary,eventId));
 await db().batch(ops);
 const remaining=await one(`SELECT count(*) AS n FROM exceptions WHERE status IN ${openStatuses}`);
 return {ok:true,...summary,remainingOpenExceptions:remaining.n};
}
