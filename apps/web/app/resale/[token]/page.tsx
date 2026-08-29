'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, LoaderCircle, ShieldCheck, Ticket } from 'lucide-react';
import EmbeddedCheckout from '../../components/EmbeddedCheckout';
import { getSupabase } from '../../../lib/supabase-browser';

type Offer={listing_id:string;event_slug:string;event_title:string;event_city:string;event_starts_at:string;ticket_type_name:string;price_cents:number};

export default function PrivateResalePage(){
  const {token}=useParams<{token:string}>();
  const [offer,setOffer]=useState<Offer|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[checkout,setCheckout]=useState<{clientSecret:string;publishableKey:string}|null>(null),[paying,setPaying]=useState(false);
  useEffect(()=>{let cancelled=false;void (async()=>{const {data,error:loadError}=await getSupabase().rpc('get_resale_offer_by_token',{p_token:token});if(cancelled)return;const row=Array.isArray(data)?data[0]:null;if(loadError||!row)setError('Ce lien de transfert est invalide ou n’est plus disponible.');else setOffer(row as Offer);setLoading(false)})();return()=>{cancelled=true}},[token]);
  async function checkoutOffer(){const supabase=getSupabase();const {data:{session}}=await supabase.auth.getSession();if(!session){location.assign(`/auth?next=${encodeURIComponent(`/resale/${token}`)}`);return}setPaying(true);setError('');const {data,error:checkoutError}=await supabase.functions.invoke('create-resale-checkout',{body:{token}});setPaying(false);if(checkoutError||!data?.clientSecret){setError(data?.error||'Impossible de réserver ce billet.');return}setCheckout(data)}
  if(checkout)return <EmbeddedCheckout clientSecret={checkout.clientSecret} publishableKey={checkout.publishableKey} onClose={()=>setCheckout(null)}/>;
  return <main className="resale-offer-page"><nav><Link className="brand" href="/">NOCTURNE<span>°</span></Link><Link className="back" href="/"><ArrowLeft size={16}/>Retour</Link></nav>{loading?<LoaderCircle className="spin"/>:offer?<section className="resale-offer-card"><ShieldCheck size={32}/><p className="eyebrow">TRANSFERT SÉCURISÉ</p><h1>{offer.event_title}</h1><p>{new Date(offer.event_starts_at).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})} · {offer.event_city}</p><div><Ticket/><span><small>{offer.ticket_type_name}</small><strong>{(offer.price_cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</strong></span></div><button disabled={paying} onClick={()=>void checkoutOffer()}>{paying?<LoaderCircle className="spin" size={18}/>:'Accepter et payer le transfert'}</button><small>Après paiement, un nouveau QR code sera généré dans « Mes billets » et l’ancien sera invalidé.</small>{error&&<p className="profile-error">{error}</p>}</section>:<section className="resale-offer-card"><h1>Offre indisponible.</h1><p>{error}</p><Link className="cta" href="/">Découvrir les soirées</Link></section>}</main>
}
