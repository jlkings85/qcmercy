'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
export default function BarcodeScan({label,onScan,disabled=false}:{label:string;onScan:(text:string)=>string|void;disabled?:boolean}){
 const [open,setOpen]=useState(false),[message,setMessage]=useState(''),[text,setText]=useState('');
 const video=useRef<HTMLVideoElement>(null),stop=useRef<()=>void>(()=>{}),generation=useRef(0),callback=useRef(onScan);callback.current=onScan;
 async function reader(){const [{BrowserMultiFormatReader},{DecodeHintType,BarcodeFormat}]=await Promise.all([import('@zxing/browser'),import('@zxing/library')]);return new BrowserMultiFormatReader(new Map<any,any>([[DecodeHintType.TRY_HARDER,true],[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.CODE_128,BarcodeFormat.DATA_MATRIX,BarcodeFormat.CODE_39,BarcodeFormat.QR_CODE]]]));}
 const accept=(value:string)=>{const error=callback.current(value);if(error){setMessage(error);return;}stop.current();setOpen(false);};
 useEffect(()=>{if(!open)return;const token=++generation.current;let stream:MediaStream|undefined;let controls:{stop:()=>void}|undefined;let last='';
  const cleanup=()=>{controls?.stop();stream?.getTracks().forEach(t=>t.stop());};stop.current=cleanup;
  (async()=>{try{const decoder=await reader();if(token!==generation.current)return;
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});if(token!==generation.current){cleanup();return;}
   controls=await decoder.decodeFromStream(stream,video.current!,result=>{if(token!==generation.current||!result)return;const value=result.getText();if(value===last)return;last=value;accept(value);});if(token!==generation.current)cleanup();
  }catch{if(token===generation.current)setMessage('Camera unavailable. Allow camera access, upload a clear photo, or enter the barcode below.');}})();
  return()=>{generation.current++;cleanup();};
 },[open]);
 async function photo(file:File){const token=generation.current;const url=URL.createObjectURL(file);try{const decoder=await reader();const result=await decoder.decodeFromImageUrl(url);if(token===generation.current)accept(result.getText());}catch{if(token===generation.current)setMessage('Could not read this photo. Move closer, avoid glare, and keep the whole barcode in view.');}finally{URL.revokeObjectURL(url);}}
 return <><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={()=>{setText('');setMessage('');setOpen(true);}}>Scan {label}</Button><Sheet open={open} onOpenChange={setOpen}><SheetContent className="w-full sm:max-w-lg overflow-y-auto"><SheetHeader><SheetTitle>Scan {label}</SheetTitle><SheetDescription>Hold the barcode level and fill the camera view. Scanning selects an item; it does not save a QC check.</SheetDescription></SheetHeader><div className="space-y-4 p-6"><video ref={video} autoPlay muted playsInline className="w-full rounded-lg bg-black"/><p role="status" className="text-sm">{message||'Point your camera at the barcode.'}</p><label className="block text-sm">Read a barcode photo<Input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void photo(f);e.target.value='';}}/></label><label className="block text-sm">Barcode / scanner input<Input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(text.trim())accept(text);}}}/></label><Button type="button" disabled={!text.trim()} onClick={()=>accept(text)}>Use barcode</Button><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancel</Button></div></SheetContent></Sheet></>;
}
