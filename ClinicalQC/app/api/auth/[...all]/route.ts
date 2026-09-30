import {authentication} from '@/lib/auth';
export const dynamic='force-dynamic';
async function handle(request:Request){try{return await authentication().handler(request);}catch{return Response.json({message:'Login is temporarily unavailable. Please contact your administrator.'},{status:503,headers:{'Cache-Control':'no-store'}});}}
export const GET=handle;
export const POST=handle;
