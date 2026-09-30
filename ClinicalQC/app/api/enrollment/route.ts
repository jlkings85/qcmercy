import {getCurrentUser,authRuntime} from '@/lib/auth';
import {claimEnrollment} from '@/lib/enrollment';
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Please refresh and try again.'},{status:403});
 try{const user=await getCurrentUser(req);if(!user)return Response.json({error:'Sign in with your verified email first.'},{status:401});
 const b=await req.json() as {code?:unknown};if(typeof b.code!=='string'||b.code.length>120)return Response.json({error:'Enter your invitation code.'},{status:400});
 await claimEnrollment(authRuntime(),user,b.code.trim());return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Unable to activate access. Check the invitation code and email, or ask an administrator for a new invitation.'},{status:403});}
}
