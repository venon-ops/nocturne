'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, ExternalLink, Plus, Save, X } from 'lucide-react';
import { getSupabase } from '../../lib/supabase-browser';
import { MUSIC_GENRES } from '../../lib/music-genres';

type Profile = {
  display_name: string;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  preferred_genres: string[];
};

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    display_name: '',
    username: '',
    bio: '',
    avatar_path: null,
    preferred_genres: [],
  });

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [genreDraft, setGenreDraft] = useState('');

  function publicAvatarUrl(path: string, cacheBust?: string) {
    const { data } = getSupabase().storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return cacheBust ? `${data.publicUrl}?v=${cacheBust}` : data.publicUrl;
  }

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = getSupabase();

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          setError('Vous devez être connecté pour accéder à votre profil.');
          setLoading(false);
          return;
        }

        setEmail(user.email ?? '');

        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, username, bio, avatar_path, preferred_genres')
          .eq('id', user.id)
          .single();

        if (profileError) {
  console.error(
    'ERREUR CHARGEMENT PROFIL :',
    JSON.stringify(
      {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
        userId: user.id,
      },
      null,
      2
    )
  );

  throw profileError;
}

        setProfile({
          display_name: data.display_name ?? '',
          username: data.username ?? '',
          bio: data.bio ?? '',
          avatar_path: data.avatar_path ?? null,
          preferred_genres: data.preferred_genres ?? [],
        });
        setSavedUsername(data.username ?? null);
        if (data.avatar_path) {
          setAvatarUrl(publicAvatarUrl(data.avatar_path));
        }
      } catch (err) {
        console.error(err);
        setError('Impossible de charger votre profil.');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  useEffect(() => {
    return () => {
      if (avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarUrl);
    };
  }, [avatarUrl]);

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setMessage('');
    setError('');

    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError('Format non accepté. Utilisez une image JPG, PNG ou WebP.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError("L'image dépasse la taille maximale de 5 Mo.");
      event.target.value = '';
      return;
    }

    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const supabase = getSupabase();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Utilisateur non connecté.');
      }

      const username = profile.username?.trim() || null;
      const bio = profile.bio?.trim() || null;
      const displayName = profile.display_name.trim();
      let avatarPath = profile.avatar_path;

      if (!displayName) {
        setError("Le nom d'affichage est obligatoire.");
        setSaving(false);
        return;
      }

      if (avatarFile) {
        avatarPath = `${user.id}/avatar`;
        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(avatarPath, avatarFile, {
            cacheControl: '3600',
            contentType: avatarFile.type,
            upsert: true,
          });

        if (uploadError) throw uploadError;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          username,
          bio,
          avatar_path: avatarPath,
          preferred_genres: profile.preferred_genres,
        })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      setProfile({
        display_name: displayName,
        username,
        bio,
        avatar_path: avatarPath,
        preferred_genres: profile.preferred_genres,
      });

      if (avatarPath) {
        setAvatarUrl(publicAvatarUrl(avatarPath, String(Date.now())));
      }
      setAvatarFile(null);
      setSavedUsername(username);

      setMessage('Profil enregistré.');
    } catch (err) {
      console.error(err);

      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('profiles_username_unique')
      ) {
        setError('Ce nom utilisateur est déjà utilisé.');
      } else {
        setError("Impossible d'enregistrer votre profil.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="profile-page">
        <nav>
          <Link className="brand" href="/">
            NOCTURNE<span>°</span>
          </Link>

          <Link className="account" href="/">
            Retour
          </Link>
        </nav>

        <section className="profile-content">
          <p className="eyebrow">VOTRE ESPACE NOCTURNE</p>
          <h1>Chargement...</h1>
        </section>
      </main>
    );
  }

  if (error && !profile.display_name) {
    return (
      <main className="profile-page">
        <nav>
          <Link className="brand" href="/">
            NOCTURNE<span>°</span>
          </Link>

          <Link className="account" href="/">
            Retour
          </Link>
        </nav>

        <section className="profile-content">
          <p className="eyebrow">VOTRE ESPACE NOCTURNE</p>
          <h1>Mon profil.</h1>
          <p className="profile-error">{error}</p>

          <Link className="cta" href="/">
            <ArrowLeft size={18} />
            Retour aux soirées
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <nav>
        <Link className="brand" href="/">
          NOCTURNE<span>°</span>
        </Link>

        <Link className="account" href="/">
          Retour
        </Link>
      </nav>

      <section className="profile-content">
        <p className="eyebrow">VOTRE ESPACE NOCTURNE</p>

        <h1>Mon profil.</h1>

        <p className="profile-intro">
          Personnalisez votre identité Nocturne et votre profil communautaire.
        </p>

        <div className="profile-public-access">
          {savedUsername ? (
            <Link className="profile-public-link" href={`/u/${encodeURIComponent(savedUsername)}`}>
              <ExternalLink size={16} />
              Voir mon profil public
            </Link>
          ) : (
            <p className="profile-public-help">
              Renseignez puis enregistrez un nom utilisateur pour créer votre profil public.
            </p>
          )}
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-avatar-editor">
            <div className="profile-avatar profile-avatar-preview">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Photo de profil" />
              ) : (
                <span>{profile.display_name.trim().charAt(0).toUpperCase() || '?'}</span>
              )}
            </div>
            <div className="profile-avatar-actions">
              <label className="profile-avatar-button" htmlFor="avatar">
                <Camera size={18} />
                {avatarFile ? 'Changer la sélection' : 'Choisir une photo'}
              </label>
              <input
                id="avatar"
                className="profile-avatar-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                disabled={saving}
              />
              <small>JPG, PNG ou WebP, 5 Mo maximum.</small>
            </div>
          </div>

          <div className="profile-field">
            <label htmlFor="email">Adresse e-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              disabled
            />
            <small>
              L'adresse e-mail est liée à votre compte et ne peut pas être
              modifiée ici.
            </small>
          </div>

          <div className="profile-field">
            <label htmlFor="display_name">Nom d'affichage</label>
            <input
              id="display_name"
              type="text"
              value={profile.display_name}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  display_name: event.target.value,
                })
              }
              maxLength={100}
              required
            />
          </div>

          <div className="profile-field">
            <label htmlFor="username">Nom utilisateur</label>
            <input
              id="username"
              type="text"
              value={profile.username ?? ''}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  username: event.target.value,
                })
              }
              placeholder="exemple"
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_]{3,30}"
            />
            <small>
              3 à 30 caractères : lettres, chiffres et underscore uniquement.
            </small>
            {savedUsername && (
              <small className="profile-public-preview">
                Adresse publique : /u/{savedUsername}
              </small>
            )}
          </div>

          <div className="profile-field">
            <label htmlFor="preferred-genre">Styles musicaux favoris</label>
            <div className="profile-genre-add">
              <input id="preferred-genre" list="preferred-genres" value={genreDraft} onChange={event=>setGenreDraft(event.target.value)} placeholder="Rechercher un style" />
              <datalist id="preferred-genres">{MUSIC_GENRES.map(item=><option value={item} key={item}/>)}</datalist>
              <button type="button" disabled={!genreDraft.trim()||profile.preferred_genres.length>=20} onClick={()=>{const match=MUSIC_GENRES.find(item=>item.toLocaleLowerCase('fr')===genreDraft.trim().toLocaleLowerCase('fr'));if(match&&!profile.preferred_genres.includes(match)){setProfile({...profile,preferred_genres:[...profile.preferred_genres,match]});setGenreDraft('')}}}><Plus size={17}/>Ajouter</button>
            </div>
            <div className="profile-genre-list">{profile.preferred_genres.map(item=><span key={item}>{item}<button type="button" aria-label={`Retirer ${item}`} onClick={()=>setProfile({...profile,preferred_genres:profile.preferred_genres.filter(value=>value!==item)})}><X size={13}/></button></span>)}</div>
            <small>Ces styles servent à personnaliser l’ordre des prochaines soirées. 20 maximum.</small>
          </div>

          <div className="profile-field">
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              value={profile.bio ?? ''}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  bio: event.target.value,
                })
              }
              placeholder="Parlez un peu de vous..."
              maxLength={300}
              rows={5}
            />
            <small>{(profile.bio ?? '').length}/300</small>
          </div>

          {message && <p className="profile-success">{message}</p>}

          {error && <p className="profile-error">{error}</p>}

          <button
            className="cta profile-save"
            type="submit"
            disabled={saving}
          >
            <Save size={18} />
            {saving ? 'Enregistrement...' : 'Enregistrer mon profil'}
          </button>
        </form>

        <Link className="profile-back" href="/">
          <ArrowLeft size={16} />
          Retour aux soirées
        </Link>
      </section>
    </main>
  );
}
