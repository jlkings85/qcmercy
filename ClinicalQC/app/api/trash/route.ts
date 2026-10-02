import {requireOwner} from '@/lib/owner';
import {rows,one,stmt,db,uid,now,auditStmt,Problem} from '@/lib/server';
import {TRASH_CATEGORIES,TRASH_TABLES,rowKey,trashLabel,planTrash} from '@/lib/trash-plan';
export const dynamic='force-dynamic';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const fail=(e:any)=>json({error:e instanceof Problem?e.message:e.message?.includes('constraint')?'Items changed or a restored item conflicts with existing data. Refresh and try again.':e.message||'Unable to manage trash.'},e instanceof Problem?e.code:400);
const hash=async(v:any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function GET(req:Request){try{const me=await requireOwner(),p=new URL(req.url).searchParams;
 if(p.get('view')==='trash')return json({items:await rows('SELECT id,created_at,actor_name,category,item_count,restored_at FROM qc_trash ORDER BY created_at DESC LIMIT 500')});
 const category=p.get('category')||'records',c=TRASH_CATEGORIES[category];if(!c)throw new Problem('Choose a category.');
 const data=await rows(`SELECT * FROM ${c.table}`),q=(p.get('q')||'').toLowerCase();
 const filtered=data.filter(r=>(!c.kind||r.kind===c.kind)&&!(c.table==='operators'&&r.id===me.id)).map(r=>({id:r.id,label:trashLabel(c.table,r),status:r.status||'',date:r.occurred_at||r.created_at||''})).filter(r=>`${r.label} ${r.id}`.toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date)||a.label.localeCompare(b.label));
 const page=Math.max(0,Number(p.get('page'))||0);return json({items:filtered.slice(page*100,page*100+100),total:filtered.length,categories:TRASH_CATEGORIES});
 }catch(e){return fail(e)}}
export async function POST(req:Request){try{if(req.headers.get('origin')!==new URL(req.url).origin)throw new Problem('Refresh the page before making changes.',403);const me=await requireOwner(),b:any=await req.json();
 if(b.op==='restore'){
 const entry=await one('SELECT * FROM qc_trash WHERE id=? AND restored_at IS NULL',b.id);if(!entry)throw new Problem('This trash group was already restored or no longer exists.');
 const data=JSON.parse(entry.payload),ops:any[]=[];
 // Parents first so operator login/invitation foreign keys remain valid.
 for(const table of TRASH_TABLES)for(const row of data[table]||[]){const cols=Object.keys(row);ops.push(stmt(`INSERT INTO ${table} (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,...cols.map(c=>row[c])));}
 ops.push(stmt('UPDATE qc_trash SET restored_at=? WHERE id=?',now(),entry.id),auditStmt(me,entry.id,'Trash restored',{category:entry.category,count:entry.item_count}));await db().batch(ops);return json({ok:true});
 }
 if(!['preview','trash'].includes(b.op))throw new Problem('Unknown trash action.');
 const all:Record<string,any[]>=Object.fromEntries(await Promise.all(TRASH_TABLES.map(async t=>[t,await rows(`SELECT * FROM ${t}`)])));
 const plan=planTrash(all,b.category,b.ids,me.id),fingerprint=await hash(plan.selected);
 if(b.op==='preview')return json({fingerprint,total:plan.total,counts:plan.counts,items:Object.entries(plan.selected).flatMap(([t,rs])=>rs.filter(()=>!['qc_login_links','qc_invitations','history_rows'].includes(t)).map(r=>({table:t,label:trashLabel(t,r)})))});
 if(b.confirm!=='MOVE TO TRASH'||b.fingerprint!==fingerprint)throw new Problem('The selection changed. Preview it again before moving to trash.',409);
 const id=uid(),ops:any[]=[];
 // A failed guard aborts the entire batch, including archive and deletions.
 for(const table of TRASH_TABLES){const guard=uid();ops.push(stmt(`INSERT INTO qc_trash_guard(id,valid) VALUES (?,(SELECT count(*)=? FROM ${table}))`,guard,all[table].length),stmt('DELETE FROM qc_trash_guard WHERE id=?',guard));}
 for(const [table,rs] of Object.entries(plan.selected))for(const row of rs){const guard=uid(),cols=Object.keys(row);ops.push(stmt(`INSERT INTO qc_trash_guard(id,valid) VALUES (?,(SELECT count(*) FROM ${table} WHERE ${cols.map(c=>`"${c}" IS ?`).join(' AND ')}))`,guard,...cols.map(c=>row[c])),stmt('DELETE FROM qc_trash_guard WHERE id=?',guard));}
 ops.push(stmt('INSERT INTO qc_trash(id,created_at,actor_name,category,item_count,payload) VALUES (?,?,?,?,?,?)',id,now(),me.name,b.category,plan.total,JSON.stringify(plan.selected)));
 for(const link of plan.selected.qc_login_links)ops.push(stmt('DELETE FROM auth_session WHERE user_id=?',link.auth_user_id));
 for(const table of [...TRASH_TABLES].reverse())for(const row of plan.selected[table])ops.push(stmt(`DELETE FROM ${table} WHERE ${rowKey(table)}=?`,row[rowKey(table)]));
 ops.push(auditStmt(me,id,'Items moved to recoverable trash',{category:b.category,counts:plan.counts}));await db().batch(ops);return json({ok:true});
 }catch(e){return fail(e)}}
