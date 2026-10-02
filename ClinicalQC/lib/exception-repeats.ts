// Resolve descendants of the exception's original record, not unrelated checks
// on the same meter. UNION prevents cycles in malformed imported references.
export function exceptionRepeatSql(count:number){
 if(!Number.isInteger(count)||count<1||count>100)throw new Error('Invalid repeat query size');
 return `WITH RECURSIVE linked(exception_id,id,device_id) AS (
 SELECT e.id,r.id,r.device_id FROM exceptions e JOIN records r ON r.id=e.record_id
 WHERE e.id IN (${Array(count).fill('?').join(',')})
 AND r.status IN ('pass','exception') AND COALESCE(json_extract(r.snapshot,'$.historical'),0)=0
 UNION
 SELECT p.exception_id,r.id,r.device_id FROM linked p JOIN records r
 ON json_extract(r.snapshot,'$.input.repeatOf')=p.id AND r.device_id=p.device_id
 WHERE r.status IN ('pass','exception') AND COALESCE(json_extract(r.snapshot,'$.historical'),0)=0
 ), ranked AS (
 SELECT p.exception_id,r.*,ROW_NUMBER() OVER(PARTITION BY p.exception_id ORDER BY r.occurred_at DESC,r.created_at DESC,r.rowid DESC) AS rank
 FROM linked p JOIN records r ON r.id=p.id JOIN exceptions e ON e.id=p.exception_id
 WHERE r.id!=e.record_id
 ) SELECT * FROM ranked WHERE rank=1`;
}
export function repeatSummary(record:Record<string,any>){
 const s=JSON.parse(record.snapshot),v=s.input||{};
 return {id:record.id,status:record.status,occurredAt:record.occurred_at,
 operatorName:s.operator?.name||s.operator?.identifier||'Not recorded',
 low:v.lowError||v.lowValue,high:v.highError||v.highValue};
}
