export const CONTROL_RANGE_SOURCE='Mercy EMS QC ranges supplied by Josh Kingston on October 2, 2026';
export const CONTROL_RANGES={
 low:{min:44,max:74,units:'mg/dL',level:'low',source:CONTROL_RANGE_SOURCE,isDefault:true},
 high:{min:250,max:350,units:'mg/dL',level:'high',source:CONTROL_RANGE_SOURCE,isDefault:true},
};
export function controlRange(level:string,assets:any[],stripId?:string,controlId?:string){
 if((level!=='low'&&level!=='high')||!stripId||!controlId)return undefined;
 const specific=assets.find(a=>a.kind==='range'&&a.active&&a.stripId===stripId&&a.controlId===controlId);
 return specific||{...CONTROL_RANGES[level],stripId,controlId};
}
