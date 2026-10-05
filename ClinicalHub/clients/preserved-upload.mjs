// Build an additive Worker upload from the currently deployed multipart source.
// Native modules are retained byte-for-byte; callers must check the live version
// before uploading, keep secrets with `inherit`, and retain a rollback version.
export function preservedUpload(original,settings,additions,bindings){
 const boundary=original.slice(0,original.indexOf('\r\n'));
 if(!boundary.startsWith('--')||boundary.length<10)throw Error('Unrecognized Worker source format.');
 const parts=original.split(boundary).slice(1,-1).map(part=>{
  if(!part.startsWith('\r\n')||!part.endsWith('\r\n'))throw Error('Malformed source part.');
  const i=part.indexOf('\r\n\r\n'),name=part.slice(0,i).match(/name="([^"]+)"/)?.[1];
  if(i<0||!name||!name.endsWith('.js')||/[\r\n"]/.test(name))throw Error('Unsupported source module.');
  return {name,body:part.slice(i+4,-2)};
 });
 if(!parts.some(p=>p.name==='index.js'))throw Error('Expected native index.js entrypoint.');
 for(const part of additions){if(parts.some(p=>p.name===part.name))throw Error('An SSO wrapper is already installed. Update it explicitly.');parts.push(part);}
 const marker='clinicalapps-'+crypto.randomUUID();
 const metadata={main_module:'clinicalapps-entry.js',compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags,bindings,observability:{...settings.observability,redact_query_string:true},...(settings.placement?{placement:settings.placement}:{}),...(settings.limits?{limits:settings.limits}:{}),...(settings.tail_consumers?{tail_consumers:settings.tail_consumers}:{})};
 const body=['--'+marker,'Content-Disposition: form-data; name="metadata"','Content-Type: application/json','',JSON.stringify(metadata),...parts.flatMap(p=>['--'+marker,`Content-Disposition: form-data; name="${p.name}"; filename="${p.name}"`,'Content-Type: application/javascript+module','',p.body]),'--'+marker+'--',''].join('\r\n');
 return {body,contentType:'multipart/form-data; boundary='+marker,nativeModuleCount:parts.length-additions.length};
}
