import {operator,admin,db,Problem} from '@/lib/server';
import {applicationUrl} from '@/lib/auth';
import {runtimeValues,sendEmail} from '@/lib/email';
import {invitationCandidates,sendStaffInvitation} from '@/lib/bulk-invitations';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>json({error:e instanceof Problem?e.message:'The invitation request could not be completed. Refresh to check its status.'},e instanceof Problem?e.code:500);
export async function GET(){try{const me=await operator();admin(me);return json({recipients:await invitationCandidates(db())});}catch(e){return fail(e);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new Problem('Refresh and try again.',403);
 const me=await operator();admin(me);
 const raw=await req.text();if(raw.length>2500)throw new Problem('This request is too large.');
 const b=JSON.parse(raw);
 if(typeof b.operatorId!=='string'||b.operatorId.length>200||typeof b.expectedEmail!=='string'||b.expectedEmail.length>254||!Number.isInteger(b.expectedRevision)||typeof b.requestId!=='string'||!/^bulk-[0-9a-f-]{36}$/.test(b.requestId)||typeof b.resend!=='boolean')throw new Problem('Select a user from the recipient preview.');
 const config=runtimeValues();if(!config.RESEND_API_KEY||!config.QC_EMAIL_FROM)throw new Problem('Configure email delivery before sending invitations.',503);
 return json(await sendStaffInvitation(db(),me,b,applicationUrl('/'),sendEmail));
 }catch(e){return fail(e);}}
