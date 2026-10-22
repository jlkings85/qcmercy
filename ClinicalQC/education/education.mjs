import {navigation} from './education-navigation.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function boundedJSON(request,limit){
 if(Number(request.headers.get('content-length'))>limit)throw new Error('Request is too large.');
 const reader=request.body?.getReader();if(!reader)throw new Error('A JSON request is required.');
 const decoder=new TextDecoder();let length=0,text='';
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){reader.cancel().catch(()=>{});throw new Error('Request is too large.')}text+=decoder.decode(value,{stream:true});}}finally{reader.releaseLock()}
 return JSON.parse(text+decoder.decode());
}
const active="(a.state='assigned' OR (a.state='pending' AND julianday(a.due_at)<=julianday('now')))";
export async function educationState(db,operatorId){
 const {results}=await db.prepare(`SELECT a.*,CASE WHEN ${active} THEN 'assigned' ELSE a.state END AS effective_state,
 r.occurred_at,json_extract(r.snapshot,'$.device.serial') AS device_serial,json_extract(r.snapshot,'$.truck.label') AS truck,
 (SELECT COUNT(*) FROM qc_education_items i WHERE i.assignment_id=a.id AND i.acknowledged_at IS NULL) AS remaining
 FROM qc_education_assignments a LEFT JOIN records r ON r.id=a.record_id WHERE a.operator_id=? ORDER BY CASE WHEN ${active} THEN 0 WHEN a.state='pending' THEN 1 ELSE 2 END,a.created_at DESC LIMIT 200`).bind(operatorId).all();
 return results;
}
export function withEducation(native){return {...native,async fetch(request,env,ctx){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/qc-education-nav.js')return new Response(navigation,{headers:{'Content-Type':'application/javascript','Cache-Control':'no-store'}});
 const isAPI=path==='/api/education'||path.startsWith('/api/education/');
 const isQC=request.method==='POST'&&path==='/api/qc';
 let submission;
 if(isQC){try{submission=await boundedJSON(request.clone(),128000)}catch{return json({error:'This entry is too long or is not valid JSON.'},400)}}
 if(isAPI||path==='/education'||(isQC&&submission?.op==='submitQC')){
  const authRequest=new Request(new URL('/api/qc',url),{headers:request.headers,method:'GET'});
  const authResponse=await native.fetch(authRequest,env,ctx);
  if(!authResponse.ok)return path==='/education'?Response.redirect(new URL('/suite-login',url),302):authResponse;
  const context=await authResponse.json(),me=context.me;
  if(!me?.id||!me.active)return json({error:'An active staff account is required.'},403);
  if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)return json({error:'Refresh ClinicalQC and try again.'},403);
  if(isQC){
   const existing=await env.DB.prepare('SELECT id FROM records WHERE id=? AND operator_id=?').bind(submission.value?.requestId||'',me.id).first();
   if(!existing){const blocked=await env.DB.prepare(`SELECT a.id FROM qc_education_assignments a WHERE a.operator_id=? AND ${active} LIMIT 1`).bind(me.id).first();
    if(blocked)return json({error:'Complete your assigned policies and Clinical Practice Bulletin in Documents & Education before recording another QC.',educationRequired:true},403);}
   return native.fetch(request,env,ctx);
  }
  if(path==='/education')return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",'X-Content-Type-Options':'nosniff'}});
  try{
   if(path==='/api/education'&&request.method==='GET'){
    const assignments=await educationState(env.DB,me.id);
    const documents=(await env.DB.prepare('SELECT id,title,category,version,filename,mime,required FROM qc_education_documents WHERE active=1 ORDER BY category,title').all()).results;
    const items=(await env.DB.prepare(`SELECT i.*,d.title,d.category,d.version,d.mime,d.filename FROM qc_education_items i JOIN qc_education_assignments a ON a.id=i.assignment_id JOIN qc_education_documents d ON d.id=i.document_id WHERE a.operator_id=?`).bind(me.id).all()).results;
    return json({me:{id:me.id,name:me.name,role:me.role},documents,assignments,items,blocked:assignments.some(a=>a.effective_state==='assigned')});
   }
   if(path==='/api/education/review'&&request.method==='GET'){
    if(!['admin','supervisor'].includes(me.role))return json({error:'Reviewer access required.'},403);
    const result=await env.DB.prepare(`SELECT a.*,CASE WHEN ${active} THEN 'assigned' ELSE a.state END AS effective_state,o.name,o.email,
    d.title,d.version,i.opened_at,i.acknowledged_at FROM qc_education_assignments a JOIN operators o ON o.id=a.operator_id JOIN qc_education_items i ON i.assignment_id=a.id JOIN qc_education_documents d ON d.id=i.document_id ORDER BY a.created_at DESC LIMIT 2000`).all();
    return json({rows:result.results});
   }
   if(path.startsWith('/api/education/file/')&&request.method==='GET'){
    const id=decodeURIComponent(path.slice('/api/education/file/'.length));
    const doc=await env.DB.prepare('SELECT * FROM qc_education_documents WHERE id=? AND (active=1 OR EXISTS(SELECT 1 FROM qc_education_items i JOIN qc_education_assignments a ON a.id=i.assignment_id WHERE i.document_id=qc_education_documents.id AND a.operator_id=?))').bind(id,me.id).first();
    if(!doc)return json({error:'Document not found.'},404);
    const body=await env.QC_DOCUMENTS.get(doc.storage_key,'arrayBuffer');
    if(!body)return json({error:'Document temporarily unavailable. Please try again.'},503);
    return new Response(body,{headers:{'Content-Type':doc.mime,'Content-Disposition':`inline; filename="${doc.filename.replace(/[^a-zA-Z0-9._ -]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(['/api/education/open','/api/education/acknowledge'].includes(path)&&request.method==='POST'){
    let input;try{input=await boundedJSON(request,4096)}catch{return json({error:'Invalid education request.'},400)}
    const item=await env.DB.prepare(`SELECT i.*,a.state,a.due_at,d.title,d.version,d.sha256 FROM qc_education_items i JOIN qc_education_assignments a ON a.id=i.assignment_id JOIN qc_education_documents d ON d.id=i.document_id WHERE i.assignment_id=? AND i.document_id=? AND a.operator_id=? AND ${active}`).bind(input.assignmentId||'',input.documentId||'',me.id).first();
    if(!item)return json({error:'Active assignment not found.'},404);
    if(path.endsWith('/open')){
     // Confirm the original file is available before enabling acknowledgement.
     const doc=await env.DB.prepare('SELECT storage_key FROM qc_education_documents WHERE id=?').bind(input.documentId).first();
     if(!await env.QC_DOCUMENTS.get(doc.storage_key,'arrayBuffer'))return json({error:'Document temporarily unavailable.'},503);
     await env.DB.prepare("UPDATE qc_education_items SET opened_at=COALESCE(opened_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE assignment_id=? AND document_id=?").bind(input.assignmentId,input.documentId).run();return json({ok:true});
    }
    if(input.acknowledged!==true||!item.opened_at)return json({error:'Open the document and confirm that you have read it before acknowledging.'},400);
    const ts=new Date().toISOString();
    await env.DB.batch([
     env.DB.prepare('UPDATE qc_education_items SET acknowledged_at=COALESCE(acknowledged_at,?) WHERE assignment_id=? AND document_id=?').bind(ts,input.assignmentId,input.documentId),
     env.DB.prepare("INSERT OR IGNORE INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details) VALUES(?,?,?,?,?,'QC education acknowledged',?)").bind('education-ack:'+input.assignmentId+':'+input.documentId,me.id,me.name,ts,input.assignmentId,JSON.stringify({documentId:input.documentId,title:item.title,version:item.version,sha256:item.sha256,attestation:'I acknowledge that I have read this document.'})),
     env.DB.prepare("UPDATE qc_education_assignments SET state='completed',completed_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM qc_education_items WHERE assignment_id=? AND acknowledged_at IS NULL)").bind(ts,input.assignmentId,input.assignmentId)
    ]);return json({ok:true});
   }
   return json({error:'Not found.'},404);
  }catch(error){console.error('QC education request failed',error.message);return json({error:'Unable to load or save education. Please try again.'},500)}
 }
 const response=await native.fetch(request,env,ctx);
 if(request.method==='GET'&&response.headers.get('content-type')?.includes('text/html')&&!['/register','/suite-login','/login','/activate'].includes(path))return new HTMLRewriter().on('head',{element(el){el.append('<script defer src="/qc-education-nav.js"></script>',{html:true});}}).transform(response);
 return response;
}}}
export const page=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Documents & Education · ClinicalQC</title><style>
body{margin:0;background:#f4f7fb;color:#19344b;font:16px system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}a{color:#155b85}h1{margin-bottom:8px}h2{font-size:21px}.card{background:white;padding:22px;border:1px solid #d3dfe8;border-radius:12px;margin:16px 0}.alert{background:#fff1dc;border-color:#dc9c43}.success{background:#e7f4eb}button,.button{display:inline-block;background:#155b85;color:white;padding:11px 16px;border:0;border-radius:6px;cursor:pointer;font:inherit;text-decoration:none}button:disabled{opacity:.5;cursor:default}.muted{color:#597084;font-size:14px}.row{display:flex;flex-wrap:wrap;align-items:center;gap:15px}.row label{flex:1;min-width:200px}input{width:18px;height:18px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #ddd;text-align:left;padding:10px}.scroll{overflow:auto}#error{color:#a42c22;white-space:pre-wrap}</style><main><a href="/">← Back to ClinicalQC</a><h1>Documents & Education</h1><p>Policies, Clinical Practice Bulletins, and meter instructions.</p><p id="error" role="alert"></p><section id="status" aria-live="polite">Loading…</section><section id="assignments"></section><h2>Document library</h2><section id="documents"></section><section id="review"></section></main><script>
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const time=s=>s?new Date(s).toLocaleString():'—';
async function api(path,body){const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});let v;try{v=await r.json()}catch{throw Error('Please sign in to ClinicalQC again.')}if(!r.ok)throw Error(v.error||'Request failed');return v}
async function load(){try{const d=await api('/api/education');$('status').className='card '+(d.blocked?'alert':'success');$('status').textContent=d.blocked?'QC entry is paused. Open and acknowledge every assigned document below to resume recording QC.':'No education is currently blocking QC entry.';
$('assignments').innerHTML=d.assignments.map(a=>{const pending=a.effective_state==='pending',locked=a.effective_state==='assigned';if(!pending&&!locked&&a.effective_state!=='completed')return '';return '<div class="card"><h2>'+ (locked?'Required education':pending?'Repeat QC window':'Education completed')+'</h2><p>Truck '+esc(a.truck)+' · Meter '+esc(a.device_serial)+' · QC '+esc(time(a.occurred_at))+'</p><p>'+esc(pending?'A passing linked repeat before '+time(a.due_at)+' prevents this assignment. A failed repeat assigns education immediately.':locked?a.reason:'Completed '+time(a.completed_at))+'</p>'+(!pending?d.items.filter(i=>i.assignment_id===a.id).map(i=>'<div class="card"><strong>'+esc(i.title)+'</strong><p class="muted">Version '+esc(i.version)+'</p><a class="button" target="_blank" rel="noopener" href="/api/education/file/'+encodeURIComponent(i.document_id)+'" data-open="'+esc(a.id)+'" data-doc="'+esc(i.document_id)+'">Open document</a>'+ (i.acknowledged_at?'<p>✓ Acknowledged '+esc(time(i.acknowledged_at))+'</p>':locked?'<div class="row"><label><input type="checkbox" data-check="'+esc(a.id+'|'+i.document_id)+'"> I acknowledge that I have read this document.</label><button data-ack="'+esc(a.id)+'" data-doc="'+esc(i.document_id)+'" disabled>Acknowledge</button></div>':'')+'</div>').join(''):'')+'</div>'}).join('');
$('documents').innerHTML=d.documents.map(i=>'<div class="card"><h3>'+esc(i.title)+'</h3><p class="muted">'+esc(i.category)+' · '+esc(i.version)+(i.required?' · Included in required education':' · Reference manual')+'</p><a class="button" target="_blank" rel="noopener" href="/api/education/file/'+encodeURIComponent(i.id)+'">Open document</a></div>').join('');
document.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',async()=>{try{await api('/api/education/open',{assignmentId:el.dataset.open,documentId:el.dataset.doc});el.closest('.card').dataset.opened='true';}catch(e){$('error').textContent=e.message}}));
document.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{el.closest('.row').querySelector('button').disabled=!el.checked}));
document.querySelectorAll('[data-ack]').forEach(el=>el.addEventListener('click',async()=>{el.disabled=true;try{await api('/api/education/acknowledge',{assignmentId:el.dataset.ack,documentId:el.dataset.doc,acknowledged:true});await load()}catch(e){$('error').textContent=e.message;el.disabled=false}}));
if(['admin','supervisor'].includes(d.me.role))$('review').innerHTML='<h2>Education oversight</h2><button id="review-button">View staff assignments and acknowledgements</button><div id="review-rows" class="scroll"></div>';
$('review-button')?.addEventListener('click',async()=>{try{const v=await api('/api/education/review');$('review-rows').innerHTML='<table><thead><tr><th>Staff</th><th>Status</th><th>Document / version</th><th>Acknowledged</th></tr></thead><tbody>'+v.rows.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+esc(r.effective_state)+'</td><td>'+esc(r.title)+' / '+esc(r.version)+'</td><td>'+esc(time(r.acknowledged_at))+'</td></tr>').join('')+'</tbody></table>'}catch(e){$('error').textContent=e.message}});
}catch(e){$('error').textContent=e.message;$('status').textContent='Education could not be loaded.'}}load();</script></html>`;

