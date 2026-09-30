'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
type Mode='login'|'register'|'forgot'|'reset'|'verify';
export default function AuthScreen({initialMode='login'}:{initialMode?:Mode}){
 const [mode,setMode]=useState<Mode>(initialMode),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{const hash=new URLSearchParams(window.location.hash.slice(1));const invite=hash.get('invite');if(invite){setCode(invite);setMode('register');try{sessionStorage.setItem('clinicalqc-invitation',invite);}catch{}history.replaceState(null,'',window.location.pathname);}
  if(!invite){try{setCode(sessionStorage.getItem('clinicalqc-invitation')||'');}catch{}}
  const params=new URLSearchParams(window.location.search);if(params.get('verified')==='1')setMessage('Email verified. Sign in to continue.');if(params.has('error'))setError('This link is invalid or expired. Request a new email.');
 },[]);
 const change=(next:Mode)=>{setMode(next);setError('');setMessage('');setPassword('');};
 const title={login:'Welcome to ClinicalQC.',register:'Create your account.',forgot:'Reset your password.',reset:'Choose a new password.',verify:'Verify your email.'}[mode];
 async function submit(e:React.FormEvent){e.preventDefault();setError('');setMessage('');setBusy(true);try{
  const path={login:'sign-in/email',register:'sign-up/email',forgot:'request-password-reset',reset:'reset-password',verify:'send-verification-email'}[mode];
  const body=mode==='register'?{name,email,password,callbackURL:'/login?verified=1'}:mode==='login'?{email,password,rememberMe:true}:mode==='reset'?{newPassword:password,token:new URLSearchParams(window.location.search).get('token')}:mode==='forgot'?{email,redirectTo:'/reset-password'}:{email,callbackURL:'/login?verified=1'};
  const response=await fetch('/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(mode==='register'?{'x-clinicalqc-invitation':code.trim()}:{})},body:JSON.stringify(body)});const result=await response.json() as {message?:string};if(!response.ok)throw Error(result.message||'Unable to continue. Please try again.');
  if(mode==='login'){window.location.assign('/');return;}
  if(mode==='register'){try{sessionStorage.setItem('clinicalqc-invitation',code.trim());}catch{}setMode('verify');setPassword('');setMessage('Check your inbox for a verification link. You must verify your email before signing in.');}
  else if(mode==='reset'){setMode('login');setPassword('');setMessage('Password updated. Sign in with your new password.');}
  else setMessage('If this email address has an eligible account, a link has been sent. Please check your inbox and spam folder.');
 }catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <main className="auth-page"><section className="auth-card"><div className="brand-mark">C<span>+</span></div><p className="eyebrow">CLINICALQC</p><h1>{title}</h1><p>{mode==='register'?'Use the email address and invitation your ClinicalQC administrator provided.':mode==='login'?'Sign in to record quality control and review your equipment.':mode==='forgot'?'Enter your account email to request a password reset.':mode==='reset'?'Use at least 12 characters.':'Open the verification email, then return here to sign in.'}</p>
 <form className="join-form" onSubmit={submit}>
 {mode==='register'&&<><Label htmlFor="auth-name">Full name</Label><Input id="auth-name" required maxLength={180} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/><Label htmlFor="auth-code">Invitation or initial setup code</Label><Input id="auth-code" required maxLength={120} autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></>}
 {mode!=='reset'&&<><Label htmlFor="auth-email">Email address</Label><Input id="auth-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></>}
 {['login','register','reset'].includes(mode)&&<><Label htmlFor="auth-password">{mode==='reset'?'New password':'Password'}</Label><Input id="auth-password" type="password" required minLength={mode==='login'?undefined:12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></>}
 {error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status" className="auth-status">{message}</p>}
 <Button type="submit" disabled={busy}>{busy?'Please wait…':({login:'Sign in',register:'Create account',forgot:'Send reset link',reset:'Save new password',verify:'Resend verification email'}[mode])}</Button>
 </form><div className="auth-links">{mode==='login'?<><button onClick={()=>change('forgot')}>Forgot password?</button><button onClick={()=>change('register')}>Have an invitation? Create your account</button><button onClick={()=>change('verify')}>Resend verification email</button></>:<button onClick={()=>change('login')}>Back to sign in</button>}</div></section><div className="auth-note">Mercy EMS · Glucometer quality control</div></main>;
}
