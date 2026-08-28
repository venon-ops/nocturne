'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Ticket as TicketIcon } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase-browser';

type TicketStatus='valid'|'used'|'refunded'|'cancelled'|'resale_pending'|'resold';
type TicketCheckIn={scanned_at:string;profiles:{display_name:string}|null;scan_sessions:{label:string}|null};
type OrganizerTicket={id:string;public_code:string;attendee_name:string|null;status:TicketStatus;created_at:string;events:{title:string}|null;ticket_types:{name:string}|null;check_ins:TicketCheckIn|TicketCheckIn[]|null};

const statusLabel=(status:TicketStatus)=>status==='used'?'Scanné':status==='resold'?'Revendu':status==='resale_pending'?'En attente':status==='refunded'?'Remboursé':status==='cancelled'?'Annulé':'Actif';

export default function OrganizerTicketsPage(){
  const [tickets,setTickets]=useState<OrganizerTicket[]>([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{async function load(){
    const supabase=getSupabase();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){location.assign('/organizer/auth');return}
    const {data,error:loadError}=await supabase.from('tickets').select('id,public_code,attendee_name,status,created_at,events(title),ticket_types(name),check_ins(scanned_at,profiles!check_ins_scanned_by_fkey(display_name),scan_sessions(label))').order('created_at',{ascending:false});
    if(loadError)setError('Impossible de charger les billets de votre organisation.');
    else setTickets((data??[]) as unknown as OrganizerTicket[]);
    setLoading(false);
  }void load()},[]);

  const filtered=useMemo(()=>{const term=query.trim().toLocaleLowerCase('fr');if(!term)return tickets;return tickets.filter(ticket=>[ticket.public_code,ticket.attendee_name,ticket.events?.title,ticket.ticket_types?.name].some(value=>value?.toLocaleLowerCase('fr').includes(term)))},[query,tickets]);

  return <section className="pro-ticket-directory"><header><p className="eyebrow">BILLETS</p><h1>Retrouver un billet.</h1><p>Recherchez par numéro public, participant, soirée ou tarif.</p></header><label className="pro-ticket-search"><Search size={19}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="NOC-7K4M-92XP, nom du participant…" autoCapitalize="characters"/></label>{error&&<p className="profile-error">{error}</p>}{loading?<p className="pro-ticket-empty">Chargement des billets…</p>:filtered.length?<div className="pro-ticket-list">{filtered.map(ticket=>{const checkIn=Array.isArray(ticket.check_ins)?ticket.check_ins[0]:ticket.check_ins;return <article key={ticket.id}><TicketIcon size={20}/><div><strong>{ticket.public_code}</strong><span>{ticket.attendee_name||'Participant non renseigné'}</span><small>{ticket.events?.title||'Soirée'} · {ticket.ticket_types?.name||'Billet'}</small>{checkIn&&<small className="pro-ticket-scan-info">Scanné par <b>{checkIn.profiles?.display_name||'Compte organisateur'}</b> · {checkIn.scan_sessions?.label||'Session historique'} · {new Date(checkIn.scanned_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</small>}</div><em className={`ticket-state state-${ticket.status}`}>{statusLabel(ticket.status)}</em></article>})}</div>:<div className="pro-ticket-empty"><TicketIcon size={28}/><p>Aucun billet ne correspond à cette recherche.</p></div>}</section>;
}
