import {hashPassword} from 'better-auth/crypto';
import {HttpError,member,localAccount} from './access.mjs';
export const APP_ROLES={qc:['operator','supervisor','admin'],shifts:['student','preceptor','schedule_manager','instructor','admin'],narcs:['user','supervisor','manager','pharmacy','admin','auditor'],forms:['member','admin'],credentials:['member','admin']};
const now=()=>new Date().toISOString();
const emailKey=x=>String(x||'').trim().toLowerCase();
const text=(x,max=120)=>{if(typeof x!=='string'||x.length>max)throw new HttpError(400,'Check the person’s details.');return x.trim();};
const audit=(db,actor,event,target,details)=>db.prepare('INSERT INTO hub_audit(id,actor_id,event,target_id,details,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,event,target,JSON.stringify(details),now());
export async function adminActor(env,id){const m=await member(env,id);if(!m?.is_admin)throw new HttpError(403,'Administrator access is required.');const user=await env.DB.prepare('SELECT id,name,email FROM auth_user WHERE id=? AND email_verified=1').bind(id).first();if(!user)throw new HttpError(403,'Administrator access is required.');return user;}
export async function directory(env){
 const people=(await env.DB.prepare(`SELECT u.id,u.name,u.email,u.email_verified,m.enabled,m.is_admin,COALESCE(p.phone,'') phone,COALESCE(p.employee_id,'') employee_id,COALESCE(p.region,'') region,COALESCE(p.revision,0) revision,
 EXISTS(SELECT 1 FROM auth_account a WHERE a.user_id=u.id AND a.provider_id='credential' AND a.password IS NOT NULL) has_password
 FROM auth_user u LEFT JOIN hub_members m ON m.user_id=u.id LEFT JOIN hub_people p ON p.user_id=u.id ORDER BY u.name,u.email`).all()).results;
 const grants=(await env.DB.prepare('SELECT * FROM hub_grants').all()).results;
 const apps=[];for(const g of grants){const p=await localAccount(env,g.module,g.local_id);let options={};if(g.module==='shifts'&&env.SHIFTS_DB){const sp=await env.SHIFTS_DB.prepare('SELECT program_id,course_id,level,is_preceptor,is_fto FROM people WHERE id=?').bind(g.local_id).first();if(sp)options={programId:sp.program_id,courseId:sp.course_id,level:sp.level,isPreceptor:!!sp.is_preceptor,isFto:!!sp.is_fto};}if(g.module==='narcs'&&env.NARCS_DB){const row=await env.NARCS_DB.prepare("SELECT state FROM clinicalnarcs_records WHERE space='live' ORDER BY revision DESC LIMIT 1").first();options={regions:row?JSON.parse(row.state).people.find(x=>x.id===g.local_id)?.regions||[]:[]};}apps.push({...g,options,role:p?.role||'',profileName:p?.name||'',profileEmail:p?.email||'',active:!!p?.active});}
 const programs=env.SHIFTS_DB?(await env.SHIFTS_DB.prepare('SELECT id,name FROM programs WHERE active=1 ORDER BY name').all()).results:[];
 const courses=env.SHIFTS_DB?(await env.SHIFTS_DB.prepare('SELECT id,name,program_id,level FROM courses WHERE active=1 ORDER BY name').all()).results:[];
 const known=new Set(people.map(p=>emailKey(p.email))),suggestions=new Map();
 const sources=[...(await env.DB.prepare('SELECT name,email FROM operators WHERE active=1 ORDER BY name').all()).results,...(env.SHIFTS_DB?(await env.SHIFTS_DB.prepare('SELECT name,email FROM people WHERE active=1 ORDER BY name').all()).results:[])];
 if(env.NARCS_DB){const nr=await env.NARCS_DB.prepare("SELECT state FROM clinicalnarcs_records WHERE space='live' ORDER BY revision DESC LIMIT 1").first();if(nr)sources.push(...JSON.parse(nr.state).people.filter(p=>p.active));}
 for(const p of sources){const email=emailKey(p.email);if(email&&!known.has(email)&&!suggestions.has(email))suggestions.set(email,{name:p.name,email});}
 return {people,apps,roles:APP_ROLES,programs,courses,suggestions:[...suggestions.values()].sort((a,b)=>a.name.localeCompare(b.name))};
}
export async function savePerson(env,actor,p){
 await adminActor(env,actor);const name=text(p.name,100),email=emailKey(p.email),phone=text(p.phone||'',50),employeeId=text(p.employeeId||'',80),region=text(p.region||'',100);
 if(name.length<2||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Enter a name and valid email address.');
 if(p.id){
  const u=await env.DB.prepare('SELECT id,email FROM auth_user WHERE id=?').bind(p.id).first();if(!u)throw new HttpError(404,'Person not found.');
  if(email!==emailKey(u.email))throw new HttpError(409,'Sign-in emails stay linked to historical app records. Contact the administrator to review an email change.');
  const current=await env.DB.prepare('SELECT revision FROM hub_people WHERE user_id=?').bind(p.id).first();if((current?.revision||0)!==p.revision)throw new HttpError(409,'This person changed. Reload before saving.');
  const result=await env.DB.batch([
   env.DB.prepare(`INSERT INTO hub_people(user_id,phone,employee_id,region,revision,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,employee_id=excluded.employee_id,region=excluded.region,revision=hub_people.revision+1,updated_at=excluded.updated_at WHERE hub_people.revision=?`).bind(p.id,phone,employeeId,region,now(),p.revision),
   env.DB.prepare('UPDATE auth_user SET name=?,updated_at=? WHERE id=? AND changes()>0').bind(name,Date.now(),p.id),
   audit(env.DB,actor,'person_updated',p.id,{name,phone,employeeId,region}),
  ]);if(!result[0].meta.changes)throw new HttpError(409,'This person changed. Reload before saving.');return{id:p.id};
 }
 const exists=await env.DB.prepare('SELECT id FROM auth_user WHERE lower(trim(email))=?').bind(email).first();if(exists)throw new HttpError(409,'This email already has an account. Find that person in the directory.');
 const id=crypto.randomUUID();await env.DB.batch([
  env.DB.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,0,?,?)').bind(id,name,email,Date.now(),Date.now()),
  env.DB.prepare('INSERT INTO hub_people(user_id,phone,employee_id,region,updated_at) VALUES(?,?,?,?,?)').bind(id,phone,employeeId,region,now()),
  env.DB.prepare('INSERT INTO hub_members(user_id,is_admin,enabled,created_at) VALUES(?,0,1,?)').bind(id,now()),
  audit(env.DB,actor,'person_created',id,{name,email}),
 ]);return{id};
}
async function tokenHash(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function createSetupLink(env,actor,{userId}){
 await adminActor(env,actor);const u=await env.DB.prepare("SELECT u.id FROM auth_user u JOIN hub_members m ON m.user_id=u.id WHERE u.id=? AND m.enabled=1 AND NOT EXISTS(SELECT 1 FROM auth_account a WHERE a.user_id=u.id AND a.provider_id='credential' AND a.password IS NOT NULL)").bind(userId).first();if(!u)throw new HttpError(409,'This person already has a password or is suspended. Existing passwords are not replaced by setup links.');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''),expires=new Date(Date.now()+7*86400000).toISOString();
 await env.DB.batch([env.DB.prepare('UPDATE hub_setup_links SET revoked_at=? WHERE user_id=? AND used_at IS NULL AND revoked_at IS NULL').bind(now(),userId),env.DB.prepare('INSERT INTO hub_setup_links(id,user_id,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,await tokenHash(token),actor,now(),expires),audit(env.DB,actor,'setup_link_created',userId,{expires})]);return{url:env.HUB_ORIGIN+'/activate#'+token,expires};
}
export async function activate(env,{token,password}){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new HttpError(400,'This setup link is invalid or expired.');
 const hash=await tokenHash(token);const link=await env.DB.prepare('SELECT l.*,u.email,u.name FROM hub_setup_links l JOIN auth_user u ON u.id=l.user_id JOIN hub_members m ON m.user_id=u.id WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? AND m.enabled=1').bind(hash,now()).first();
 if(!link)throw new HttpError(400,'This setup link is invalid or expired.');
 if(password===undefined)return{name:link.name,email:link.email};
 if(typeof password!=='string'||password.length<12||password.length>128)throw new HttpError(400,'Use a password with 12–128 characters.');
 if(await env.DB.prepare("SELECT id FROM auth_account WHERE user_id=? AND provider_id='credential' AND password IS NOT NULL").bind(link.user_id).first())throw new HttpError(409,'This account already has a password. Use normal sign-in or password recovery.');
 const encoded=await hashPassword(password),stamp=now(),accountId=crypto.randomUUID();
 const results=await env.DB.batch([
  env.DB.prepare("INSERT INTO auth_account(id,account_id,provider_id,user_id,password,created_at,updated_at) SELECT ?,?,'credential',?,?,?,? WHERE EXISTS(SELECT 1 FROM hub_setup_links l JOIN hub_members m ON m.user_id=l.user_id WHERE l.id=? AND l.used_at IS NULL AND l.revoked_at IS NULL AND l.expires_at>? AND m.enabled=1) AND NOT EXISTS(SELECT 1 FROM auth_account WHERE user_id=? AND provider_id='credential' AND password IS NOT NULL)").bind(accountId,link.user_id,link.user_id,encoded,Date.now(),Date.now(),link.id,stamp,link.user_id),
  env.DB.prepare('UPDATE hub_setup_links SET used_at=? WHERE id=? AND changes()>0').bind(stamp,link.id),
  env.DB.prepare('UPDATE auth_user SET email_verified=1,updated_at=? WHERE id=? AND changes()>0').bind(Date.now(),link.user_id),
  env.DB.prepare('INSERT INTO hub_audit(id,actor_id,event,target_id,details,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),link.user_id,'account_activated',link.user_id,'{}',stamp),
 ]);if(!results[0].meta.changes)throw new HttpError(409,'This setup link was already used or revoked.');return{ok:true};
}
async function ensureNativeAuth(db,user,preferredId){
 const found=await db.prepare('SELECT id,email FROM auth_user WHERE lower(trim(email))=?').bind(emailKey(user.email)).first();
 if(preferredId){const old=await db.prepare('SELECT id,email FROM auth_user WHERE id=?').bind(preferredId).first();if(!old||emailKey(old.email)!==emailKey(user.email))throw new HttpError(409,'Existing profile identity needs review. Use the historical account link.');return old.id;}
 if(found)return found.id;
 const id='hub-'+user.id;await db.prepare('INSERT OR IGNORE INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)').bind(id,user.name,emailKey(user.email),Date.now(),Date.now()).run();
 // No native password is created. Authentication remains with the verified hub identity.
 const created=await db.prepare('SELECT id FROM auth_user WHERE lower(trim(email))=?').bind(emailKey(user.email)).first();if(!created)throw new HttpError(503,'Unable to prepare this app account.');return created.id;
}
async function qcProfile(env,user,role,existing){
 let p=existing?await env.DB.prepare('SELECT * FROM operators WHERE id=?').bind(existing).first():await env.DB.prepare('SELECT * FROM operators WHERE lower(trim(email))=?').bind(emailKey(user.email)).first();
 if(p){const linked=await env.DB.prepare('SELECT auth_user_id FROM qc_login_links WHERE operator_id=?').bind(p.id).first();if(linked&&linked.auth_user_id!==user.id)throw new HttpError(409,'QC profile is already assigned to another account.');
  if(p.role==='admin'&&role!=='admin'&&(await env.DB.prepare("SELECT COUNT(*) n FROM operators WHERE role='admin' AND active=1").first()).n<=1)throw new HttpError(409,'Keep at least one QC administrator.');
 }else{p={id:crypto.randomUUID()};await env.DB.prepare("INSERT INTO operators(id,name,email,role,active,credential_status,details) VALUES(?,?,?,?,1,'pending','{}')").bind(p.id,user.name,emailKey(user.email),role).run();}
 await env.DB.batch([env.DB.prepare('INSERT INTO qc_login_links(operator_id,auth_user_id,created_at,event_id) VALUES(?,?,?,?) ON CONFLICT(operator_id) DO NOTHING').bind(p.id,user.id,now(),crypto.randomUUID()),env.DB.prepare('UPDATE operators SET name=?,role=?,active=1,revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM qc_login_links WHERE operator_id=? AND auth_user_id=?)').bind(user.name,role,p.id,p.id,user.id),env.DB.prepare('INSERT INTO audit(id,actor_id,actor_name,created_at,entity_id,event,details) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user.admin.id,user.admin.name,now(),p.id,'central_access_updated',JSON.stringify({role,source:'ClinicalApps'}))]);return p.id;
}
async function shiftsProfile(env,user,role,existing,options){
 const db=env.SHIFTS_DB;if(!db)throw new HttpError(503,'Shifts is unavailable.');
 let p=existing?await db.prepare('SELECT * FROM people WHERE id=?').bind(existing).first():await db.prepare('SELECT * FROM people WHERE lower(trim(email))=?').bind(emailKey(user.email)).first();
 if(p&&await env.DB.prepare("SELECT user_id FROM hub_grants WHERE module='shifts' AND local_id=? AND user_id<>?").bind(p.id,user.id).first())throw new HttpError(409,'This Shifts profile is assigned to another person.');
 if(p?.role==='admin'&&role!=='admin'&&(await db.prepare("SELECT COUNT(*) n FROM people WHERE role='admin' AND active=1").first()).n<=1)throw new HttpError(409,'Keep at least one Shifts administrator.');
 const nativeUser={...user,email:p?.email||user.email};const authId=await ensureNativeAuth(db,nativeUser,p?.auth_id);
 const program=options.programId===undefined?p?.program_id:options.programId||null,course=options.courseId===undefined?p?.course_id:options.courseId||null,level=options.level===undefined?p?.level||'':options.level;
 if(!['','EMT','AEMT','Paramedic'].includes(level))throw new HttpError(400,'Choose EMT, AEMT, or Paramedic.');
 if(program&&!await db.prepare('SELECT id FROM programs WHERE id=? AND active=1').bind(program).first())throw new HttpError(400,'Choose an active program.');
 if(course&&!await db.prepare('SELECT id FROM courses WHERE id=? AND program_id=? AND active=1').bind(course,program).first())throw new HttpError(400,'Choose a course in the selected program.');
 const isPreceptor=options.isPreceptor===undefined?Number(p?.is_preceptor||role==='preceptor'):Number(options.isPreceptor===true),isFto=options.isFto===undefined?Number(p?.is_fto||false):Number(options.isFto===true);
 if(p)await db.prepare('UPDATE people SET name=?,role=?,active=1,auth_id=?,program_id=?,course_id=?,level=?,is_preceptor=?,is_fto=? WHERE id=?').bind(user.name,role,authId,program||null,course||null,level,isPreceptor,isFto,p.id).run();
 else{p={id:crypto.randomUUID()};await db.prepare('INSERT INTO people(id,auth_id,name,email,role,program_id,course_id,level,active,created_at,is_preceptor,is_fto) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)').bind(p.id,authId,user.name,emailKey(user.email),role,program||null,course||null,level,now(),isPreceptor,isFto).run();}
 return p.id;
}
async function narcsProfile(env,user,role,existing,options){
 const db=env.NARCS_DB;if(!db)throw new HttpError(503,'Narcs is unavailable.');
 for(let attempt=0;attempt<3;attempt++){
  const row=await db.prepare("SELECT revision,state FROM clinicalnarcs_records WHERE space='live' ORDER BY revision DESC LIMIT 1").first();if(!row)throw new HttpError(503,'The existing Narcs workspace is unavailable.');
  const state=JSON.parse(row.state);let p=existing?state.people.find(x=>x.id===existing):state.people.find(x=>emailKey(x.email)===emailKey(user.email));
  if(existing&&!p)throw new HttpError(409,'The historical Narcs profile is unavailable.');
  if(p?.role==='admin'&&role!=='admin'&&state.people.filter(x=>x.role==='admin'&&x.active).length<=1)throw new HttpError(409,'Keep at least one Narcs administrator.');
  const regions=options.regions===undefined?p?.regions||[]:options.regions;
  if(!Array.isArray(regions)||regions.length>30||regions.some(x=>typeof x!=='string'||x.length>100))throw new HttpError(400,'Check Narcs regions.');
  const link=p?await db.prepare('SELECT auth_user_id FROM narcs_login_links WHERE person_id=?').bind(p.id).first():null;
  const authId=await ensureNativeAuth(db,{...user,email:p?.email||user.email},link?.auth_user_id);
  const elsewhere=await env.DB.prepare("SELECT user_id FROM hub_grants WHERE module='narcs' AND local_id=? AND user_id<>?").bind(p?.id||'',user.id).first();if(elsewhere)throw new HttpError(409,'This Narcs profile is assigned to another person.');
  if(p)Object.assign(p,{name:user.name,role,regions,active:true});else{p={id:crypto.randomUUID(),name:user.name,email:emailKey(user.email),role,regions,active:true};state.people.push(p);}
  const stamp=now(),event={id:crypto.randomUUID(),type:'member',at:stamp,occurredAt:stamp,summary:'People & access updated '+user.name,details:{personId:p.id,role,regions,source:'ClinicalApps'},signature:{userId:'hub:'+user.admin.id,authUserId:user.admin.id,email:user.admin.email,name:user.admin.name,at:stamp,statement:'Administrator configured application access in ClinicalApps.'}};
  const result=await db.batch([
   db.prepare("INSERT INTO clinicalnarcs_records(space,revision,request_id,state,event,created_at) SELECT 'live',?,?,?,?,? WHERE (SELECT MAX(revision) FROM clinicalnarcs_records WHERE space='live')=?").bind(row.revision+1,event.id,JSON.stringify(state),JSON.stringify(event),stamp,row.revision),
   db.prepare("INSERT INTO narcs_login_links(person_id,email,auth_user_id,created_at,event_id) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM clinicalnarcs_records WHERE space='live' AND request_id=?) ON CONFLICT(person_id) DO NOTHING").bind(p.id,emailKey(p.email),authId,stamp,event.id,event.id),
  ]);if(result[0].meta.changes)return p.id;
 }
 throw new HttpError(409,'Narcs changed while saving. Your other records were preserved; retry this app.');
}
export async function configureApp(env,actor,{userId,module,enabled,role,options={}}){
 const admin=await adminActor(env,actor);if(!admin)throw new HttpError(403,'Administrator access is required.');
 if(!APP_ROLES[module]||!APP_ROLES[module].includes(role)||typeof enabled!=='boolean')throw new HttpError(400,'Choose an app, access status, and valid role.');
 const user=await env.DB.prepare('SELECT id,name,email FROM auth_user WHERE id=?').bind(userId).first();if(!user)throw new HttpError(404,'Person not found.');user.admin=admin;
 const token=crypto.randomUUID();const lock=await env.DB.prepare('INSERT INTO hub_provision_locks(user_id,module,token,expires_at) VALUES(?,?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE hub_provision_locks.expires_at<?').bind(userId,module,token,Date.now()+120000,Date.now()).run();if(!lock.meta.changes)throw new HttpError(409,'Another app change is being saved for this person. Try again shortly.');
 try{
  const old=await env.DB.prepare('SELECT * FROM hub_grants WHERE user_id=? AND module=?').bind(userId,module).first();
  // Cross-database writes cannot be atomic. Fail closed until profile provisioning succeeds.
  if(old)await env.DB.prepare('UPDATE hub_grants SET enabled=0,updated_at=? WHERE user_id=? AND module=?').bind(now(),userId,module).run();
  if(!enabled){await env.DB.batch([audit(env.DB,actor,'module_access_disabled',userId,{module})]);return{ok:true};}
  let localId;
  if(module==='qc')localId=await qcProfile(env,user,role,old?.local_id);
  else if(module==='shifts')localId=await shiftsProfile(env,user,role,old?.local_id,options);
  else if(module==='narcs')localId=await narcsProfile(env,user,role,old?.local_id,options);
  else {localId=userId;if(module==='credentials'){if(!env.PRIVATE_APPS)throw new HttpError(503,'The credential directory connection is unavailable.');await env.PRIVATE_APPS.provisionCredentialPerson(actor,{name:user.name,email:user.email});}await env.DB.prepare('INSERT INTO hub_site_roles(user_id,module,role) VALUES(?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET role=excluded.role').bind(userId,module,role).run();}
  await adminActor(env,actor);
  const saved=await env.DB.batch([
   env.DB.prepare('INSERT INTO hub_members(user_id,is_admin,enabled,created_at) VALUES(?,0,1,?) ON CONFLICT(user_id) DO NOTHING').bind(userId,now()),
   env.DB.prepare('INSERT INTO hub_grants(user_id,module,local_id,enabled,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(user_id,module) DO UPDATE SET enabled=1,updated_at=excluded.updated_at WHERE hub_grants.local_id=excluded.local_id').bind(userId,module,localId,now()),
   audit(env.DB,actor,'module_access_configured',userId,{module,role,localId}),
  ]);if(!saved[1].meta.changes)throw new HttpError(409,'A historical account link changed. Reload and review it.');return{ok:true};
 }catch(error){await env.DB.batch([audit(env.DB,actor,'module_access_incomplete',userId,{module})]);throw new HttpError(error instanceof HttpError?error.status:503,(error instanceof HttpError?error.message:'This app could not finish updating.')+' Shared access is disabled until you save this app successfully.');}finally{await env.DB.prepare('DELETE FROM hub_provision_locks WHERE user_id=? AND module=? AND token=?').bind(userId,module,token).run();}
}
