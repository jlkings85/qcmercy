// Called only after the validated QC insert, in the same database transaction.
export function qcDeviceLocationStatements(db:any,recordId:string,actor:{id:string;name:string},savedAt:string){
 const eventId='qc-location:'+recordId;
 const prepare=(sql:string,...args:any[])=>db.prepare(sql).bind(...args);
 return [
  prepare(`INSERT INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details)
   SELECT ?,?,?,?,r.device_id,'Device location confirmed by QC',json_object(
    'recordId',r.id,'occurredAt',r.occurred_at,'truckId',json_extract(r.snapshot,'$.truck.id'),
    'truckLabel',json_extract(r.snapshot,'$.truck.label'),'serial',json_extract(r.snapshot,'$.device.serial'),
    'previousTruckId',json_extract(d.details,'$.truckId'),
    'displacedDevices',json((SELECT json_group_array(json_object('id',a.id,'serial',json_extract(a.details,'$.serial')))
     FROM assets a WHERE a.kind='device' AND a.id!=r.device_id AND json_extract(a.details,'$.truckId')=json_extract(r.snapshot,'$.truck.id'))))
   FROM records r JOIN assets d ON d.id=r.device_id AND d.kind='device'
   WHERE r.id=? AND NOT EXISTS(SELECT 1 FROM audit WHERE id=?)
    AND NOT EXISTS(SELECT 1 FROM records newer WHERE newer.status NOT IN ('historical_excluded','historical_superseded')
     AND (newer.device_id=r.device_id OR json_extract(newer.snapshot,'$.truck.id')=json_extract(r.snapshot,'$.truck.id'))
     AND (newer.occurred_at>r.occurred_at OR (newer.occurred_at=r.occurred_at AND newer.rowid>r.rowid)))`,eventId,actor.id,actor.name,savedAt,recordId,eventId),
  prepare(`UPDATE assets SET details=json_set(details,'$.truckId','','$.locationRecordId',?,'$.locationUpdatedAt',?),revision=revision+1
   WHERE kind='device' AND id!=(SELECT device_id FROM records WHERE id=?)
   AND json_extract(details,'$.truckId')=(SELECT json_extract(snapshot,'$.truck.id') FROM records WHERE id=?)
   AND EXISTS(SELECT 1 FROM audit WHERE id=?)`,recordId,savedAt,recordId,recordId,eventId),
  prepare(`UPDATE assets SET details=json_set(details,'$.truckId',(SELECT json_extract(snapshot,'$.truck.id') FROM records WHERE id=?),
   '$.locationRecordId',?,'$.locationUpdatedAt',?,'$.locationObservedAt',(SELECT occurred_at FROM records WHERE id=?)),revision=revision+1
   WHERE id=(SELECT device_id FROM records WHERE id=?) AND EXISTS(SELECT 1 FROM audit WHERE id=?)`,recordId,recordId,savedAt,recordId,recordId,eventId),
 ];
}
