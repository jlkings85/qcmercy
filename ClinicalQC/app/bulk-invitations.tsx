'use client';
import {useRef,useState} from 'react';
import {Mail} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import type {Candidate,SendResult} from '@/lib/bulk-invitations';

export default function BulkInvitations(){
 const [open,setOpen]=useState(false),[people,setPeople]=useState<Candidate[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[resend,setResend]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set()),[review,setReview]=useState(false),[running,setRunning]=useState(false),[results,setResults]=useState<Record<string,SendResult>>({}),[progress,setProgress]=useState({done:0,total:0});
 const stop=useRef(false),sending=useRef(false);
 async function load(){setLoading(true);setError('');setReview(false);setSelected(new Set());try{const response=await fetch('/api/invitations/bulk',{cache:'no-store'});const data=await response.json() as {error?:string;recipients:Candidate[]};if(!response.ok)throw Error(data.error);setPeople(data.recipients);}catch(e){setError(e instanceof Error?e.message:'Unable to load recipients.');}finally{setLoading(false);}}
 const eligible=(p:Candidate)=>p.eligible&&(!p.invitation_id||resend)&&results[p.id]?.status!=='sent';
 const shown=people.filter(p=>[p.name,p.email,p.role].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const chosen=people.filter(p=>selected.has(p.id)&&eligible(p));
 const counts={sent:Object.values(results).filter(r=>r.status==='sent').length,failed:Object.values(results).filter(r=>r.status==='failed'||r.status==='unknown').length,skipped:Object.values(results).filter(r=>r.status==='skipped').length};
 function toggle(id:string,on:boolean){setReview(false);setSelected(current=>{const next=new Set(current);if(on)next.add(id);else next.delete(id);return next;});}
 async function send(){
  if(sending.current||!chosen.length)return;sending.current=true;stop.current=false;setRunning(true);setError('');const queue=[...chosen];setProgress({done:0,total:queue.length});
  try{for(const [index,person] of queue.entries()){
   if(stop.current)break;
   let result:SendResult;
   try{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);let response:Response;
    try{response=await fetch('/api/invitations/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operatorId:person.id,expectedEmail:person.email,expectedRevision:person.revision,requestId:'bulk-'+crypto.randomUUID(),resend}),signal:controller.signal});}finally{clearTimeout(timeout);}
    const data=await response.json() as SendResult & {error?:string};if(!response.ok)throw Error(data.error||'Sending could not be confirmed.');result=data;
   }catch(e){result={operatorId:person.id,status:'unknown',message:e instanceof Error?e.message:'Sending could not be confirmed. Refresh before trying again.'};}
   setResults(current=>({...current,[person.id]:result}));setProgress({done:index+1,total:queue.length});
   if(result.status==='failed'||result.status==='unknown'){stop.current=true;setError('Sending paused after a problem. Review the result, refresh recipients, and select the remaining users when ready.');break;}
   if(index+1<queue.length)await new Promise(resolve=>setTimeout(resolve,750));
  }}finally{sending.current=false;setRunning(false);setReview(false);setSelected(new Set());}
 }
 return <><Button variant="outline" onClick={()=>{setOpen(true);void load();}}><Mail size={16}/>Bulk invitations</Button><Sheet open={open} onOpenChange={value=>{if(!running)setOpen(value);}}><SheetContent className="w-full overflow-y-auto p-5 sm:max-w-3xl"><SheetHeader><SheetTitle>Invite staff to ClinicalQC</SheetTitle><SheetDescription>Review recipients before sending personal account setup links. Invitations expire in seven days.</SheetDescription></SheetHeader><div className="stack mt-6">
 <p className="notice">Login invitations do not change anyone’s role or testing credentials. Inactive users, activated logins, and missing or shared email addresses cannot be selected.</p>
 {error&&<p className="notice bad" role="alert">{error}</p>}
 {!!Object.keys(results).length&&<p role="status">Sent: {counts.sent} · Failed or unconfirmed: {counts.failed} · Skipped: {counts.skipped}. “Sent” means accepted by the email service; it does not confirm inbox delivery.</p>}
 {running?<div aria-live="polite" className="notice"><p>Processed {progress.done} of {progress.total}. Keep this page open while sending.</p><Button className="mt-3" variant="outline" onClick={()=>{stop.current=true;}}>Stop after current recipient</Button></div>:<>
 <label className="field"><span>Find recipients</span><Input value={query} onChange={e=>{setQuery(e.target.value);setReview(false);}} placeholder="Name, email, or role" disabled={review}/></label>
 <label className="flex items-start gap-3 text-sm"><Checkbox checked={resend} disabled={review} onCheckedChange={value=>{setResend(value===true);setSelected(new Set());}}/><span>Include users with an unexpired invitation. Sending replaces their previous link.</span></label>
 <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading||review} onClick={()=>setSelected(new Set(shown.filter(eligible).map(p=>p.id)))}>Select eligible results ({shown.filter(eligible).length})</Button><Button variant="outline" disabled={review} onClick={()=>setSelected(new Set())}>Clear selection</Button><Button variant="outline" disabled={loading} onClick={()=>void load()}>Refresh recipients</Button></div>
 </>}
 {loading?<p>Loading recipients…</p>:<div className="max-h-[50vh] overflow-y-auto rounded-lg border">{(review||running?chosen:shown).map(person=>{const result=results[person.id];return <label key={person.id} className="flex items-start gap-3 border-b p-4 last:border-b-0"><Checkbox aria-label={'Invite '+person.name} checked={selected.has(person.id)} disabled={review||running||!eligible(person)} onCheckedChange={value=>toggle(person.id,value===true)}/><div className="min-w-0 flex-1"><p className="font-semibold">{person.name}</p><p className="break-all text-sm">{person.email}</p><p className="mt-1 text-sm text-[#61768d]">{person.role} · {person.reason}{person.expires_at?' · expires '+new Date(person.expires_at).toLocaleDateString():''}</p>{person.last_sent_at&&<p className="text-sm text-[#61768d]">Last emailed: {new Date(person.last_sent_at).toLocaleString()}</p>}{result&&<p className={'mt-2 text-sm '+(result.status==='sent'?'text-green-800':'text-amber-800')}>{result.status.toUpperCase()}: {result.message}</p>}</div></label>;})}{!shown.length&&<p className="p-4">No recipients match.</p>}</div>}
 {!running&&!loading&&(review?<div className="space-y-3"><p>Send individual invitations to these <strong>{chosen.length} people</strong>? Each email contains only that person’s setup link.</p><div className="flex flex-wrap gap-3"><Button disabled={!chosen.length} onClick={()=>void send()}>Send {chosen.length} invitations</Button><Button variant="outline" onClick={()=>setReview(false)}>Back to selection</Button></div></div>:<Button disabled={!chosen.length} onClick={()=>setReview(true)}>Review {chosen.length} selected recipients</Button>)}
 </div></SheetContent></Sheet></>;
}
