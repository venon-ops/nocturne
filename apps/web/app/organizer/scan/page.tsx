'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, CheckCircle2, WifiOff, XCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { getSupabase } from '../../../lib/supabase-browser';

type Result = { type:'accepted'|'already_used'|'wrong_event'|'invalid'|'unauthorized'|'technical_error'; name:string|null } | null;

export default function OrganizerScanPage(){
  const eventId=useSearchParams().get('event');
  const videoRef=useRef<HTMLVideoElement>(null);
  const controlsRef=useRef<IScannerControls|null>(null);
  const locked=useRef(false);
  const lastScan=useRef({value:'',at:0});
  const [result,setResult]=useState<Result>(null);
  const [error,setError]=useState('');
  const [count,setCount]=useState(0);

  const validate=useCallback(async(rawValue:string)=>{
    if(locked.current)return;
    const now=Date.now();
    if(lastScan.current.value===rawValue&&now-lastScan.current.at<3500)return;
    lastScan.current={value:rawValue,at:now};
    locked.current=true;
    const prefix='nocturne:ticket:';
    if(!rawValue.startsWith(prefix)){setResult({type:'invalid',name:null});return}
    const supabase=getSupabase();
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError){setResult({type:'technical_error',name:null});return}
    if(!user||!eventId){setResult({type:'unauthorized',name:null});return}
    const {data,error:rpcError}=await supabase.rpc('validate_ticket_token_for_event',{p_token:rawValue.slice(prefix.length),p_scanner:user.id,p_event:eventId});
    if(rpcError){setResult({type:rpcError.message.toLowerCase().includes('not authorized')?'unauthorized':'technical_error',name:null});return}
    const response=Array.isArray(data)?data[0]:null;
    const type=response?.result==='accepted'||response?.result==='already_used'||response?.result==='wrong_event'?response.result:'invalid';
    setResult({type,name:response?.attendee_name??null});
    if(type==='accepted'&&eventId){const {count:next}=await supabase.from('check_ins').select('id',{count:'exact',head:true}).eq('event_id',eventId);setCount(current=>next??current+1)}
  },[eventId]);

  useEffect(()=>{if(!eventId)return;getSupabase().from('check_ins').select('id',{count:'exact',head:true}).eq('event_id',eventId).then(({count:initial})=>setCount(initial??0))},[eventId]);

  useEffect(()=>{
    let active=true;
    async function start(){
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera-unavailable');
        if(!videoRef.current)return;
        const reader=new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:120,delayBetweenScanSuccess:700});
        const controls=await reader.decodeFromConstraints(
          {video:{facingMode:{ideal:'environment'}},audio:false},
          videoRef.current,
          result=>{if(active&&result&&!locked.current)void validate(result.getText())},
        );
        if(!active){controls.stop();return}
        controlsRef.current=controls;
      }catch{setError("Impossible d’accéder à la caméra. Autorisez-la dans votre navigateur et vérifiez que le site utilise HTTPS.")}
    }
    void start();return()=>{active=false;controlsRef.current?.stop();controlsRef.current=null};
  },[validate]);

  useEffect(()=>{if(!result)return;const timer=window.setTimeout(()=>{setResult(null);locked.current=false},1700);return()=>window.clearTimeout(timer)},[result]);

  return <main className="web-scan-page"><header><Link href="/organizer/dashboard"><ArrowLeft size={19}/>Tableau de bord</Link><span><CheckCircle2 size={17}/>{count} scanné{count>1?'s':''}</span></header><section className="web-scan-camera"><video ref={videoRef} playsInline muted/><div className="web-scan-frame"/><div className="web-scan-title"><Camera/><h1>Scanner un billet</h1><p>Cadrez le QR code du participant</p></div>{error&&<div className="web-scan-error"><XCircle/><p>{error}</p></div>}{result&&<div className={`web-scan-banner ${result.type}`} role="status"><span>{result.type==='accepted'?<CheckCircle2/>:result.type==='technical_error'?<WifiOff/>:<XCircle/>}</span><div><strong>{result.type==='accepted'?'BILLET VALIDE':result.type==='already_used'?'DÉJÀ SCANNÉ':result.type==='technical_error'?'ERREUR RÉSEAU':result.type==='unauthorized'?'NON AUTORISÉ':'BILLET INVALIDE'}</strong>{result.type==='technical_error'?<small>Réessayez dans un instant</small>:result.name&&<small>{result.name}</small>}</div></div>}</section></main>;
}
