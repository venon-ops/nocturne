'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, CalendarDays, MapPin } from 'lucide-react';
import { useParams } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase-browser';

type ArtistPage = {
  id: string;
  slug: string;
  display_name: string;
  bio: string | null;
  avatar_path: string | null;
  status: 'auto_created' | 'claim_pending' | 'claimed' | 'verified' | 'rejected';
  signal_event_count: number;
  signal_organizer_count: number;
};

type ArtistEvent = { id: string; slug: string; title: string; city: string; starts_at: string };

export default function ArtistPageRoute() {
  const { slug } = useParams<{ slug: string }>();
  const [artist, setArtist] = useState<ArtistPage | null>(null);
  const [events, setEvents] = useState<ArtistEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabase();
        const { data: artistData, error } = await supabase
          .from('artist_pages').select('*').eq('slug', slug).maybeSingle();
        if (error) throw error;
        if (!artistData) return;
        setArtist(artistData);

        const { data: mentions } = await supabase
          .from('artist_name_mentions').select('event_id').eq('artist_page_id', artistData.id);
        const eventIds = [...new Set((mentions ?? []).map((mention) => mention.event_id))];
        if (eventIds.length) {
          const { data: eventData } = await supabase
            .from('events')
            .select('id, slug, title, city, starts_at')
            .in('id', eventIds).eq('status', 'published').order('starts_at');
          setEvents(eventData ?? []);
        }
      } catch (error) {
        console.error('Impossible de charger la page artiste :', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) return <main className="profile-page"><section className="profile-loading">Chargement...</section></main>;
  if (!artist) return <main className="profile-page"><section className="profile-error"><p className="eyebrow">ARTISTE INTROUVABLE</p><h1>Cette page n’existe pas.</h1><Link className="cta" href="/"><ArrowLeft size={18}/>Retour</Link></section></main>;

  const avatarUrl = artist.avatar_path
    ? getSupabase().storage.from('avatars').getPublicUrl(artist.avatar_path).data.publicUrl
    : null;

  return <main className="profile-page">
    <nav className="profile-nav"><Link className="brand" href="/">NOCTURNE<span>°</span></Link><Link className="profile-back profile-nav-back" href="/"><ArrowLeft size={16}/>Retour</Link></nav>
    <section className="profile-content">
      <header className="profile-header">
        <div className="profile-avatar">{avatarUrl?<img src={avatarUrl} alt={`Photo de ${artist.display_name}`}/>:<span>{artist.display_name.charAt(0).toUpperCase()}</span>}</div>
        <div className="profile-heading"><p className="eyebrow">PAGE ARTISTE</p><h1>{artist.display_name} {artist.status==='verified'&&<BadgeCheck className="artist-verified-icon" size={25}/>}</h1><p className="profile-username">{artist.status==='verified'?'Identité vérifiée':'Page issue des programmations NOCTURNE'}</p></div>
        {artist.status!=='verified'&&<Link className="profile-edit" href={`/artists/claim?name=${encodeURIComponent(artist.display_name)}`}>Revendiquer cette page</Link>}
      </header>
      <div className="profile-divider"/>
      <div className="profile-body"><section className="profile-block"><p className="eyebrow">À PROPOS</p>{artist.bio?<p className="profile-bio">{artist.bio}</p>:<p className="profile-empty">Cette page attend encore d’être complétée.</p>}
        <div className="artist-events"><p className="eyebrow">PROCHAINES DATES</p>{events.length?events.map(event=><Link className="artist-event-row" href={`/events/${event.slug}`} key={event.id}><CalendarDays size={17}/><span><strong>{event.title}</strong><small><MapPin size={13}/>{event.city} · {new Date(event.starts_at).toLocaleDateString('fr-FR')}</small></span></Link>):<p className="profile-empty">Aucune date publiée actuellement.</p>}</div>
      </section><aside className="profile-stats"><div><strong>{artist.signal_event_count}</strong><span>programmation{artist.signal_event_count>1?'s':''}</span></div><div><strong>{artist.signal_organizer_count}</strong><span>organisateur{artist.signal_organizer_count>1?'s':''}</span></div></aside></div>
    </section>
  </main>;
}
