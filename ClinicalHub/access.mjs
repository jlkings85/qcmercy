export const MODULES=[
 {id:'forms',name:'ClinicalForms',category:'Clinical operations',description:'Truck checks, clinical forms, and a flexible form builder.',url:'https://clinicalforms.jlkings85.chatgpt.site',icon:'clipboard',color:'teal'},
 {id:'qc',name:'ClinicalQC',category:'Clinical operations',description:'Quality controls, equipment, and exception review.',url:'https://qc.mercyems.net',icon:'activity',color:'blue'},
 {id:'narcs',name:'ClinicalNarcs',category:'Clinical operations',description:'Medication inventory, seal checks, and accountability.',url:'https://clinicalnarcs.app',icon:'shield',color:'violet'},
 {id:'shifts',name:'ClinicalShifts',category:'Education & development',description:'Student clinicals and preceptor scheduling.',url:'https://clinicalshifts.app',icon:'calendar',color:'teal'},
 {id:'evals',name:'ClinicalEvals',category:'Education & development',description:'Student and coworker evaluations.',url:'https://shifts.clinicalapps.app/evaluations/',icon:'clipboard',color:'orange',accessNote:'Sign in through ClinicalShifts'},
 {id:'guidelines',name:'ClinicalGuidelines',category:'Clinical reference',description:'Guidelines, medications, policies, and procedures.',url:'https://guidelines.mercyems.net',icon:'book',color:'green',public:true},
 {id:'credentials',name:'ClinicalCredentials',category:'Education & development',description:'Credentials, certifications, and renewal tracking.',url:'https://mercy-emr-credentials.jlkings85.chatgpt.site',icon:'shield',color:'blue'},
];
// Only explicit module IDs can activate fixed, first-party destinations.
export function moduleDestinations(env={}){
 const active=new Set(String(env.CLINICALAPPS_LIVE_MODULES||'').split(',').map(x=>x.trim()).filter(Boolean));
 for(const id of active)if(!MODULES.some(m=>m.id===id))throw Error('Unknown ClinicalApps module: '+id);
 return MODULES.map(m=>({...m,plannedUrl:`https://${m.id}.clinicalapps.app`,domainReady:active.has(m.id),url:active.has(m.id)?`https://${m.id}.clinicalapps.app`:m.url}));
}
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export async function member(env,userId){return env.DB.prepare('SELECT * FROM hub_members WHERE user_id=? AND enabled=1').bind(userId).first();}
export async function grant(env,userId,module){return env.DB.prepare('SELECT * FROM hub_grants WHERE user_id=? AND module=? AND enabled=1').bind(userId,module).first();}
export async function localAccount(env,module,id){
 if(['forms','credentials'].includes(module))return env.DB.prepare('SELECT u.id,u.id auth_user_id,u.name,u.email,u.email_verified active,r.role FROM auth_user u JOIN hub_site_roles r ON r.user_id=u.id AND r.module=? WHERE u.id=?').bind(module,id).first();
 if(module==='qc')return env.DB.prepare('SELECT o.id,o.name,o.email,o.role,o.active,l.auth_user_id FROM operators o LEFT JOIN qc_login_links l ON l.operator_id=o.id WHERE o.id=?').bind(id).first();
 if(module==='shifts'&&env.SHIFTS_DB)return env.SHIFTS_DB.prepare('SELECT p.id,p.name,p.email,p.role,p.active,p.auth_id auth_user_id FROM people p WHERE p.id=?').bind(id).first();
 if(module==='narcs'&&env.NARCS_DB)return env.NARCS_DB.prepare(`${NARCS_PROFILES} WHERE json_extract(j.value,'$.id')=?`).bind(id).first();
 return null;
}
export const NARCS_PROFILES=`SELECT json_extract(j.value,'$.id') id,json_extract(j.value,'$.name') name,json_extract(j.value,'$.email') email,json_extract(j.value,'$.role') role,json_extract(j.value,'$.active') active,l.auth_user_id
 FROM clinicalnarcs_records r,json_each(r.state,'$.people') j
 JOIN narcs_login_links l ON l.person_id=json_extract(j.value,'$.id')
 JOIN auth_user u ON u.id=l.auth_user_id AND lower(trim(u.email))=lower(trim(json_extract(j.value,'$.email'))) AND u.email_verified=1
 AND r.space='live' AND r.revision=(SELECT max(revision) FROM clinicalnarcs_records WHERE space='live')`;
export async function liveGrant(env,userId,module){
 if(module==='evals')module='shifts';
 if(!await member(env,userId))return null;
 const g=await grant(env,userId,module);if(!g)return null;
 const local=await localAccount(env,module,g.local_id);
 return local?.active&&local.auth_user_id?{...g,account:local}:null;
}
export function assertOrigin(request,origin){if(request.headers.get('origin')!==origin)throw new HttpError(403,'Please use the Mercy EMS dashboard to make this change.');}
export async function saveGrant(env,actorId,{userId,module,localId,enabled,role}){
 if(['forms','credentials'].includes(module))return saveSiteGrant(env,actorId,{userId,module,enabled,role});
 if(!['qc','shifts','narcs'].includes(module)||typeof userId!=='string'||typeof localId!=='string'||typeof enabled!=='boolean')throw new HttpError(400,'Choose an account, module, and profile.');
 const user=await env.DB.prepare('SELECT id,email,email_verified FROM auth_user WHERE id=?').bind(userId).first();
 const local=await localAccount(env,module,localId);
 const previous=await env.DB.prepare('SELECT * FROM hub_grants WHERE user_id=? AND module=?').bind(userId,module).first();
 if(!enabled&&(!previous||previous.local_id!==localId))throw new HttpError(400,'Choose an existing linked profile to disable.');
 if(enabled&&(!user?.email_verified||!local?.active||!local.auth_user_id))throw new HttpError(400,'Both accounts must already be active and verified before linking.');
 const authDB=module==='shifts'?env.SHIFTS_DB:module==='narcs'?env.NARCS_DB:env.DB;
 const localUser=local?.auth_user_id?await authDB.prepare('SELECT email_verified FROM auth_user WHERE id=?').bind(local.auth_user_id).first():null;
 if(enabled&&!localUser?.email_verified)throw new HttpError(400,'The module account must have a verified email.');
 if(enabled&&module==='qc'&&local.auth_user_id!==userId)throw new HttpError(400,'QC uses the shared account ID; choose this user’s existing QC profile.');
 const stamp=new Date().toISOString();
 // Do not permit remapping a previously linked subject to another historical identity.
 if(previous&&previous.local_id!==localId)throw new HttpError(409,'This account already has a different historical profile. Disable it and have the identity mapping reviewed.');
 const assigned=await env.DB.prepare('SELECT user_id FROM hub_grants WHERE module=? AND local_id=?').bind(module,localId).first();
 if(assigned&&assigned.user_id!==userId)throw new HttpError(409,'This profile is already linked to another shared account.');
 const results=await env.DB.batch([
  env.DB.prepare('INSERT INTO hub_members(user_id,is_admin,enabled,created_at) SELECT ?,0,1,? WHERE EXISTS(SELECT 1 FROM hub_members WHERE user_id=? AND enabled=1 AND is_admin=1) ON CONFLICT(user_id) DO NOTHING').bind(userId,stamp,actorId),
  env.DB.prepare('INSERT INTO hub_grants(user_id,module,local_id,enabled,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM hub_members WHERE user_id=? AND enabled=1 AND is_admin=1) ON CONFLICT(user_id,module) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at WHERE hub_grants.local_id=excluded.local_id').bind(userId,module,localId,Number(enabled),stamp,actorId),
  env.DB.prepare('INSERT INTO hub_audit(id,actor_id,event,target_id,details,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),actorId,enabled?'module_access_enabled':'module_access_disabled',userId,JSON.stringify({module,localId,localEmail:local?.email||null,previousEnabled:previous?.enabled??null}),stamp),
 ]);
 if(!results[1].meta.changes)throw new HttpError(409,'Access changed while saving. Reload and review this account.');
 return {ok:true};
}

export async function saveMember(env,actorId,{userId,enabled,isAdmin}){
 if(typeof userId!=='string'||typeof enabled!=='boolean'||typeof isAdmin!=='boolean')throw new HttpError(400,'Choose an account status and dashboard role.');
 if(userId===actorId&&(!enabled||!isAdmin))throw new HttpError(409,'Another administrator must change your own access.');
 if(isAdmin&&!enabled)throw new HttpError(400,'A dashboard administrator must have an enabled account.');
 const user=await env.DB.prepare('SELECT email_verified FROM auth_user WHERE id=?').bind(userId).first();
 if(!user||enabled&&!user.email_verified)throw new HttpError(400,'Only verified accounts can be enabled.');
 const stamp=new Date().toISOString(),eventId=crypto.randomUUID();
 // Recheck the actor in the write itself. Concurrent administrators cannot
 // disable each other after one loses authority. Self-demotion is prohibited.
 const results=await env.DB.batch([
  env.DB.prepare(`INSERT INTO hub_members(user_id,is_admin,enabled,created_at)
   SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM hub_members WHERE user_id=? AND enabled=1 AND is_admin=1)
   ON CONFLICT(user_id) DO UPDATE SET is_admin=excluded.is_admin,enabled=excluded.enabled
   WHERE EXISTS(SELECT 1 FROM hub_members WHERE user_id=? AND enabled=1 AND is_admin=1)`)
   .bind(userId,Number(isAdmin),Number(enabled),stamp,actorId,actorId),
  env.DB.prepare(`INSERT INTO hub_audit(id,actor_id,event,target_id,details,created_at)
   SELECT ?,?,?,?,?,? WHERE changes()>0`).bind(eventId,actorId,'account_access_updated',userId,JSON.stringify({enabled,isAdmin}),stamp),
 ]);
 if(!results[0].meta.changes)throw new HttpError(403,'Your administrator access changed. Reload the dashboard.');
 return {ok:true};
}

export async function saveSiteGrant(env,actorId,{userId,module,enabled,role}){
 if(typeof userId!=='string'||typeof enabled!=='boolean'||!['admin','member'].includes(role))throw new HttpError(400,'Choose a verified account and an app role.');
 const user=await env.DB.prepare('SELECT email_verified FROM auth_user WHERE id=?').bind(userId).first();
 if(!user?.email_verified)throw new HttpError(400,'The shared account must be verified.');
 const stamp=new Date().toISOString();
 const results=await env.DB.batch([
 env.DB.prepare('INSERT INTO hub_members(user_id,is_admin,enabled,created_at) SELECT ?,0,1,? WHERE EXISTS(SELECT 1 FROM hub_members WHERE user_id=? AND enabled=1 AND is_admin=1) ON CONFLICT(user_id) DO NOTHING').bind(userId,stamp,actorId),
 env.DB.prepare('INSERT INTO hub_site_roles(user_id,module,role) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM hub_members WHERE user_id=? AND enabled=1 AND is_admin=1) ON CONFLICT(user_id,module) DO UPDATE SET role=excluded.role').bind(userId,module,role,actorId),
 env.DB.prepare('INSERT INTO hub_grants(user_id,module,local_id,enabled,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM hub_members WHERE user_id=? AND enabled=1 AND is_admin=1) ON CONFLICT(user_id,module) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at WHERE hub_grants.local_id=excluded.local_id').bind(userId,module,userId,Number(enabled),stamp,actorId),
 env.DB.prepare('INSERT INTO hub_audit(id,actor_id,event,target_id,details,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),actorId,'module_access_updated',userId,JSON.stringify({module,enabled,role}),stamp),
 ]);
 if(!results[2].meta.changes)throw new HttpError(403,'Administrator access changed. Reload the dashboard.');
 return {ok:true};
}
