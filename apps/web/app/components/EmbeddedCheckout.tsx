'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle } from 'lucide-react';

type StripeCheckout={mount:(element:HTMLElement)=>void;destroy:()=>void};
type StripeClient={initEmbeddedCheckout:(options:{clientSecret:string;onComplete:()=>void})=>Promise<StripeCheckout>};
declare global{interface Window{Stripe?:(key:string)=>StripeClient}}

export default function EmbeddedCheckout({clientSecret,publishableKey,onClose}:{clientSecret:string;publishableKey:string;onClose:()=>void}){
 const mountRef=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{let checkout:StripeCheckout|undefined,cancelled=false;async function mount(){try{if(!window.Stripe){await new Promise<void>((resolve,reject)=>{const existing=document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('Stripe.js indisponible')),{once:true});return}const script=document.createElement('script');script.src='https://js.stripe.com/v3/';script.onload=()=>resolve();script.onerror=()=>reject(new Error('Stripe.js indisponible'));document.head.appendChild(script)})}if(cancelled||!window.Stripe||!mountRef.current)return;checkout=await window.Stripe(publishableKey).initEmbeddedCheckout({clientSecret,onComplete:()=>location.assign('/tickets?success=1')});if(!cancelled){checkout.mount(mountRef.current);setReady(true)}}catch(reason){if(!cancelled)setError(reason instanceof Error?reason.message:'Le paiement intégré ne peut pas être affiché.')}}mount();return()=>{cancelled=true;checkout?.destroy()}},[clientSecret,publishableKey]);
 return <div className="checkout-inline" aria-label="Paiement sécurisé"><button className="checkout-inline-back" onClick={onClose}><ArrowLeft size={15}/>Modifier les billets</button>{error?<p className="profile-error">{error}</p>:<>{!ready&&<div className="checkout-loading"><LoaderCircle className="spin"/>Chargement de Stripe…</div>}<div ref={mountRef} className="embedded-checkout"/></>}</div>;
}

