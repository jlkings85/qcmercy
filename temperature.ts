export function temperatureLimits(location:any){const materials=location?.temperatureMaterials||'both';return {materials,min:materials==='strips'?34:59,max:86,units:'F',reference:materials==='strips'?'Strips: 34–86 °F':materials==='reagents'?'Reagents: 59–86 °F':'Reagents: 59–86 °F · Strips: 34–86 °F'}}
export function evaluateTemperature(input:any,location:any){
 for(const k of ['high','low','current'])if(typeof input[k]!=='number'||!Number.isFinite(input[k]))throw new Error('Enter numeric high, low, and current temperatures.');
 if(input.low>input.high||input.current<input.low||input.current>input.high)throw new Error('Current temperature must fall between the recorded low and high.');
 if(input.units!=='F')throw new Error('Record these temperatures in Fahrenheit.');
 const limits=temperatureLimits(location);const applicable=limits.materials==='both'?['reagents','strips']:[limits.materials];const checks=applicable.map(material=>{const min=material==='strips'?34:59;return {material,min,max:86,inRange:input.low>=min&&input.high<=86&&input.current>=min&&input.current<=86}});const out=checks.some(c=>!c.inRange);const status=out?'out_of_range':'in_range';const correctiveAction=typeof input.correctiveAction==='string'?input.correctiveAction.trim():'';
 if(out&&!correctiveAction)throw new Error('Document the corrective measure taken for the out-of-range temperature.');
 return {high:input.high,low:input.low,current:input.current,units:'F',min:limits.min,max:86,materials:limits.materials,checks,status,correctiveAction,reference:limits.reference};
}
