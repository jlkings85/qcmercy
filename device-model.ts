export function deviceModelKey(value:unknown){return typeof value==='string'?value.trim().replace(/\s+/g,' ').toLowerCase():''}
export function sameDeviceModel(a:unknown,b:unknown){const key=deviceModelKey(a);return !!key&&key===deviceModelKey(b)}
export function supplyModelVisible(supplyModel:unknown,deviceModel:unknown,stripModel:unknown,kind:string){
 const required=deviceModelKey(deviceModel)||(kind==='strip'?'':deviceModelKey(stripModel));
 // Missing device metadata must not make the registered lots disappear.
 // Recording QC still requires the device model to be saved by an administrator.
 return !required||sameDeviceModel(supplyModel,required);
}
