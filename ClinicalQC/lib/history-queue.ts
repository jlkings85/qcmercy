export type HistoryQueueItem={id:string;name:string;text:string;state:string;preview?:any;result?:any;error?:string};
type Send=(action:'preview'|'import',item:HistoryQueueItem,hash?:string)=>Promise<any>;
// One report is committed at a time. Never advance after an uncertain response.
export async function runHistoryQueue(items:HistoryQueueItem[],send:Send,update:(id:string,patch:Partial<HistoryQueueItem>)=>void,stopped:()=>boolean){
 let completed=0;
 for(const item of items){
  if(stopped())return {completed,paused:true};
  if(item.state!=='ready')continue;
  update(item.id,{state:'importing',error:''});
  try{
   const preview=await send('preview',item);
   if(preview.errors?.length)throw Error(preview.errors.join('\n'));
   if(preview.fileHash!==item.preview?.fileHash)throw Error('The report changed. Preview the queue again.');
   update(item.id,{preview});
   // Pause during recheck leaves this file ready; an import already sent is allowed to finish.
   if(stopped()){update(item.id,{state:'ready'});return {completed,paused:true};}
   if(preview.existingBatch||!preview.newRows){update(item.id,{state:'skipped',result:{imported:0,skipped:preview.duplicates,excluded:preview.excludedRows,alreadyImported:!!preview.existingBatch}});completed++;continue;}
   const result=await send('import',item,preview.fileHash);
   update(item.id,{state:'done',result});completed++;
  }catch(e:any){update(item.id,{state:'error',error:e.message||'Unable to confirm the import. Preview again before retrying.'});return {completed,paused:true,error:true};}
 }
 return {completed,paused:false};
}
