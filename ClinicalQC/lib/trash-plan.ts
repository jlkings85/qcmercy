type Row=Record<string,any>;
export const TRASH_CATEGORIES:Record<string,{table:string;label:string;kind?:string}>={
 records:{table:'records',label:'QC records'},exceptions:{table:'exceptions',label:'Exceptions'},temperature_records:{table:'temperature_records',label:'Temperature records'},operators:{table:'operators',label:'Users'},
 department:{table:'assets',kind:'department',label:'Counties / departments'},truck:{table:'assets',kind:'truck',label:'Trucks'},device:{table:'assets',kind:'device',label:'Devices'},location:{table:'assets',kind:'location',label:'Supply locations'},strip:{table:'assets',kind:'strip',label:'Strip lots'},low:{table:'assets',kind:'low',label:'Low control lots'},high:{table:'assets',kind:'high',label:'High control lots'},range:{table:'assets',kind:'range',label:'Ranges'},import_batches:{table:'import_batches',label:'Historical imports'},actions:{table:'actions',label:'Review actions'},audit:{table:'audit',label:'Audit entries'}
};
export const TRASH_TABLES=['assets','operators','records','temperature_records','exceptions','actions','import_batches','history_rows','qc_login_links','qc_invitations','audit'];
export const rowKey=(table:string)=>table==='history_rows'?'fingerprint':table==='qc_login_links'?'operator_id':'id';
const parsed=(r:Row)=>JSON.parse(r.snapshot||r.details||'{}');
export function trashLabel(table:string,r:Row){const d=parsed(r);return r.label||r.name||r.filename||r.title||r.action||r.event||(table==='records'?`${d.device?.serial||'Unknown meter'} · ${d.truck?.label||''} · ${d.operator?.name||''} · ${r.occurred_at}`:table==='temperature_records'?`${d.location?.label||r.location_id} · ${r.observed_date}`:r.id);}
export function planTrash(data:Record<string,Row[]>,category:string,ids:string[],ownerId:string){
 const c=TRASH_CATEGORIES[category];if(!c)throw Error('Choose a category.');
 if(!Array.isArray(ids)||!ids.length||ids.length>100)throw Error('Select between 1 and 100 items.');
 const selected:Record<string,Row[]>=Object.fromEntries(TRASH_TABLES.map(t=>[t,[]]));
 const add=(t:string,r:Row)=>{if(!selected[t].some(x=>x[rowKey(t)]===r[rowKey(t)])){selected[t].push(r);return true}return false};
 for(const id of new Set(ids)){const r=data[c.table].find(r=>r.id===id&&(!c.kind||r.kind===c.kind));if(!r)throw Error('An item changed or was removed. Refresh the list.');add(c.table,r);}
 const has=(t:string,id:string)=>selected[t].some(r=>r[rowKey(t)]===id);
 let changed=true;while(changed){changed=false;
 for(const r of data.assets){const d=parsed(r);if(has('assets',d.departmentId)||has('assets',d.truckId)||has('assets',d.stripId)||has('assets',d.controlId))changed=add('assets',r)||changed;}
 for(const r of data.records){const s=parsed(r);if(has('import_batches',s.provenance?.batchId)||has('records',s.input?.repeatOf))changed=add('records',r)||changed;}
 for(const r of data.temperature_records)if(has('records',r.qc_record_id))changed=add('temperature_records',r)||changed;
 for(const r of data.exceptions)if(has('records',r.record_id)||has('temperature_records',parsed(r).temperatureRecordId))changed=add('exceptions',r)||changed;
 for(const r of data.actions)if(has('exceptions',r.exception_id))changed=add('actions',r)||changed;
 for(const r of data.history_rows)if(has('records',r.record_id)||has('import_batches',r.batch_id))changed=add('history_rows',r)||changed;
 for(const t of ['qc_login_links','qc_invitations'])for(const r of data[t])if(has('operators',r.operator_id))changed=add(t,r)||changed;
 }
 if(has('operators',ownerId))throw Error('Your owner account cannot be moved to trash.');
 for(const r of data.exceptions)if(has('operators',r.assignee)&&!has('exceptions',r.id)&&!['closed','excluded'].includes(r.status))throw Error('Reassign this user’s open exceptions before moving the user to trash.');
 const total=Object.values(selected).reduce((n,rs)=>n+rs.length,0);if(total>500)throw Error('This selection includes more than 500 linked items. Select a smaller group.');
 return {selected,total,counts:Object.fromEntries(Object.entries(selected).filter(([,rs])=>rs.length).map(([t,rs])=>[t,rs.length]))};
}
