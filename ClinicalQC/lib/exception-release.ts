import {db,one,stmt,now,uid,Problem} from './server';
import {centralDay} from './qc-rules';
import {centralDayBounds} from './report';
type Row=Record<string,any>;

// Closing and releasing are one transaction. The first audit insert is guarded
// against changed QC, device state, exception revision, and reviewer assignment.
// Every subsequent write requires that exact audit ID, so a failed guard is a no-op.
export async function closeExceptionAndRelease(actor:Row,ex:Row,notes:string,assignee:string|null,due:string|null){
 if(actor.role!=='admin'&&(actor.role!=='supervisor'||ex.assignee!==actor.id))throw new Problem('Only an administrator or the assigned supervisor can close this exception.',403);
 if(!ex.device_id)throw new Problem('This exception is not linked to a device hold. Close it without clearing a hold.');
 const device=await one("SELECT * FROM assets WHERE id=? AND kind='device'",ex.device_id);
 if(!device||!device.active||JSON.parse(device.details).status!=='hold')throw new Problem('This device is not active and on hold. Close the exception without clearing a hold.');
 const pending=await one("SELECT count(*) AS n FROM exceptions WHERE device_id=? AND id!=? AND status NOT IN ('closed','excluded')",device.id,ex.id);
 if(pending.n)throw new Problem('Other exceptions for this device are still open. Close them first, or leave Clear device hold unchecked.');
 const latest=await one('SELECT * FROM records WHERE device_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1',device.id);
 const day=centralDay();
 if(!latest||latest.status!=='pass'||centralDay(new Date(latest.occurred_at))!==day)throw new Problem('The latest QC must pass both low and high controls today (Central time). Record a passing QC, or leave Clear device hold unchecked.');
 const {start,end}=centralDayBounds(day),ts=now(),releaseAuditId=uid();
 const details={notes,exceptionId:ex.id,recordId:latest.id,deviceId:device.id,deviceSerial:JSON.parse(device.details).serial,via:'exception_closure'};
 const actionDetails={assignee,due,status:'closed',deviceReleased:true,deviceId:device.id,releaseRecordId:latest.id,releaseAuditId};
 const guard=`EXISTS (SELECT 1 FROM audit WHERE id=?)`;
 const result=await db().batch([
  stmt(`INSERT INTO audit (id,actor_id,actor_name,created_at,entity_id,event,details)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM assets d JOIN exceptions e ON e.device_id=d.id
      WHERE d.id=? AND d.kind='device' AND d.active=1 AND d.revision=? AND json_extract(d.details,'$.status')='hold'
      AND e.id=? AND e.revision=? AND e.status NOT IN ('closed','excluded')
      AND (?='admin' OR e.assignee=?)
      AND NOT EXISTS (SELECT 1 FROM exceptions other WHERE other.device_id=d.id AND other.id!=e.id AND other.status NOT IN ('closed','excluded'))
      AND (SELECT id FROM records WHERE device_id=d.id ORDER BY created_at DESC, rowid DESC LIMIT 1)=?
      AND EXISTS (SELECT 1 FROM records r WHERE r.id=? AND r.device_id=d.id AND r.status='pass' AND r.occurred_at>=? AND r.occurred_at<?)
    )`,releaseAuditId,actor.id,actor.name,ts,device.id,'Device returned to service',JSON.stringify(details),device.id,device.revision,ex.id,ex.revision,actor.role,actor.id,latest.id,latest.id,start,end),
  stmt(`UPDATE exceptions SET status='closed',assignee=?,due=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND ${guard}`,assignee,due,ts,ex.id,ex.revision,releaseAuditId),
  stmt(`UPDATE assets SET details=json_set(details,'$.status','active'),revision=revision+1 WHERE id=? AND ${guard}`,device.id,releaseAuditId),
  stmt(`INSERT INTO actions (id,exception_id,actor_id,actor_name,created_at,action,notes,details) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,uid(),ex.id,actor.id,actor.name,ts,'Close exception',notes,JSON.stringify(actionDetails),releaseAuditId),
  stmt(`INSERT INTO audit (id,actor_id,actor_name,created_at,entity_id,event,details) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,`exception:${ex.id}:${ex.revision}`,actor.id,actor.name,ts,ex.id,'Close exception',JSON.stringify({...actionDetails,notes}),releaseAuditId)
 ]);
 if(!result[0].meta.changes)throw new Problem('The device, QC, or exception changed during review. Refresh and review it again before clearing the hold.',409);
 return {ok:true,deviceReleased:true,deviceId:device.id,recordId:latest.id};
}
