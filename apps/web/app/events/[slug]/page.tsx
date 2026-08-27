'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, LoaderCircle, MapPin, Star } from 'lucide-react';
import { eur } from '@nocturne/types';
import { events as demoEvents, ticketTypes as demoTicketTypes } from '../../../lib/demo';
import { getSupabase, isSupabaseConfigured } from '../../../lib/supabase-browser';

type EventView = { id:string; slug:string; title:string; description:string|null; starts_at:string; ends_at:string|null; city:string; genre:string|null; cover_path:string|null };
type TicketView = { id:string; name:string; price_cents:number; quantity:number; sold_quantity:number };

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<EventView|null>(null);
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId,setUserId]=useState<string|null>(null);
  const [rating,setRating]=useState(0);
  const [feedback,setFeedback]=useState('');
  const [reviewSaving,setReviewSaving]=useState(false);
  const [reviewMessage,setReviewMessage]=useState('');
  const [reviewError,setReviewError]=useState('');
  useEffect(()=>{async function load(){
    if(isSupabaseConfigured){const supabase=getSupabase();const {data}=await supabase.from('events').select('id, slug, title, description, starts_at, ends_at, city, genre, cover_path').eq('slug',slug).maybeSingle();if(data){setEvent(data);const [{data:ticketData},{data:auth}]=await Promise.all([supabase.from('ticket_types').select('id, name, price_cents, quantity, sold_quantity').eq('event_id',data.id).order('price_cents'),supabase.auth.getUser()]);setTickets(ticketData??[]);if(auth.user){setUserId(auth.user.id);const {data:review}=await supabase.from('event_reviews').select('rating,feedback').eq('event_id',data.id).eq('reviewer_id',auth.user.id).maybeSingle();if(review){setRating(review.rating);setFeedback(review.feedback??'')}}setLoading(false);return;}}
    const demo=demoEvents.find(item=>item.slug===slug);if(demo){setEvent({id:demo.id,slug:demo.slug,title:demo.title,description:null,starts_at:demo.startsAt,ends_at:null,city:demo.city,genre:demo.genre,cover_path:demo.coverUrl});setTickets(demoTicketTypes.filter(item=>item.eventId===demo.id).map(item=>({id:item.id,name:item.name,price_cents:item.priceCents,quantity:item.quantity,sold_quantity:item.soldQuantity})));}setLoading(false);
  }load()},[slug]);
  if(loading)return <main><section className="profile-loading">Chargement...</section></main>;
  if(!event)return <main><section className="profile-error"><p className="eyebrow">SOIRÉE INTROUVABLE</p><h1>Cette soirée n’est pas disponible.</h1><Link className="cta" href="/"><ArrowLeft size={16}/>Retour</Link></section></main>;
  const coverUrl=event.cover_path?.startsWith('http')?event.cover_path:event.cover_path?getSupabase().storage.from('event-media').getPublicUrl(event.cover_path).data.publicUrl:null;
  const eventId=event.id;
  const format=(value:string)=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeStyle:'short'}).format(new Date(value));
  const finished=new Date(event.ends_at||event.starts_at)<new Date();
  async function saveReview(){if(!userId||!rating)return;setReviewSaving(true);setReviewError('');setReviewMessage('');const {error}=await getSupabase().from('event_reviews').upsert({event_id:eventId,reviewer_id:userId,rating,feedback:feedback.trim()||null,updated_at:new Date().toISOString()},{onConflict:'event_id,reviewer_id'});if(error)setReviewError('Impossible d’enregistrer votre avis. Vérifiez que la migration des avis a bien été appliquée.');else setReviewMessage('Merci, votre retour a été transmis à l’organisation.');setReviewSaving(false)}
  return <main><nav><Link className="brand" href="/">NOCTURNE<span>°</span></Link><Link className="back" href="/"><ArrowLeft size={16}/>Retour</Link></nav><section className="detail">{coverUrl?<img className="detail-cover" src={coverUrl} alt=""/>:<div className="detail-cover event-cover-fallback"><span>NOCTURNE°</span></div>}<div className="detail-info"><p className="eyebrow">{event.genre||'SOIRÉE'}</p><h1>{event.title}</h1><div className="details"><p><CalendarDays/>{format(event.starts_at)}{event.ends_at&&<> — {format(event.ends_at)}</>}</p><p><MapPin/>{event.city}</p></div><p className="lede">{event.description||'Une nuit pensée par la communauté Nocturne.'}</p></div><aside className="buy-box"><p className="eyebrow">BILLETTERIE SÉCURISÉE</p><h2>Choisir un billet</h2>{tickets.map(ticket=><div className="ticket-row" key={ticket.id}><span><b>{ticket.name}</b><small>{ticket.quantity-ticket.sold_quantity} restants</small></span><b>{eur(ticket.price_cents)}</b></div>)}{tickets.length===0&&<p className="profile-empty">Billetterie bientôt disponible.</p>}<button className="buy" disabled={!tickets.length}>Continuer vers le paiement</button><small>Votre QR sera disponible dans l’app et par e-mail.</small></aside></section>{finished&&<section className="event-review"><div className="event-review-card"><p className="eyebrow">VOTRE RETOUR</p><h2>Comment était cette soirée ?</h2><p>La notation est facultative. Votre commentaire est transmis à l’organisation pour l’aider à améliorer ses prochaines éditions.</p>{userId?<><div className="event-rating-buttons" aria-label="Note sur cinq">{[1,2,3,4,5].map(value=><button className={value<=rating?'active':''} type="button" aria-label={`${value} étoile${value>1?'s':''}`} onClick={()=>setRating(value)} key={value}><Star size={20} fill={value<=rating?'currentColor':'none'}/></button>)}</div><textarea maxLength={2000} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Un commentaire pour l’organisation (facultatif)"/><div className="event-review-actions"><button className="cta" type="button" disabled={!rating||reviewSaving} onClick={saveReview}>{reviewSaving?<LoaderCircle className="spin" size={17}/>:<Star size={17}/>}Envoyer mon avis</button>{reviewMessage&&<span className="profile-success">{reviewMessage}</span>}{reviewError&&<span className="profile-error">{reviewError}</span>}</div></>:<Link className="cta" href="/auth">Se connecter pour laisser un avis</Link>}</div></section>}</main>;
}
