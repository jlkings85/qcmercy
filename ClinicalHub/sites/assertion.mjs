const encoder=new TextEncoder();
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function key(secret,usage){if(typeof secret!=='string'||secret.length<32)throw Error('Shared identity is not configured.');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,[usage]);}
export async function signIdentity(secret,user,module,request){const url=new URL(request.url);const payload=encode(encoder.encode(JSON.stringify({sub:user.id,email:user.email,name:user.name,role:user.role,aud:module,method:request.method,path:url.pathname+url.search,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+30})));const signature=await crypto.subtle.sign('HMAC',await key(secret,'sign'),encoder.encode(payload));return payload+'.'+encode(new Uint8Array(signature));}
export async function verifyIdentity(secret,token,module,request){
 if(!token||token.length>4096)throw Error('Shared identity is required.');const parts=token.split('.');if(parts.length!==2)throw Error('Invalid shared identity.');
 if(!await crypto.subtle.verify('HMAC',await key(secret,'verify'),decode(parts[1]),encoder.encode(parts[0])))throw Error('Invalid shared identity.');
 const p=JSON.parse(new TextDecoder().decode(decode(parts[0]))),url=new URL(request.url),now=Math.floor(Date.now()/1000);
 if(p.aud!==module||p.method!==request.method||p.path!==url.pathname+url.search||!Number.isInteger(p.exp)||p.exp<now||p.exp>now+35||p.iat>now+5||!['admin','member'].includes(p.role)||typeof p.sub!=='string'||!p.sub||typeof p.email!=='string'||!p.email.includes('@')||typeof p.name!=='string')throw Error('Invalid or expired shared identity.');
 return {id:p.sub,email:p.email,name:p.name,role:p.role};
}
