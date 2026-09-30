import {operator,rows,one,Problem,date} from '@/lib/server';
import {centralDayBounds} from '@/lib/report';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const me=await operator(),p=new URL(req.url).searchParams,where=["status NOT IN ('historical_superseded','historical_excluded')"],args:any[]=[];
 if(!['admin','supervisor'].includes(me.role)){where.push('operator_id=?');args.push(me.id)}
 if(p.get('id')){where.push('id=?');args.push(p.get('id'));const r=await one(`SELECT * FROM records WHERE ${where.join(' AND ')}`, ...args);if(!r)throw new Problem('Record not found.',404);return Response.json({record:{...r,snapshot:JSON.parse(r.snapshot)}},{headers:{'Cache-Control':'no-store'}})}
 const query=(p.get('q')||'').trim().slice(0,150);if(query){where.push('lower(snapshot) LIKE ? ESCAPE \'\\\'');args.push('%'+query.toLowerCase().replace(/[\\%_]/g,c=>'\\'+c)+'%')}
 const source=p.get('source');if(source==='historical')where.push("json_extract(snapshot,'$.historical')=1");else if(source==='live')where.push("COALESCE(json_extract(snapshot,'$.historical'),0)=0");
 if(p.get('from')){const d=date(p.get('from'),'start date')!;where.push('occurred_at>=?');args.push(centralDayBounds(d).start)}
 if(p.get('to')){const d=date(p.get('to'),'end date')!;where.push('occurred_at<?');args.push(centralDayBounds(d).end)}
 const rawPage=Number(p.get('page')||0),page=Number.isInteger(rawPage)&&rawPage>=0?Math.min(rawPage,10000):0,limit=50;
 const count=await one(`SELECT count(*) AS n FROM records WHERE ${where.join(' AND ')}`,...args);
 const records=await rows(`SELECT * FROM records WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,...args,limit,page*limit);
 return Response.json({records:records.map(r=>({...r,snapshot:JSON.parse(r.snapshot)})),total:count.n,page,pageSize:limit},{headers:{'Cache-Control':'no-store'}});
 }catch(e:any){return Response.json({error:e instanceof Problem?e.message:'QC history is temporarily unavailable.'},{status:e instanceof Problem?e.code:500})}}
