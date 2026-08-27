'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase-browser';

export default function ClaimArtistPage() {
  const [name, setName] = useState('');
  const [claimType, setClaimType] = useState<'artist'|'representative'|'organizer'>('artist');
  const [message, setMessage] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setName(new URLSearchParams(location.search).get('name') ?? ''); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(''); setFeedback('');
    try {
      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { location.assign('/auth'); return; }
      const { error: claimError } = await supabase.rpc('request_artist_page_claim', {
        p_artist_name: name.trim(), p_claim_type: claimType,
        p_message: message.trim() || null, p_evidence_url: evidenceUrl.trim() || null,
      });
      if (claimError) throw claimError;
      setFeedback('Votre demande a été enregistrée. Elle doit maintenant être vérifiée.');
    } catch (claimError) {
      console.error(claimError);
      setError('Impossible d’envoyer la demande. Vérifiez qu’une demande identique n’est pas déjà en attente.');
    } finally { setLoading(false); }
  }

  return <main className="profile-page"><nav className="profile-nav"><Link className="brand" href="/">NOCTURNE<span>°</span></Link><Link className="profile-back profile-nav-back" href="/"><ArrowLeft size={16}/>Retour</Link></nav><section className="profile-content claim-content"><p className="eyebrow">IDENTITÉ ARTISTE</p><h1>Revendiquer une page.</h1><p className="profile-intro">La demande sera examinée avant de donner accès à la page ou d’attribuer un badge vérifié.</p><form className="profile-form" onSubmit={submit}><div className="profile-field"><label htmlFor="artist-name">Nom d’artiste</label><input id="artist-name" required minLength={2} maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></div><div className="profile-field"><label htmlFor="claim-type">Vous êtes</label><select id="claim-type" value={claimType} onChange={event=>setClaimType(event.target.value as typeof claimType)}><option value="artist">L’artiste</option><option value="representative">Son représentant</option><option value="organizer">Un organisateur qui programme cet artiste</option></select></div><div className="profile-field"><label htmlFor="evidence">Lien justificatif</label><input id="evidence" type="url" maxLength={500} placeholder="Site officiel, réseau social, agence…" value={evidenceUrl} onChange={event=>setEvidenceUrl(event.target.value)}/></div><div className="profile-field"><label htmlFor="claim-message">Informations complémentaires</label><textarea id="claim-message" maxLength={2000} rows={6} value={message} onChange={event=>setMessage(event.target.value)} placeholder="Expliquez votre lien avec cet artiste."/></div>{feedback&&<p className="profile-success">{feedback}</p>}{error&&<p className="profile-error">{error}</p>}<button className="cta profile-save" disabled={loading}><Send size={17}/>{loading?'Envoi...':'Envoyer la demande'}</button></form></section></main>;
}
