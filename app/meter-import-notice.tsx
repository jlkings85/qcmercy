'use client';
import {Button} from '@/components/ui/button';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
type R=Record<string,any>;
export default function MeterImportNotice({assets,onEdit}:{assets:R[],onEdit:(meter:R)=>void}){
 const imported=assets.filter(a=>a.kind==='device'&&a.meterImport),unassigned=imported.filter(a=>!a.departmentId),missingModels=imported.filter(a=>!a.model);
 if(!unassigned.length&&!missingModels.length)return null;
 return <section className="panel overflow-hidden"><div className="panel-head"><h2>Imported meters</h2></div><div className="space-y-2 p-5 text-sm text-[#61768d]">{unassigned.length>0&&<p><strong className="text-[#183b56]">{unassigned.length} meters need a department.</strong> These serial numbers appear under multiple departments in Meter Numbers and Locations. Select the current department using Edit assignment.</p>}{missingModels.length>0&&<p>The sheet did not include manufacturer or model. Add the model to {missingModels.length} imported meters before recording QC.</p>}</div>{unassigned.length>0&&<Table><TableHeader><TableRow><TableHead>Serial number</TableHead><TableHead>Departments listed in the sheet</TableHead><TableHead/></TableRow></TableHeader><TableBody>{unassigned.map(m=><TableRow key={m.id}><TableCell className="font-semibold">{m.serial}</TableCell><TableCell className="whitespace-normal">{m.meterImport.departments.map((d:R)=>d.label).join(' · ')}</TableCell><TableCell><Button variant="outline" onClick={()=>onEdit(m)}>Edit assignment</Button></TableCell></TableRow>)}</TableBody></Table>}</section>
}
