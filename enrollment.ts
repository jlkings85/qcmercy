import {type AuthRuntime,emailKey,tokenHash,validOwnerEnrollment} from './auth-config';
export async function linkedOperator(db:D1Database,user:{userId:string;email:string}){
 return db.prepare(`SELECT o.* FROM operators o JOIN qc_login_links l ON l.operator_id=o.id
 WHERE l.auth_user_id=? AND lower(trim(o.email))=? AND o.active=1`).bind(user.userId,emailKey(user.email)).first<any>();
}
export async function claimEnrollment(runtime:AuthRuntime,user:{userId:string;email:string},code:string){
 if(!code||code.length>120)throw Error('Enter a valid invitation code.');
 const db=runtime.db,ts=new Date().toISOString(),event=crypto.randomUUID(),email=emailKey(user.email);
 if(!await db.prepare('SELECT id FROM auth_user WHERE id=? AND lower(trim(email))=? AND email_verified=1').bind(user.userId,email).first())throw Error('Verify your email before activating access.');
 if(await linkedOperator(db,user))return;
 const owner=await validOwnerEnrollment(runtime,email,code);
 const insert=owner?db.prepare(`INSERT INTO qc_login_links(operator_id,auth_user_id,created_at,event_id)
 SELECT o.id,?,?,? FROM operators o WHERE lower(trim(o.email))=? AND o.active=1 AND o.role='admin'
 AND NOT EXISTS(SELECT 1 FROM qc_login_links l JOIN operators a ON a.id=l.operator_id WHERE a.role='admin')
 ON CONFLICT DO NOTHING`).bind(user.userId,ts,event,email):db.prepare(`INSERT INTO qc_login_links(operator_id,auth_user_id,created_at,event_id,invitation_id)
 SELECT o.id,?,?,?,i.id FROM operators o JOIN qc_invitations i ON i.operator_id=o.id
 WHERE lower(trim(o.email))=? AND o.active=1 AND i.token_hash=? AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>?
 ON CONFLICT DO NOTHING`).bind(user.userId,ts,event,email,await tokenHash(code),ts);
 const results=await db.batch([insert,
 db.prepare('UPDATE qc_invitations SET used_at=? WHERE id=(SELECT invitation_id FROM qc_login_links WHERE event_id=?)').bind(ts,event),
 db.prepare(`INSERT INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details)
 SELECT ?,o.id,o.name,?,o.id,'Staff login activated',? FROM operators o JOIN qc_login_links l ON l.operator_id=o.id WHERE l.event_id=?`).bind(event,ts,JSON.stringify({method:'verified_email',initialOwner:owner}),event)]);
 if(!results[0].meta.changes)throw Error('This invitation is expired, revoked, used, or does not match your account. Ask an administrator for a new invitation.');
}
