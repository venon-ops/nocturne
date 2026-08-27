'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowLeft, LoaderCircle, Ticket as TicketIcon } from 'lucide-react';
import { getSupabase } from '../../lib/supabase-browser';

type TicketRow={id:string;qr_token:string;status:string;events:{title:string;starts_at:string;city:string}|null;ticket_types:{name:string}|null};
export default function TicketsPage(){
 const [tickets,setTickets]=useState<TicketRow[]>([]),[codes,setCodes]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{async function load(){const supabase=getSupabase();const {data:{user}}=await supabase.auth.getUser();if(!user){location.assign('/auth?next=/tickets');return}const {data,error}=await supabase.from('tickets').select('id,qr_token,status,events(title,starts_at,city),ticket_types(name),orders!inner(buyer_id)').eq('orders.buyer_id',user.id).order('created_at',{ascending:false});if(error){setError('Impossible de charger vos billets.');setLoading(false);return}const rows=(data??[]) as unknown as TicketRow[];setTickets(rows);const generated=await Promise.all(rows.map(async ticket=>[ticket.id,await QRCode.toDataURL(`nocturne:ticket:${ticket.qr_token}`,{width:240,margin:1})] as const));setCodes(Object.fromEntries(generated));setLoading(false)}load()},[]);
 if(loading)return <main className="tickets-page"><LoaderCircle className="spin"/></main>;
 return <main className="tickets-page"><nav><Link className="brand" href="/">NOCTURNE<span>°</span></Link><Link className="back" href="/"><ArrowLeft size={16}/>Retour</Link></nav><header><p className="eyebrow">MON ESPACE</p><h1>Mes billets.</h1><p>Vos QR codes sont disponibles uniquement ici, après connexion.</p></header>{error&&<p className="profile-error">{error}</p>}{!tickets.length?<section className="tickets-empty"><TicketIcon/><h2>Aucun billet pour le moment.</h2><Link className="cta" href="/">Découvrir les soirées</Link></section>:<section className="tickets-grid">{tickets.map(ticket=><article className="ticket-card" key={ticket.id}><p className="eyebrow">{ticket.status==='used'?'UTILISÉ':'BILLET VALIDE'}</p><h2>{ticket.events?.title}</h2><p>{ticket.ticket_types?.name}</p><p>{ticket.events&&new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeStyle:'short'}).format(new Date(ticket.events.starts_at))} · {ticket.events?.city}</p>{codes[ticket.id]&&<img src={codes[ticket.id]} alt="QR code du billet"/>}<small>Présentez ce QR code à l’entrée. Ne le partagez pas.</small></article>)}</section>}</main>
}

