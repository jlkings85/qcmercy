import {oauthProvider} from '@better-auth/oauth-provider';
import {jwt} from 'better-auth/plugins';
import {writeFileSync,mkdirSync} from 'node:fs';
const models={...oauthProvider({loginPage:'/login',consentPage:'/consent'}).schema,...jwt().schema};
let sql='-- Additive only: existing QC users, passwords, sessions, and records are preserved.\n';
for(const [key,model]of Object.entries(models)){
 const fields=['id TEXT PRIMARY KEY NOT NULL'];
 for(const [name,f]of Object.entries(model.fields)){
  const type=['date','boolean','number'].includes(f.type)?'INTEGER':'TEXT';
  fields.push(`"${name}" ${type}${f.required!==false?' NOT NULL':''}${f.unique?' UNIQUE':''}`);
 }
 sql+=`CREATE TABLE IF NOT EXISTS "hub_${key}" (${fields.join(',\n')});\n`;
 for(const [n,f]of Object.entries(model.fields))if(f.index)sql+=`CREATE INDEX IF NOT EXISTS "hub_${key}_${n}" ON "hub_${key}"("${n}");\n`;
 for(const [n,i]of (model.indexes||[]).entries())sql+=`CREATE ${i.unique?'UNIQUE ':''}INDEX IF NOT EXISTS "hub_${key}_composite_${n}" ON "hub_${key}"(${i.fields.map(f=>'"'+f+'"').join(',')});\n`;
}
sql+=`
CREATE TABLE IF NOT EXISTS hub_members (user_id TEXT PRIMARY KEY REFERENCES auth_user(id), is_admin INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hub_grants (user_id TEXT NOT NULL REFERENCES auth_user(id), module TEXT NOT NULL, local_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,module), UNIQUE(module,local_id));
CREATE TABLE IF NOT EXISTS hub_audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, event TEXT NOT NULL, target_id TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hub_modules (id TEXT PRIMARY KEY, connected INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO hub_modules(id) VALUES ('qc'),('shifts'),('narcs'),('evals'),('guidelines');
`;
mkdirSync('migrations',{recursive:true});writeFileSync('migrations/0001_hub.sql',sql);
