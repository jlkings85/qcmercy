import {operator,admin,db,stmt,one,uid,now,auditStmt,Problem} from '@/lib/server';
import {tokenHash} from '@/lib/auth-config';
import {applicationUrl} from '@/lib/auth';
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)throw new Problem('Refresh and try again.',403);
 const me=await operator();admin(me);const b=await req.json() as {operatorId?:unknown};if(typeof b.operatorId!=='string'||b.operatorId.length>200)throw new Problem('Select a user.');
 const person=await one('SELECT * FROM operators WHERE id=?',b.operatorId);
 if(!person||!person.active)throw new Problem('Select an active user.');
 if(await one('SELECT operator_id FROM qc_login_links WHERE operator_id=?',person.id))throw new Problem('This user already has a login. They can use Forgot password on the sign-in page.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)||/\.(invalid|test|example)$/i.test(person.email))throw new Problem('Add this person’s working email address before creating a login invitation.');
 const code=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),id=uid(),ts=now(),expires=new Date(Date.now()+7*86400000).toISOString();
 await db().batch([stmt('UPDATE qc_invitations SET revoked_at=? WHERE operator_id=? AND used_at IS NULL AND revoked_at IS NULL',ts,person.id),stmt('INSERT INTO qc_invitations(id,operator_id,token_hash,created_at,expires_at,created_by) VALUES(?,?,?,?,?,?)',id,person.id,await tokenHash(code),ts,expires,me.id),auditStmt(me,person.id,'Login invitation created',{invitationId:id,expiresAt:expires})]);
 return Response.json({url:applicationUrl('/register')+'#invite='+code,email:person.email,expiresAt:expires},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Problem?e.message:'The invitation could not be created.'},{status:e instanceof Problem?e.code:500});}}
