import {one,stmt,db,now,auditStmt,admin,Problem} from './server';
export type TemperatureSettings={qcEnabled:boolean,storageEnabled:boolean,revision:number,updatedAt?:string,updatedBy?:string};
export async function getTemperatureSettings():Promise<TemperatureSettings>{
 const row=await one("SELECT * FROM application_settings WHERE id='temperature-recording'");
 if(!row)return {qcEnabled:true,storageEnabled:true,revision:0};
 const details=JSON.parse(row.details);
 return {qcEnabled:details.qcEnabled!==false,storageEnabled:details.storageEnabled!==false,revision:row.revision,updatedAt:row.updated_at,updatedBy:row.updated_by};
}
export async function saveTemperatureSettings(value:any,actor:any){
 admin(actor);
 if(typeof value?.qcEnabled!=='boolean'||typeof value.storageEnabled!=='boolean'||!Number.isInteger(value.revision))throw new Problem('Choose on or off for each temperature form.');
 const before=await getTemperatureSettings();
 if(value.revision!==before.revision)throw new Problem('Temperature settings changed. Refresh and try again.',409);
 if(value.qcEnabled===before.qcEnabled&&value.storageEnabled===before.storageEnabled)return before;
 const details={qcEnabled:value.qcEnabled,storageEnabled:value.storageEnabled},revision=before.revision+1,updatedAt=now();
 const save=before.revision?stmt("UPDATE application_settings SET details=?,revision=?,updated_at=?,updated_by=? WHERE id='temperature-recording' AND revision=?",JSON.stringify(details),revision,updatedAt,actor.id,before.revision):stmt("INSERT INTO application_settings (id,details,revision,updated_at,updated_by) VALUES ('temperature-recording',?,?,?,?)",JSON.stringify(details),revision,updatedAt,actor.id);
 try{await db().batch([save,auditStmt(actor,'temperature-recording','Temperature recording settings changed',{before,after:{...details,revision}},`temperature-settings:${revision}`)])}catch(e:any){if(/UNIQUE constraint/i.test(e.message))throw new Problem('Temperature settings changed. Refresh and try again.',409);throw e}
 return {...details,revision,updatedAt,updatedBy:actor.id};
}
