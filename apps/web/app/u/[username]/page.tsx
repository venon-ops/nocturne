'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LoaderCircle, MapPin, Pencil, UserCheck, UserPlus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase-browser';

type PublicProfile = {
  id: string;
  display_name: string;
  username: string;
  city: string | null;
  bio: string | null;
  avatar_path: string | null;
  role: string;
};

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState('');

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = getSupabase();
        const [{ data, error }, { data: authData }] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, display_name, username, city, bio, avatar_path, role')
            .eq('username', username)
            .maybeSingle(),
          supabase.auth.getUser(),
        ]);

        if (error) throw error;
        if (!data) {
          setNotFound(true);
          return;
        }

        setProfile(data);
        setIsOwner(authData.user?.id === data.id);

        if (data.role === 'artist_verified') {
          const [{ count, error: countError }, followResult] = await Promise.all([
            supabase
              .from('artist_follows')
              .select('*', { count: 'exact', head: true })
              .eq('artist_id', data.id),
            authData.user
              ? supabase
                  .from('artist_follows')
                  .select('artist_id')
                  .eq('artist_id', data.id)
                  .eq('follower_id', authData.user.id)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
          ]);

          if (countError) throw countError;
          if (followResult.error) throw followResult.error;
          setFollowersCount(count ?? 0);
          setIsFollowing(Boolean(followResult.data));
        }
      } catch (error) {
        console.error('Impossible de charger le profil public :', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [username]);

  async function toggleFollow() {
    if (!profile || isOwner || profile.role !== 'artist_verified') return;

    setFollowLoading(true);
    setFollowError('');

    try {
      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        window.location.assign('/auth');
        return;
      }

      if (isFollowing) {
        const { error } = await supabase
          .from('artist_follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('artist_id', profile.id);
        if (error) throw error;
        setIsFollowing(false);
        setFollowersCount((count) => Math.max(0, count - 1));
      } else {
        const { error } = await supabase
          .from('artist_follows')
          .insert({ follower_id: user.id, artist_id: profile.id });
        if (error) throw error;
        setIsFollowing(true);
        setFollowersCount((count) => count + 1);
      }
    } catch (error) {
      console.error('Impossible de modifier le suivi :', error);
      setFollowError('Impossible de mettre à jour le suivi pour le moment.');
    } finally {
      setFollowLoading(false);
    }
  }

  const avatarUrl = profile?.avatar_path
    ? getSupabase().storage.from('avatars').getPublicUrl(profile.avatar_path).data
        .publicUrl
    : null;
  const initial = profile?.display_name.trim().charAt(0).toUpperCase() || '?';

  if (loading) {
    return (
      <main className="profile-page">
        <nav className="profile-nav">
          <Link className="brand" href="/">NOCTURNE<span>°</span></Link>
        </nav>
        <section className="profile-loading">Chargement du profil...</section>
      </main>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="profile-page">
        <nav className="profile-nav">
          <Link className="brand" href="/">NOCTURNE<span>°</span></Link>
        </nav>
        <section className="profile-error">
          <p className="eyebrow">PROFIL INTROUVABLE</p>
          <h1>Cette nuit reste mystérieuse.</h1>
          <p>Le profil @{username} n’existe pas ou n’est plus disponible.</p>
          <Link className="cta" href="/"><ArrowLeft size={18} />Retour aux soirées</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <nav className="profile-nav">
        <Link className="brand" href="/">NOCTURNE<span>°</span></Link>
        <Link className="profile-back profile-nav-back" href="/">
          <ArrowLeft size={16} />Retour
        </Link>
      </nav>

      <section className="profile-content">
        <header className="profile-header">
          <div className="profile-avatar">
            {avatarUrl ? <img src={avatarUrl} alt={`Photo de ${profile.display_name}`} /> : <span>{initial}</span>}
          </div>
          <div className="profile-heading">
            <p className="eyebrow">PROFIL NOCTURNE</p>
            <h1>{profile.display_name}</h1>
            <p className="profile-username">@{profile.username}</p>
            {profile.city && <p className="profile-city"><MapPin size={15} />{profile.city}</p>}
          </div>
          {isOwner ? (
            <Link className="profile-edit" href="/profile">
              <Pencil size={16} />Modifier mon profil
            </Link>
          ) : profile.role === 'artist_verified' ? (
            <button
              className={`profile-follow${isFollowing ? ' is-following' : ''}`}
              type="button"
              onClick={toggleFollow}
              disabled={followLoading}
            >
              {followLoading ? <LoaderCircle className="spin" size={17} /> : isFollowing ? <UserCheck size={17} /> : <UserPlus size={17} />}
              {isFollowing ? 'Suivi' : 'Suivre'}
            </button>
          ) : null}
        </header>

        {followError && <p className="profile-follow-error">{followError}</p>}

        <div className="profile-divider" />

        <div className="profile-body">
          <section className="profile-block">
            <p className="eyebrow">À PROPOS</p>
            {profile.bio ? <p className="profile-bio">{profile.bio}</p> : <p className="profile-empty">Aucune bio pour le moment.</p>}
          </section>
          {profile.role === 'artist_verified' && (
            <aside className="profile-stats" aria-label="Statistiques du profil">
              <div><strong>{followersCount}</strong><span>abonné{followersCount > 1 ? 's' : ''}</span></div>
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}
