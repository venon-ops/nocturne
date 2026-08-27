'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase-browser';

type Claim = {
  id: string;
  artist_page_id: string;
  claimant_profile_id: string;
  claim_type: 'artist'|'representative'|'organizer';
  message: string | null;
  evidence_url: string | null;
  created_at: string;
  artistName: string;
  artistSlug: string;
  claimantName: string;
  claimantUsername: string | null;
};

export default function ArtistClaimsAdminPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [state, setState] = useState<'loading'|'forbidden'|'ready'>('loading');
  const [reviewing, setReviewing] = useState<string|null>(null);
  const [error, setError] = useState('');

  async function loadClaims() {
    const supabase = getSupabase();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setState('forbidden'); return; }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single();
    if (me?.role !== 'admin') { setState('forbidden'); return; }

    const { data: claimRows, error: claimsError } = await supabase
      .from('artist_page_claims').select('*').eq('status', 'pending').order('created_at');
    if (claimsError) throw claimsError;
    const pageIds = [...new Set((claimRows ?? []).map(row => row.artist_page_id))];
    const profileIds = [...new Set((claimRows ?? []).map(row => row.claimant_profile_id))];
    const [{ data: pages }, { data: profiles }] = await Promise.all([
      pageIds.length ? supabase.from('artist_pages').select('id, display_name, slug').in('id', pageIds) : Promise.resolve({ data: [] }),
      profileIds.length ? supabase.from('profiles').select('id, display_name, username').in('id', profileIds) : Promise.resolve({ data: [] }),
    ]);
    setClaims((claimRows ?? []).map(row => {
      const page = pages?.find(item => item.id === row.artist_page_id);
      const profile = profiles?.find(item => item.id === row.claimant_profile_id);
      return { ...row, artistName: page?.display_name ?? 'Artiste inconnu', artistSlug: page?.slug ?? '', claimantName: profile?.display_name ?? 'Utilisateur inconnu', claimantUsername: profile?.username ?? null } as Claim;
    }));
    setState('ready');
  }

  useEffect(() => { loadClaims().catch(error => { console.error(error); setError('Impossible de charger les demandes.'); setState('ready'); }); }, []);

  async function review(claimId: string, approved: boolean) {
    setReviewing(claimId); setError('');
    try {
      const { error: reviewError } = await getSupabase().rpc('review_artist_page_claim', { p_claim_id: claimId, p_approved: approved });
      if (reviewError) throw reviewError;
      setClaims(current => current.filter(claim => claim.id !== claimId));
    } catch (reviewError) { console.error(reviewError); setError('La décision n’a pas pu être enregistrée.'); }
    finally { setReviewing(null); }
  }

  if (state === 'loading') return <main className="dashboard"><LoaderCircle className="spin"/></main>;
  if (state === 'forbidden') return <main className="dashboard organizer-access"><p className="eyebrow">ACCÈS RESTREINT</p><h1>Administration uniquement.</h1><Link className="profile-back" href="/"><ArrowLeft size={16}/>Retour</Link></main>;

  return <main className="dashboard claims-admin"><nav><Link className="brand" href="/">NOCTURNE<span>°</span></Link><Link className="profile-back profile-nav-back" href="/organizer"><ArrowLeft size={16}/>Organisateur</Link></nav><header className="dash-head"><div><p className="eyebrow">MODÉRATION</p><h1>Revendications artistes.</h1><p>Une approbation donne des droits de gestion. Le badge vérifié est réservé aux demandes faites par l’artiste.</p></div></header>{error&&<p className="profile-error">{error}</p>}<section className="claims-list">{claims.length===0?<div className="claim-empty">Aucune demande en attente.</div>:claims.map(claim=><article className="claim-card" key={claim.id}><div><p className="eyebrow">{claim.claim_type==='artist'?'ARTISTE':claim.claim_type==='representative'?'REPRÉSENTANT':'ORGANISATEUR'}</p><h2>{claim.artistName}</h2><p>Demande de <strong>{claim.claimantName}</strong>{claim.claimantUsername&&` (@${claim.claimantUsername})`} · {new Date(claim.created_at).toLocaleDateString('fr-FR')}</p>{claim.message&&<blockquote>{claim.message}</blockquote>}<div className="claim-links">{claim.artistSlug&&<Link href={`/artists/${claim.artistSlug}`}><ExternalLink size={14}/>Voir la page</Link>}{claim.evidence_url&&<a href={claim.evidence_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Justificatif</a>}</div></div><div className="claim-actions"><button className="claim-reject" disabled={reviewing===claim.id} onClick={()=>review(claim.id,false)}><X size={17}/>Refuser</button><button className="claim-approve" disabled={reviewing===claim.id} onClick={()=>review(claim.id,true)}>{reviewing===claim.id?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>}Approuver</button></div></article>)}</section></main>;
}
