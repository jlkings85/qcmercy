export function historicalSupply(raw:string|undefined,label:string){
 const parts=(raw||'').split('|').map(s=>s.trim());
 const d=parts[1]?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 const expires=d?`${d[3]}-${d[1].padStart(2,'0')}-${d[2].padStart(2,'0')}`:null;
 if(parts[1]&&(!expires||Number.isNaN(Date.parse(expires))||new Date(expires).toISOString().slice(0,10)!==expires))throw Error('Invalid printed expiration: '+parts[1]);
 const r=parts[2]?.match(/QC Range\s+(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/i);
 if(parts[2]&&(!r||+r[1]>=+r[2]))throw Error('Invalid source range: '+parts[2]);
 return {supply:{id:'',label,lot:parts[0]||'Not recorded',expires,discard:null,sourceText:raw||''},range:r?{min:+r[1],max:+r[2],units:'',source:'Reference range recorded in the source CSV'}:null};
}
export function historicalSerial(raw:string|undefined){return (raw||'').trim().replace(/\s*(?:\(.*|on loan.*)$/i,'').trim();}
export function historicalComparison(raw:string,range:{min:number;max:number}|null){return /^\d+(\.\d+)?$/.test(raw)&&range?(+raw>=range.min&&+raw<=range.max?'in_range':'out_of_range'):'not_verified';}
const normalized=(v:any)=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
// Compare source content across CSV and prior workbook imports, without changing either.
export function sameHistoricalEntry(entry:any,first:any,repeat:any){
 const s=first.snapshot,p=s.provenance||{},r=repeat?.snapshot;
 const value=(x:any)=>x===null||x===undefined?'':String(x);
 const equal=(a:any,b:any)=>normalized(a)===normalized(b);
 if(!equal(entry.low,value(s.input.lowValue)||s.input.lowError)||!equal(entry.high,value(s.input.highValue)||s.input.highError)||!equal(entry.result,p.reportedResult)||!equal(entry.comments,s.input.notes))return false;
 if(!equal(entry.repeatLow,value(r?.input.lowValue)||r?.input.lowError)||!equal(entry.repeatHigh,value(r?.input.highValue)||r?.input.highError)||!equal(entry.repeatResult,r?.provenance?.reportedResult))return false;
 if(entry.extended){
  const serial=(x:string)=>historicalSerial(x).replace(/\s/g,'').toLowerCase();
  if(serial(entry.serial)!==serial(s.device?.serial==='Not recorded'?'':s.device?.serial||'')||!equal(entry.truck,s.truck?.label==='Not recorded'?'':s.truck?.label))return false;
  for(const [key,raw] of [['low',entry.lowSupply],['high',entry.highSupply],['strip',entry.stripSupply]]){
   const parsed=historicalSupply(raw,key);const existing=s[key];if(!equal(parsed.supply.lot.replace(/\s/g,''),String(existing?.lot||'').replace(/\s/g,''))||!equal(parsed.supply.expires,existing?.expires))return false;
   if(key!=='strip'&&(parsed.range?.min!==s[key+'Range']?.min||parsed.range?.max!==s[key+'Range']?.max))return false;
  }
 }
 return true;
}
