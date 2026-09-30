import {rows,one,stmt,db,auditStmt,uid,now,Problem} from './server';
export const truckPlaceholderReason='Owner assigned 9999 as an administrative placeholder because the historical source did not record the truck number. The original vehicle remains unknown.';
export async function assignHistoricalTruckPlaceholder(actor:{id:string,name:string},expectedAttempts?:number){
 const eventId='historical-truck-placeholder-9999-2026-09-29',prior=await one('SELECT details FROM audit WHERE id=?',eventId);if(prior)return {ok:true,alreadyApplied:true,...JSON.parse(prior.details)};
 const selected=await rows("SELECT * FROM records WHERE json_extract(snapshot,'$.historical')=1 AND status NOT IN ('historical_superseded','historical_excluded') AND lower(trim(COALESCE(json_extract(snapshot,'$.truck.label'),''))) IN ('','not recorded')");
 if(expectedAttempts!==undefined&&selected.length!==expectedAttempts)throw new Problem('The set of missing-truck records has changed. Review the current records before applying the placeholder.',409);
 const ts=now(),ops:any[]=[],ids=selected.map(r=>r.id),batches=new Map<string,{sessions:number,attempts:number}>();let sessions=0;
 for(const r of selected){const s=JSON.parse(r.snapshot),originalTruck=s.truck||null,placeholder={value:'9999',reason:truckPlaceholderReason,originalTruck,appliedAt:ts,appliedBy:actor.name,actorId:actor.id};
  s.truck={...(s.truck||{id:''}),label:'9999',isPlaceholder:true,placeholderReason:truckPlaceholderReason};s.provenance={...s.provenance,truckPlaceholder:placeholder};
  ops.push(stmt('UPDATE records SET snapshot=? WHERE id=?',JSON.stringify(s),r.id),auditStmt(actor,r.id,'Historical truck placeholder assigned',{before:originalTruck,after:s.truck,sourcePreserved:true,reason:truckPlaceholderReason}));
  if(!s.input.repeatOf)sessions++;if(s.provenance.batchId){const b=batches.get(s.provenance.batchId)||{sessions:0,attempts:0};b.attempts++;if(!s.input.repeatOf)b.sessions++;batches.set(s.provenance.batchId,b)}
 }
 let closedExceptions=0,otherExceptionsRetained=0;const closedExceptionIds:string[]=[];
 for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50),exs=await rows(`SELECT * FROM exceptions WHERE record_id IN (${chunk.map(()=>'?').join(',')}) AND status!='excluded'`,...chunk);
  for(const ex of exs){const details=JSON.parse(ex.details),originalIssues:Array<string>=Array.isArray(details.issues)?details.issues:[],isTruckIssue=(v:string)=>/^Truck\s*\/\s*vehicle was not recorded in the source$/i.test(v.trim()),hasTruckIssue=ex.category==='historical_traceability'&&originalIssues.some(isTruckIssue),remaining=hasTruckIssue?originalIssues.filter(v=>!isTruckIssue(v)):originalIssues;
   let status=ex.status,title=ex.title;if(hasTruckIssue&&remaining.length===0&&status!=='closed'){status='closed';closedExceptions++;closedExceptionIds.push(ex.id)}else if(status!=='closed')otherExceptionsRetained++;
   if(hasTruckIssue&&remaining.length)title='Historical identification: '+remaining[0];
   details.truckLabel='9999';details.truckPlaceholder=true;details.truckPlaceholderReason=truckPlaceholderReason;
   if(hasTruckIssue){details.issues=remaining;details.truckPlaceholderResolution={originalIssues,remainingIssues:remaining,appliedAt:ts,appliedBy:actor.name,reason:truckPlaceholderReason};ops.push(stmt('INSERT INTO actions (id,exception_id,actor_id,actor_name,created_at,action,notes,details) VALUES (?,?,?,?,?,?,?,?)',uid(),ex.id,actor.id,actor.name,ts,status==='closed'?'Missing-truck exception resolved with placeholder':'Truck placeholder assigned; other issues remain',truckPlaceholderReason,JSON.stringify({truck:'9999',isPlaceholder:true,status,originalIssues,remainingIssues:remaining})));}
   ops.push(stmt('UPDATE exceptions SET details=?,title=?,status=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?',JSON.stringify(details),title,status,ts,ex.id,ex.revision),auditStmt(actor,ex.id,'Historical truck placeholder recorded',{truck:'9999',isPlaceholder:true,previousStatus:ex.status,status,sourcePreserved:true},`exception:${ex.id}:${ex.revision}`));
  }
 }
 for(const [batchId,counts] of batches)ops.push(stmt("UPDATE import_batches SET details=json_set(details,'$.truckPlaceholders',json(?)) WHERE id=?",JSON.stringify({value:'9999',...counts,appliedAt:ts,reason:truckPlaceholderReason}),batchId));
 const summary={updatedSessions:sessions,updatedAttempts:selected.length,closedExceptions,otherExceptionsRetained,truck:'9999',isPlaceholder:true,reason:truckPlaceholderReason,recordIds:ids,closedExceptionIds};
 ops.push(auditStmt(actor,eventId,'Missing historical trucks assigned administrative placeholder',summary,eventId));await db().batch(ops);
 return {ok:true,...summary};
}
