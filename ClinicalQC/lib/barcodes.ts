// Match identifiers, never substrings: a product code alone cannot identify a lot.
export function barcodeIdentifiers(raw:string,kind:string){
 const text=raw.trim().replace(/^\]([A-Za-z][0-9])/,'');
 const values=[text];
 const ai=kind==='device'?'21':'10';
 const marked=text.match(new RegExp('\\('+ai+'\\)([^\\x1d(]+)'));
 if(marked)values.push(marked[1]);
 // GS1 fixed length fields may precede a final/separator-delimited serial or lot.
 let rest=text;
 while(rest){rest=rest.replace(/^\x1d/,'');const tag=rest.slice(0,2);
  if(['01','02','11','13','15','17'].includes(tag)){const n=['01','02'].includes(tag)?14:6;if(!new RegExp('^\\d{'+n+'}').test(rest.slice(2)))break;rest=rest.slice(2+n);continue;}
  if(['10','21'].includes(tag)){const end=rest.indexOf('\x1d',2),v=rest.slice(2,end<0?undefined:end);if(tag===ai&&v)values.push(v);if(end<0)break;rest=rest.slice(end+1);continue;}break;
 }
 return [...new Set(values.map(x=>x.replace(/\s/g,'').toUpperCase()))];
}
export function barcodeMatches(raw:string,kind:string,assets:Record<string,any>[]){
 const ids=barcodeIdentifiers(raw,kind),exact=raw.trim();
 return assets.filter(a=>a.kind===kind&&(a.barcode===exact||ids.includes(String(kind==='device'?a.serial:a.lot||'').replace(/\s/g,'').toUpperCase())));
}
