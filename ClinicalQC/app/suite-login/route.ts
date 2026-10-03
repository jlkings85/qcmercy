import {authentication,authRuntime} from '@/lib/auth';
export async function GET(request:Request){
 const runtime=authRuntime();
 if(!runtime.hubOrigin)return Response.redirect(new URL('/login',runtime.baseUrl),302);
 const headers=new Headers({'Content-Type':'application/json',Origin:runtime.baseUrl});
 if(request.headers.has('cookie'))headers.set('cookie',request.headers.get('cookie')!);
 if(request.headers.has('cf-connecting-ip'))headers.set('cf-connecting-ip',request.headers.get('cf-connecting-ip')!);
 const response=await authentication().handler(new Request(new URL('/api/auth/sign-in/social',runtime.baseUrl),{method:'POST',headers,body:JSON.stringify({provider:'mercy-hub',callbackURL:'/'})}));
 if(!response.ok)return Response.json({error:'Shared login is temporarily unavailable. Use the existing ClinicalQC login.'},{status:503});
 const data=await response.json() as {url?:string};
 if(!data.url||new URL(data.url).origin!==runtime.hubOrigin)return Response.json({error:'Shared login returned an unexpected destination.'},{status:502});
 const outgoing=new Headers({Location:data.url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 for(const cookie of response.headers.getSetCookie())outgoing.append('Set-Cookie',cookie);
 return new Response(null,{status:302,headers:outgoing});
}
