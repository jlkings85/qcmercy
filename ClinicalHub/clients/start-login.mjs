export async function startSharedLogin(request,env,handle,callbackURL){
 const origin=new URL(env.BETTER_AUTH_URL).origin;
 const headers=new Headers({'Content-Type':'application/json',Origin:origin});
 for(const name of ['cookie','cf-connecting-ip'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
 const response=await handle(new Request(origin+'/api/auth/sign-in/social',{method:'POST',headers,body:JSON.stringify({provider:'mercy-hub',callbackURL})}));
 if(!response.ok)return Response.json({error:'Shared login is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
 const data=await response.json();
 if(!data.url||new URL(data.url).origin!==env.HUB_ORIGIN)return Response.json({error:'Unexpected shared login destination.'},{status:502});
 const outgoing=new Headers({Location:data.url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 for(const cookie of response.headers.getSetCookie())outgoing.append('Set-Cookie',cookie);
 return new Response(null,{status:302,headers:outgoing});
}
