 'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export default function Activation({email}:{email:string}){
 const [code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{try{setCode(sessionStorage.getItem('clinicalqc-invitation')||'');}catch{}},[]);
 return <main className="auth-page"><section className="auth-card"><p className="eyebrow">CLINICALQC · MERCY EMS</p><h1>Activate your access</h1><p>Your email is verified: {email}. Enter the invitation code your administrator gave you to connect your login to your QC profile.</p><form className="join-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/enrollment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});const data=await r.json() as {error?:string};if(!r.ok)throw Error(data.error);try{sessionStorage.removeItem('clinicalqc-invitation');}catch{}location.assign('/');}catch(e:any){setError(e.message);}finally{setBusy(false);}}}><label htmlFor="activation-code">Invitation or initial setup code</label><Input id="activation-code" required maxLength={120} value={code} autoComplete="off" onChange={e=>setCode(e.target.value)}/>{error&&<p role="alert" className="form-error">{error}</p>}<Button disabled={busy} type="submit">{busy?'Activating…':'Activate access'}</Button></form><button className="mt-6 underline" onClick={async()=>{await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.assign('/login');}}>Sign out</button></section></main>;
}
