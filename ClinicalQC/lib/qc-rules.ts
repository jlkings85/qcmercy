import {sameDeviceModel} from './device-model';
export function centralDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function credentialState(u:any,day=centralDay()){
 if(!u?.active)return 'inactive';
 if(u.credential_status==='suspended')return 'suspended';
 const since=u.validSince||u.competencyDate;
 if(u.credential_status!=='verified'||!since||!u.expires||!u.verified_by||!u.verified_at)return 'pending';
 if(since>day)return 'not_started';
 if(u.expires<day)return 'expired';
 return 'verified';
}
export function credentialValid(u:any, day=centralDay()){return credentialState(u,day)==='verified'}
export function lotExpired(lot:any,day=centralDay()){return !lot.expires || lot.expires<day || (lot.discard && lot.discard<day)}
export function resultFor(value:unknown,min:number,max:number){return typeof value==='number' && Number.isFinite(value) && value>=min && value<=max?'pass':'fail'}
export function evaluateQC(device:any,strip:any,low:any,high:any,lowRange:any,highRange:any,input:any,day=centralDay()){
 const issues:string[]=[];
 if(lotExpired(strip,day))issues.push('Test strip lot expired or beyond discard date');
 if(lotExpired(low,day))issues.push('Low control expired or beyond discard date');
 if(lotExpired(high,day))issues.push('High control expired or beyond discard date');
 if(![strip,low,high].every(s=>sameDeviceModel(s.model,device.model)))issues.push('Supplies do not match the device model');
 if(!lowRange||!highRange)issues.push('Control range is missing');
 if(lowRange&&highRange&&lowRange.units!==highRange.units)issues.push('Control range units do not match');
 const lv=input.lowError?'error':lowRange?resultFor(input.lowValue,Number(lowRange.min),Number(lowRange.max)):'unverified';
 const hv=input.highError?'error':highRange?resultFor(input.highValue,Number(highRange.min),Number(highRange.max)):'unverified';
 if(lv==='fail')issues.push('Low control outside configured range');
 if(hv==='fail')issues.push('High control outside configured range');
 if(input.lowError)issues.push('Low control device error: '+input.lowError);
 if(input.highError)issues.push('High control device error: '+input.highError);
 if(!input.clean||!input.stored)issues.push('Preparation check not met');
 return {issues,lowResult:lv,highResult:hv,status:issues.length?'exception':'pass'};
}
