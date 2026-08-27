'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NavigationTransitions(){
 const router=useRouter();
 useEffect(()=>{const navigate=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const anchor=(event.target as Element).closest<HTMLAnchorElement>('a[href]');if(!anchor||anchor.target||anchor.download||anchor.dataset.noTransition!==undefined)return;const url=new URL(anchor.href,location.href);if(url.origin!==location.origin||url.pathname===location.pathname&&url.search===location.search||url.hash&&url.pathname===location.pathname)return;event.preventDefault();const destination=url.pathname+url.search+url.hash;if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.startViewTransition(()=>router.push(destination));else router.push(destination)};document.addEventListener('click',navigate);return()=>document.removeEventListener('click',navigate)},[router]);
 return null;
}

