'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, Newspaper, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';

type View='feed'|'upcoming'|'search';
export default function MobileHomeNav(){
 const pathname=usePathname(),[view,setView]=useState<View>('feed');
 useEffect(()=>{if(pathname!=='/')return;document.body.dataset.mobileHomeView=view;if(view==='search')setTimeout(()=>document.querySelector<HTMLInputElement>('.global-search input')?.focus(),80);return()=>{delete document.body.dataset.mobileHomeView}},[pathname,view]);
 useEffect(()=>{if(pathname!=='/')return;const apply=()=>document.querySelectorAll<HTMLElement>('.event-day-list').forEach(list=>{const rows=[...list.querySelectorAll<HTMLElement>('.event-feed-row')];list.querySelector('.mobile-more-events')?.remove();rows.forEach((row,index)=>row.classList.toggle('mobile-event-hidden',index>=6));if(rows.length>6){const button=document.createElement('button');button.className='mobile-more-events';button.textContent=`Voir ${rows.length-6} soirée${rows.length-6>1?'s':''} de plus`;button.onclick=()=>{rows.forEach(row=>row.classList.remove('mobile-event-hidden'));button.remove()};list.appendChild(button)}});const timer=setTimeout(apply,250);return()=>clearTimeout(timer)},[pathname,view]);
 if(pathname!=='/')return null;
 return <nav className="mobile-home-tabs" aria-label="Navigation principale mobile"><button className={view==='feed'?'active':''} onClick={()=>setView('feed')}><Newspaper/><span>Fil d’actualité</span></button><button className={view==='upcoming'?'active':''} onClick={()=>setView('upcoming')}><CalendarDays/><span>À venir</span></button><button className={view==='search'?'active':''} aria-label="Recherche" onClick={()=>setView('search')}><Search/></button></nav>;
}

