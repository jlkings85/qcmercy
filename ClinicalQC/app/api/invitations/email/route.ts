import {operator,admin,one,stmt,Problem} from '@/lib/server';
import {tokenHash} from '@/lib/auth-config';
import {applicationUrl} from '@/lib/auth';
import {runtimeValues,sendEmail} from '@/lib/email';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new Problem('Refresh and try again.',403);
 const me=await operator();admin(me);
 const raw=await req.text();if(raw.length>1500)throw new Problem('This request is too large.');
 const b=JSON.parse(raw);
 if(typeof b.operatorId!=='string'||b.operatorId.length>200||typeof b.code!=='string'||! /^[a-f0-9]{64}$/.test(b.code)||typeof b.expectedEmail!=='string')throw new Problem('Create an invitation link first.');
 const person=await one('SELECT * FROM operators WHERE id=?',b.operatorId);
 if(!person?.active)throw new Problem('Select an active user.');
 if(person.email!==b.expectedEmail)throw new Problem('The registered email changed. Refresh and create a new invitation.',409);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)||/\.(invalid|test|example)$/i.test(person.email))throw new Problem('Add a working email address first.');
 if(await one('SELECT operator_id FROM qc_login_links WHERE operator_id=?',person.id))throw new Problem('This user already has a login. Use Forgot password on the sign-in page.');
 const invitation=await one('SELECT * FROM qc_invitations WHERE operator_id=? AND token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?',person.id,await tokenHash(b.code),new Date().toISOString());
 if(!invitation)throw new Problem('This invitation expired or was replaced. Close this panel and create a new invitation.',409);
 const eventId='invitation-email:'+invitation.id;
 if(await one('SELECT id FROM audit WHERE id=?',eventId))return Response.json({sent:true,email:person.email},{headers:{'Cache-Control':'no-store'}});
 const config=runtimeValues();if(!config.RESEND_API_KEY||!config.QC_EMAIL_FROM)throw new Problem('Email delivery is not configured.',503);
 const link=applicationUrl('/register')+'#invite='+b.code;
 let providerId:string;
 try{providerId=await sendEmail(person.email,'Set up your ClinicalQC login',`You have been invited to ClinicalQC.\n\nOpen this personal link to set up your login:\n${link}\n\nUse this registered email address: ${person.email}\n\nThis invitation expires at ${invitation.expires_at}. Keep this link private.`,eventId);}
 catch{throw new Problem('Email sending could not be confirmed. You can retry or copy the invitation link.',502);}
 await stmt('INSERT INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',eventId,me.id,me.name,new Date().toISOString(),person.id,'Login invitation email sent',JSON.stringify({invitationId:invitation.id,email:person.email,providerId})).run();
 return Response.json({sent:true,email:person.email},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Problem?e.message:'Unable to confirm sending. Retry the same invitation or copy its link.'},{status:e instanceof Problem?e.code:500,headers:{'Cache-Control':'no-store'}});}}
