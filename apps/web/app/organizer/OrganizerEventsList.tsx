'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Eye, Pencil, XCircle } from 'lucide-react';
import { getSupabase } from '../../lib/supabase-browser';

type Row={id:string;slug:string;title:string;starts_at:string;status:'draft'|'published'|'cancelled';publish_at:string|null};
const slugify=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

export default function OrganizerEventsList(){
 const [events,setEvents]=useState<Row[]>([]),[error,setError]=useState('');
 const load=useCallback(async()=>{const {data:auth}=await getSupabase().auth.getUser();if(!auth.user)return;const {data,error}=await getSupabase().from('events').select('id,slug,title,starts_at,status,publish_at').eq('organizer_id',auth.user.id).order('starts_at',{ascending:false});if(error)setError('Impossible de charger vos soirées.');else setEvents(data??[])},[]);
 useEffect(()=>{load()},[load]);
 function label(event:Row){if(event.status==='cancelled')return 'Annulée';if(event.status==='published')return 'Publiée';if(event.publish_at&&new Date(event.publish_at)>new Date())return 'Programmée';if(event.publish_at)return 'Publiée';return 'Brouillon'}
 async function cancel(id:string){if(!confirm('Annuler cette soirée ? Elle ne sera plus visible au public.'))return;const {error}=await getSupabase().rpc('cancel_event',{p_event_id:id});if(error)setError('Impossible d’annuler cette soirée.');else load()}
 async function duplicate(event:Row){const proposed=`${slugify(event.title)}-copie-${Date.now().toString().slice(-5)}`;const slug=prompt('Adresse de la copie :',proposed);if(!slug)return;const {error}=await getSupabase().rpc('duplicate_event',{p_event_id:event.id,p_new_slug:slugify(slug)});if(error)setError('Impossible de dupliquer cette soirée.');else load()}
 return <section className="organizer-events"><div className="section-head"><div><p className="eyebrow">VOTRE PROGRAMMATION</p><h2>Mes soirées</h2></div></div>{error&&<p className="profile-error">{error}</p>}{events.length===0?<div className="claim-empty">Vous n’avez encore créé aucune soirée.</div>:<div className="organizer-event-list">{events.map(event=><article className="organizer-event-row" key={event.id}><div><span className={`event-status status-${label(event).toLowerCase().replace('é','e')}`}>{label(event)}</span><h3>{event.title}</h3><small>{new Date(event.starts_at).toLocaleString('fr-FR')}</small>{event.publish_at&&label(event)==='Programmée'&&<small>Publication : {new Date(event.publish_at).toLocaleString('fr-FR')}</small>}</div><div className="organizer-event-actions"><Link title="Aperçu" href={`/events/${event.slug}`}><Eye size={17}/></Link><Link title="Modifier" href={`/organizer/events/${event.id}`}><Pencil size={17}/></Link><button title="Dupliquer" onClick={()=>duplicate(event)}><Copy size={17}/></button>{event.status!=='cancelled'&&<button className="danger" title="Annuler" onClick={()=>cancel(event.id)}><XCircle size={17}/></button>}</div></article>)}</div>}</section>
}
