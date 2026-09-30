'use client';
import {Switch} from '@/components/ui/switch';
import type {TemperatureSettings as Settings} from '@/lib/temperature-settings';
export default function TemperatureSettings({value,busy,onChange}:{value:Settings,busy:boolean,onChange:(value:Settings)=>void}){
 const settings=value||{qcEnabled:true,storageEnabled:true,revision:0};
 return <section className="panel overflow-hidden"><div className="panel-head"><h2>Temperature recording settings</h2><span className="text-sm text-[#61768d]">Administrator</span></div><div className="divide-y">{[
  {key:'qcEnabled' as const,label:'Temperatures with daily QC',description:'Collect high, low, and current temperatures with the first QC. Repeat tests link to the original temperature record.'},
  {key:'storageEnabled' as const,label:'Office and supply storage temperatures',description:'Enable the separate temperature form for offices and supply storage locations.'}
 ].map(option=><div key={option.key} className="flex items-start justify-between gap-5 p-5"><div><label htmlFor={option.key} className="font-semibold">{option.label}</label><p className="mt-2 text-sm leading-6 text-[#61768d]">{option.description}</p><p className="mt-2 text-sm font-semibold">{settings[option.key]?'On':'Off'}</p></div><Switch id={option.key} checked={settings[option.key]} disabled={busy} onCheckedChange={checked=>onChange({...settings,[option.key]:checked})} className="mt-1 shrink-0"/></div>)}</div><p className="border-t p-5 text-sm text-[#61768d]">Changes apply to new entries. Saved temperature records and their corrective measures remain available.</p></section>
}
