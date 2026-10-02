export type Candidate = {id:string;name:string;email:string;revision:number;role:string;credential_status:string;active:number;login_enabled:number;invitation_id:string|null;expires_at:string|null;last_sent_at:string|null;reason:string;eligible:boolean};
type Actor={id:string;name:string};
type SendInput={operatorId:string;expectedEmail:string;expectedRevision:number;requestId:string;resend:boolean};
export type SendResult={operatorId:string;status:'sent'|'failed'|'skipped'|'unknown';message:string};
const emailKey=(email:string)=>email.trim().toLowerCase();
const workingEmail=(email:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/(?:\.(?:invalid|test|example)|@(?:example\.(?:com|org|net)|localhost))$/i.test(email);
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');

export async function invitationCandidates(db:D1Database,operatorId:string|null=null):Promise<Candidate[]>{
 const result=await db.prepare(`WITH email_counts AS (SELECT lower(trim(email)) AS email_key,count(*) AS n FROM operators GROUP BY lower(trim(email))),
 sent AS (SELECT entity_id,max(created_at) AS last_sent_at FROM audit WHERE event='Login invitation email sent' GROUP BY entity_id)
 SELECT o.id,o.name,o.email,o.revision,o.role,o.credential_status,o.active,
 EXISTS(SELECT 1 FROM qc_login_links l WHERE l.operator_id=o.id) AS login_enabled,
 ec.n AS email_count,
 i.id AS invitation_id,i.expires_at,
 sent.last_sent_at
 FROM operators o JOIN email_counts ec ON ec.email_key=lower(trim(o.email)) LEFT JOIN sent ON sent.entity_id=o.id LEFT JOIN qc_invitations i ON i.operator_id=o.id AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>?
 WHERE (? IS NULL OR o.id=?) ORDER BY o.name,o.id`).bind(new Date().toISOString(),operatorId,operatorId).all<any>();
 return result.results.map(p=>{
  const reason=!p.active?'Inactive user':p.login_enabled?'Login already active':!workingEmail(p.email)?'Needs a working email':p.email_count!==1?'Email is shared by multiple users':p.invitation_id?'Unexpired invitation':'Ready to invite';
  const {email_count,...person}=p;
  return {...person,reason,eligible:reason==='Ready to invite'||reason==='Unexpired invitation'};
 });
}

export async function sendStaffInvitation(db:D1Database,actor:Actor,input:SendInput,baseUrl:string,sendEmail:(to:string,subject:string,text:string,key?:string)=>Promise<unknown>):Promise<SendResult>{
 const result=(status:SendResult['status'],message:string):SendResult=>({operatorId:input.operatorId,status,message});
 const existing=await db.prepare('SELECT operator_id FROM qc_invitations WHERE id=?').bind(input.requestId).first<any>();
 if(existing){
  if(existing.operator_id!==input.operatorId)return result('skipped','This request was already used. Refresh the recipient list.');
  const event=await db.prepare("SELECT event FROM audit WHERE id IN (?,?) ORDER BY created_at DESC LIMIT 1").bind(input.requestId+'-sent',input.requestId+'-failed').first<any>();
  return event?.event==='Login invitation email sent'?result('sent','Invitation already sent.'):event?result('failed','The previous attempt failed. Refresh before trying again.'):result('unknown','Sending was started. Refresh to check its status before sending a new invitation.');
 }
 const person=(await invitationCandidates(db,input.operatorId))[0];
 if(!person)return result('skipped','User no longer exists.');
 if(emailKey(person.email)!==emailKey(input.expectedEmail)||person.revision!==input.expectedRevision)return result('skipped','User details changed. Refresh and review this recipient again.');
 if(!person.eligible)return result('skipped',person.reason);
 if(person.invitation_id&&!input.resend)return result('skipped','An unexpired invitation already exists.');
 const code=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const ts=new Date().toISOString(),expires=new Date(Date.now()+7*86400000).toISOString(),tokenHash=await hash(code);
 // Guard against duplicate requests and recipient edits between preview and sending.
 const condition=`EXISTS(SELECT 1 FROM operators o WHERE o.id=? AND o.active=1 AND o.revision=? AND lower(trim(o.email))=? AND NOT EXISTS(SELECT 1 FROM qc_login_links l WHERE l.operator_id=o.id))`;
 const eligibility=[person.id,input.expectedRevision,emailKey(person.email)];
 const writes=await db.batch([
  db.prepare(`UPDATE qc_invitations SET revoked_at=? WHERE operator_id=? AND used_at IS NULL AND revoked_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM qc_invitations WHERE id=?) AND ${condition}
   AND (expires_at<=? OR (?=1 AND id=?))`).bind(ts,person.id,input.requestId,...eligibility,ts,input.resend?1:0,person.invitation_id),
  db.prepare(`INSERT INTO qc_invitations(id,operator_id,token_hash,created_at,expires_at,created_by)
   SELECT ?,?,?,?,?,? WHERE ${condition} AND NOT EXISTS(SELECT 1 FROM qc_invitations WHERE operator_id=? AND used_at IS NULL AND revoked_at IS NULL)
   ON CONFLICT(id) DO NOTHING`).bind(input.requestId,person.id,tokenHash,ts,expires,actor.id,...eligibility,person.id),
 ]);
 if(!writes[1].meta.changes)return result('skipped','Another invitation or user update occurred. Refresh the list.');
 const audit=(suffix:string,event:string,details:object)=>db.prepare('INSERT INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details) VALUES(?,?,?,?,?,?,?)').bind(input.requestId+suffix,actor.id,actor.name,new Date().toISOString(),person.id,event,JSON.stringify({invitationId:input.requestId,email:person.email,expiresAt:expires,...details}));
 await audit('-created','Login invitation created',{delivery:'email',resend:input.resend}).run();
 const link=new URL('/register',baseUrl).href+'#invite='+code;
 let providerId:unknown;
 try{
  providerId=await sendEmail(person.email,'Set up your ClinicalQC login',`Hello ${person.name},\n\n${actor.name} has invited you to ClinicalQC for Mercy EMS.\n\nOpen this personal link to create your login:\n${link}\n\nUse this email address: ${person.email}\nChoose a password with at least 12 characters, verify your email, then sign in and activate access in the same browser.\n\nThis invitation expires in seven days. Keep the link private. Your existing role and testing credentials are unchanged.`, 'clinicalqc-invite-'+input.requestId);
 }catch{
  await db.batch([db.prepare('UPDATE qc_invitations SET revoked_at=? WHERE id=? AND used_at IS NULL').bind(new Date().toISOString(),input.requestId),audit('-failed','Login invitation email failed',{})]);
  return result('failed','Email sending failed. Check the email service or sending limit, then try a new invitation.');
 }
 // A provider success followed by a logging failure must not invalidate an emailed link.
 try{await audit('-sent','Login invitation email sent',{providerId:typeof providerId==='string'?providerId:null}).run();}
 catch{return result('unknown','Email was accepted, but its audit confirmation failed. Refresh before sending again.');}
 return result('sent','Invitation accepted by the email service.');
}
