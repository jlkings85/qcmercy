export const MODULES=[
 {id:'qc',name:'ClinicalQC',category:'Clinical operations',description:'Quality controls, equipment, and exception review.',url:'https://qc.mercyems.net',icon:'activity',color:'blue'},
 {id:'narcs',name:'ClinicalNarcs',category:'Clinical operations',description:'Medication inventory, seal checks, and accountability.',url:'https://clinicalnarcs.app',icon:'shield',color:'violet'},
 {id:'shifts',name:'ClinicalShifts',category:'Education & development',description:'Student clinicals and preceptor scheduling.',url:'https://clinicalshifts.app',icon:'calendar',color:'teal'},
 {id:'evals',name:'ClinicalEvals',category:'Education & development',description:'Student and coworker evaluations.',url:'https://clinicalevals-demo.jlkings85.chatgpt.site',icon:'clipboard',color:'orange',preview:true},
 {id:'guidelines',name:'ClinicalGuidelines',category:'Clinical reference',description:'Guidelines, medications, policies, and procedures.',url:'https://guidelines.mercyems.net',icon:'book',color:'green',public:true},
];
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export async function member(env,userId){return env.DB.prepare('SELECT * FROM hub_members WHERE user_id=? AND enabled=1').bind(userId).first();}
export async function grant(env,userId,module){return env.DB.prepare('SELECT * FROM hub_grants WHERE user_id=? AND module=? AND enabled=1').bind(userId,module).first();}
export async function localAccount(env,module,id){
 if(module==='qc')return env.DB.prepare('SELECT o.id,o.name,o.email,o.role,o.active,l.auth_user_id FROM operators o LEFT JOIN qc_login_links l ON l.operator_id=o.id WHERE o.id=?').bind(id).first();
 if(module==='shifts'&&env.SHIFTS_DB)return env.SHIFTS_DB.prepare('SELECT p.id,p.name,p.email,p.role,p.active,p.auth_id auth_user_id FROM people p WHERE p.id=?').bind(id).first();
 return null;
}
export async function liveGrant(env,userId,module){
 if(!await member(env,userId))return null;
 const g=await grant(env,userId,module);if(!g)return null;
 const local=await localAccount(env,module,g.local_id);
 return local?.active&&local.auth_user_id?{...g,account:local}:null;
}
export function assertOrigin(request,origin){if(request.headers.get('origin')!==origin)throw new HttpError(403,'Please use the Mercy EMS dashboard to make this change.');}
export async function saveGrant(env,actorId,{userId,module,localId,enabled}){
 if(!['qc','shifts'].includes(module)||typeof userId!=='string'||typeof localId!=='string'||typeof enabled!=='boolean')throw new HttpError(400,'Choose an account, module, and profile.');
 const user=await env.DB.prepare('SELECT id,email,email_verified FROM auth_user WHERE id=?').bind(userId).first();
 const local=await localAccount(env,module,localId);
 if(!user?.email_verified||!local?.active||!local.auth_user_id)throw new HttpError(400,'Both accounts must already be active and verified before linking.');
 const authDB=module==='shifts'?env.SHIFTS_DB:env.DB;
 const localUser=await authDB.prepare('SELECT email_verified FROM auth_user WHERE id=?').bind(local.auth_user_id).first();
 if(!localUser?.email_verified)throw new HttpError(400,'The module account must have a verified email.');
 if(module==='qc'&&local.auth_user_id!==userId)throw new HttpError(400,'QC uses the shared account ID; choose this user’s existing QC profile.');
 const stamp=new Date().toISOString();
 const previous=await env.DB.prepare('SELECT * FROM hub_grants WHERE user_id=? AND module=?').bind(userId,module).first();
 // Do not permit remapping a previously linked subject to another historical identity.
 if(previous&&previous.local_id!==localId)throw new HttpError(409,'This account already has a different historical profile. Disable it and have the identity mapping reviewed.');
 await env.DB.batch([
  env.DB.prepare('INSERT INTO hub_members(user_id,is_admin,enabled,created_at) VALUES(?,0,1,?) ON CONFLICT(user_id) DO NOTHING').bind(userId,stamp),
  env.DB.prepare('INSERT INTO hub_grants(user_id,module,local_id,enabled,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at').bind(userId,module,localId,Number(enabled),stamp),
  env.DB.prepare('INSERT INTO hub_audit(id,actor_id,event,target_id,details,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actorId,enabled?'module_access_enabled':'module_access_disabled',userId,JSON.stringify({module,localId,localEmail:local.email,previousEnabled:previous?.enabled??null}),stamp),
 ]);
 return {ok:true};
}
