import { env } from 'cloudflare:workers';
import {getCurrentUser} from './auth';
import {linkedOperator} from './enrollment';
export class Problem extends Error {constructor(message:string,public code=400){super(message)}}
export const db=()=>{if(!env.DB)throw new Problem('The database is temporarily unavailable. Your entries have not been cleared.',503);return env.DB};
export const stmt=(sql:string,...args:any[])=>db().prepare(sql).bind(...args);
export async function rows(sql:string,...args:any[]){return (await stmt(sql,...args).all<any>()).results}
export async function one(sql:string,...args:any[]){return await stmt(sql,...args).first<any>()}
export const decode=(r:any)=>({...r,...JSON.parse(r.details||'{}')});
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export function auditStmt(user:any,entity:string,event:string,details:any,eventId?:string){return stmt('INSERT INTO audit (id,actor_id,actor_name,created_at,entity_id,event,details) VALUES (?,?,?,?,?,?,?)',eventId||uid(),user.id,user.name,now(),entity,event,JSON.stringify(details))}
export async function identity(){const u=await getCurrentUser();if(!u)throw new Problem('Sign in to access ClinicalQC.',401);return u}
export async function operator(){const auth=await identity();const u=await linkedOperator(db(),auth);if(!u)throw new Problem('Your account needs access from a ClinicalQC administrator.',403);return decode(u)}
export function admin(u:any){if(u.role!=='admin')throw new Problem('Administrator access is required.',403)}
export function review(u:any){if(!['admin','supervisor'].includes(u.role))throw new Problem('Reviewer access is required.',403)}
export function required(value:any,label:string){if(typeof value!=='string'||!value.trim()||value.length>2000)throw new Problem(label+' is required.');return value.trim()}
export function date(value:any,label:string,optional=false){if(!value&&optional)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Problem('Enter a valid '+label+'.');return value}
