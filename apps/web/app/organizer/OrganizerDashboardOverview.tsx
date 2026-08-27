'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, TicketCheck, Wallet } from 'lucide-react';
import { eur } from '@nocturne/types';
import { getSupabase } from '../../lib/supabase-browser';

type EventRow={id:string;title:string;starts_at:string;status:string;publish_at:string|null};
type Stats={events:number;published:number;tickets:number;revenue:number;next:EventRow|null};

export default function OrganizerDashboardOverview(){
 const [stats,setStats]=useState<Stats>({events:0,published:0,tickets:0,revenue:0,next:null});
 useEffect(()=>{async function load(){const supabase=getSupabase();const {data:auth}=await supabase.auth.getUser();if(!auth.user)return;const {data:events}=await supabase.from('events').select('id,title,starts_at,status,publish_at').eq('organizer_id',auth.user.id).neq('status','cancelled');const rows=(events??[]) as EventRow[],ids=rows.map(event=>event.id);const {data:types}=ids.length?await supabase.from('ticket_types').select('event_id,price_cents,sold_quantity').in('event_id',ids):{data:[]};const now=new Date(),next=rows.filter(event=>new Date(event.starts_at)>now).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))[0]??null;setStats({events:rows.length,published:rows.filter(event=>event.status==='published'||Boolean(event.publish_at&&new Date(event.publish_at)<=now)).length,tickets:(types??[]).reduce((sum,type)=>sum+type.sold_quantity,0),revenue:(types??[]).reduce((sum,type)=>sum+type.sold_quantity*type.price_cents,0),next})}load()},[]);
 return <section className="pro-overview"><div className="pro-stat-grid"><article><CalendarDays/><span>Soirées</span><strong>{stats.events}</strong><small>{stats.published} publiée{stats.published>1?'s':''}</small></article><article><TicketCheck/><span>Billets vendus</span><strong>{stats.tickets}</strong><small>Toutes les soirées</small></article><article><Wallet/><span>Volume brut</span><strong>{eur(stats.revenue)}</strong><small>Avant frais et remboursements</small></article></div><div className="pro-next-event"><p className="eyebrow">PROCHAINE SOIRÉE</p>{stats.next?<><h3>{stats.next.title}</h3><p>{new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeStyle:'short'}).format(new Date(stats.next.starts_at))}</p></>:<p className="profile-empty">Aucune soirée à venir.</p>}</div></section>
}
