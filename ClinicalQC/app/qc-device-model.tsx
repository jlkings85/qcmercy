'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {deviceModelKey} from '@/lib/device-model';
type R=Record<string,any>;
export default function QCDeviceModel({device,assets,admin,busy,onSave}:{device:R,assets:R[],admin:boolean,busy:boolean,onSave:(model:string)=>Promise<void>}){
 const [model,setModel]=useState('');
 const choices=[...new Map(assets.filter(a=>['device','strip','low','high'].includes(a.kind)&&a.active&&deviceModelKey(a.model)).map(a=>[deviceModelKey(a.model),a.model.trim().replace(/\s+/g,' ')])).values()] as string[];
 return <div className="notice full"><strong>Set the model for meter {device.serial}</strong><p>The imported meter list did not include models. Match the model shown on this meter so its strip and control lots can be checked.</p>{admin&&choices.length>0?<div className="mt-4 flex flex-wrap items-end gap-3"><label className="field min-w-52 flex-1"><span>Manufacturer & model</span><Select value={model} onValueChange={setModel} disabled={busy}><SelectTrigger aria-label="Meter manufacturer and model"><SelectValue placeholder="Select this meter’s model"/></SelectTrigger><SelectContent>{choices.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></label><Button type="button" disabled={!model||busy} onClick={()=>onSave(model)}>{busy?'Saving…':'Save meter model'}</Button></div>:<p className="mt-2">{admin?'Add this meter’s manufacturer and model under Devices.':'Ask an administrator to set this meter’s model.'}</p>}</div>
}
