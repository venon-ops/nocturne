"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarHeart,
  Camera,
  ExternalLink,
  LogOut,
  Plus,
  Save,
  Settings,
  UserPlus,
  X,
} from "lucide-react";
import WebThemeSelector from "../components/WebThemeSelector";
import { getSupabase } from "../../lib/supabase-browser";
import { MUSIC_GENRES } from "../../lib/music-genres";

type Profile = {
  display_name: string;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  preferred_genres: string[];
  social_links: Record<string, string>;
};

type ProfileEvent = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  city: string;
  cover_path: string | null;
};

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const formatPartyTime = (minutes: number) =>
  `${Math.floor(minutes / 43200)} mois ${Math.floor((minutes % 43200) / 1440)} j ${Math.floor((minutes % 1440) / 60)} h`;

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    display_name: "",
    username: "",
    bio: "",
    avatar_path: null,
    preferred_genres: [],
    social_links: {},
  });

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [genreDraft, setGenreDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<ProfileEvent[]>([]);
  const [memories, setMemories] = useState<ProfileEvent[]>([]);
  const [stats, setStats] = useState({ events: 0, venues: 0, tickets: 0 });
  const [socialStats, setSocialStats] = useState({
    followers: 0,
    following: 0,
    friends: 0,
    partyMinutes: 0,
  });

  function publicAvatarUrl(path: string, cacheBust?: string) {
    const { data } = getSupabase()
      .storage.from(AVATAR_BUCKET)
      .getPublicUrl(path);
    return cacheBust ? `${data.publicUrl}?v=${cacheBust}` : data.publicUrl;
  }

  function eventCoverUrl(path: string | null) {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return getSupabase().storage.from("event-media").getPublicUrl(path).data
      .publicUrl;
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
          setError("Vous devez être connecté pour accéder à votre profil.");
          setLoading(false);
          return;
        }

        setEmail(user.email ?? "");

        let profileResult = await supabase
          .from("profiles")
          .select(
            "display_name, username, bio, avatar_path, preferred_genres, social_links",
          )
          .eq("id", user.id)
          .single();

        if (profileResult.error) {
          const fallback = await supabase
            .from("profiles")
            .select("display_name, username, bio, avatar_path, preferred_genres")
            .eq("id", user.id)
            .single();
          profileResult = fallback as typeof profileResult;
        }
        const data = profileResult.data as
          | (Omit<Profile, "social_links"> & {
              social_links?: Record<string, string>;
            })
          | null;
        const profileError = profileResult.error;

        if (profileError) {
          console.error(
            "ERREUR CHARGEMENT PROFIL :",
            JSON.stringify(
              {
                code: profileError.code,
                message: profileError.message,
                details: profileError.details,
                hint: profileError.hint,
                userId: user.id,
              },
              null,
              2,
            ),
          );

          throw profileError;
        }

        if (!data) {
          throw new Error("Profil introuvable.");
        }

        setProfile({
          display_name: data.display_name ?? "",
          username: data.username ?? "",
          bio: data.bio ?? "",
          avatar_path: data.avatar_path ?? null,
          preferred_genres: data.preferred_genres ?? [],
          social_links: (data.social_links ?? {}) as Record<string, string>,
        });
        setSavedUsername(data.username ?? null);
        const [
          { data: ownedTickets },
          { data: interests },
          { count: followers },
          { count: following },
          { count: friends },
        ] = await Promise.all([
          supabase
            .from("tickets")
            .select(
              "id,status,events(id,slug,title,city,starts_at,ends_at,cover_path),orders!inner(buyer_id)",
            )
            .eq("orders.buyer_id", user.id),
          supabase
            .from("event_interests")
            .select("events(id,slug,title,starts_at,ends_at,city,cover_path)")
            .eq("user_id", user.id),
          supabase
            .from("artist_follows")
            .select("*", { count: "exact", head: true })
            .eq("artist_id", user.id),
          supabase
            .from("artist_follows")
            .select("*", { count: "exact", head: true })
            .eq("follower_id", user.id),
          supabase
            .from("user_friendships")
            .select("*", { count: "exact", head: true })
            .eq("status", "accepted")
            .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
        ]);
        const ticketRows = (ownedTickets ?? []) as unknown as Array<{
          id: string;
          status: string;
          events: ProfileEvent | null;
        }>;
        setStats({
          tickets: ticketRows.length,
          events: new Set(
            ticketRows.map((row) => row.events?.id).filter(Boolean),
          ).size,
          venues: new Set(
            ticketRows.map((row) => row.events?.city).filter(Boolean),
          ).size,
        });
        const completed = [
          ...new Map(
            ticketRows
              .filter(
                (row) =>
                  row.events &&
                  (row.status === "used" ||
                    new Date(row.events.ends_at ?? row.events.starts_at) <
                      new Date()),
              )
              .map((row) => [row.events!.id, row.events!]),
          ).values(),
        ];
        setMemories(
          completed.sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
        );
        setSocialStats({
          followers: followers ?? 0,
          following: following ?? 0,
          friends: friends ?? 0,
          partyMinutes: Math.round(
            completed.reduce(
              (sum, event) =>
                sum +
                Math.max(
                  0,
                  (new Date(event.ends_at ?? event.starts_at).getTime() -
                    new Date(event.starts_at).getTime()) /
                    60000,
                ),
              0,
            ),
          ),
        });
        const now = new Date();
        setInterestedEvents(
          (
            (interests ?? []) as unknown as Array<{
              events: ProfileEvent | null;
            }>
          )
            .map((row) => row.events)
            .filter(
              (item): item is ProfileEvent =>
                Boolean(item && new Date(item.starts_at) > now),
            )
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
        );
        if (data.avatar_path) {
          setAvatarUrl(publicAvatarUrl(data.avatar_path));
        }
      } catch (err) {
        console.error(err);
        setError("Impossible de charger votre profil.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  useEffect(() => {
    return () => {
      if (avatarUrl?.startsWith("blob:")) URL.revokeObjectURL(avatarUrl);
    };
  }, [avatarUrl]);

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setMessage("");
    setError("");

    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError("Format non accepté. Utilisez une image JPG, PNG ou WebP.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError("L'image dépasse la taille maximale de 5 Mo.");
      event.target.value = "";
      return;
    }

    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const supabase = getSupabase();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Utilisateur non connecté.");
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
            cacheControl: "3600",
            contentType: avatarFile.type,
            upsert: true,
          });

        if (uploadError) throw uploadError;
      }

      let { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          username,
          bio,
          avatar_path: avatarPath,
          preferred_genres: profile.preferred_genres,
          social_links: profile.social_links,
        })
        .eq("id", user.id);

      // Keep the existing profile usable until the social-links migration has
      // been deployed on every environment.
      if (
        updateError?.message.toLowerCase().includes("social_links") ||
        updateError?.details?.toLowerCase().includes("social_links")
      ) {
        const fallbackUpdate = await supabase
          .from("profiles")
          .update({
            display_name: displayName,
            username,
            bio,
            avatar_path: avatarPath,
            preferred_genres: profile.preferred_genres,
          })
          .eq("id", user.id);
        updateError = fallbackUpdate.error;
      }

      if (updateError) {
        throw updateError;
      }

      setProfile({
        display_name: displayName,
        username,
        bio,
        avatar_path: avatarPath,
        preferred_genres: profile.preferred_genres,
        social_links: profile.social_links,
      });

      if (avatarPath) {
        setAvatarUrl(publicAvatarUrl(avatarPath, String(Date.now())));
      }
      setAvatarFile(null);
      setSavedUsername(username);

      setMessage("Profil enregistré.");
      setEditing(false);
    } catch (err) {
      console.error(err);

      if (
        err instanceof Error &&
        err.message.toLowerCase().includes("profiles_username_unique")
      ) {
        setError("Ce nom utilisateur est déjà utilisé.");
      } else {
        setError("Impossible d'enregistrer votre profil.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await getSupabase().auth.signOut();
    window.location.assign("/");
  }

  if (loading) {
    return (
      <main className="profile-page">
        <nav className="profile-main-nav">
          <Link className="profile-mobile-back" href="/" aria-label="Retour">
            <ArrowLeft size={20} />
          </Link>
          <Link className="brand" href="/">
            NOCTURNE<span>°</span>
          </Link>
          <button
            className="account profile-settings-link"
            type="button"
            aria-label="Paramètres du profil"
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <Settings size={18} />
            <span>Paramètres</span>
          </button>
        </nav>
        {settingsOpen && (
          <section className="profile-content profile-loading-settings">
            <WebThemeSelector />
          </section>
        )}
      </main>
    );
  }

  if (error && !profile.display_name) {
    return (
      <main className="profile-page">
        <nav className="profile-main-nav">
          <Link className="profile-mobile-back" href="/" aria-label="Retour">
            <ArrowLeft size={20} />
          </Link>
          <Link className="brand" href="/">
            NOCTURNE<span>°</span>
          </Link>
          <button
            className="account profile-settings-link"
            type="button"
            aria-label="Paramètres du profil"
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <Settings size={18} />
            <span>Paramètres</span>
          </button>
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
      <nav className="profile-main-nav">
        <Link className="profile-mobile-back" href="/" aria-label="Retour">
          <ArrowLeft size={20} />
        </Link>
        <Link className="brand" href="/">
          NOCTURNE<span>°</span>
        </Link>

        <button
          className="account profile-settings-link"
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          aria-label="Paramètres du profil"
        >
          <Settings size={18} />
          <span>Paramètres</span>
        </button>
      </nav>

      <section className="profile-content">
        <header className="profile-overview">
          <div className="profile-overview-identity">
            <div className="profile-avatar profile-avatar-preview">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Photo de profil" />
              ) : (
                <span>
                  {profile.display_name.trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
            </div>
            <div>
              <h1>{profile.display_name || "Mon profil"}</h1>
              <p className="profile-username">
                {profile.username ? `@${profile.username}` : "Profil NOCTURNE"}
              </p>
              {profile.bio && <p className="profile-bio">{profile.bio}</p>}
            </div>
          </div>
          <div className="profile-overview-genres">
            {profile.preferred_genres.slice(0, 3).map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <div className="profile-overview-counts">
            <div>
              <strong>{socialStats.followers}</strong>
              <span>abonnés</span>
            </div>
            <div>
              <strong>{socialStats.following}</strong>
              <span>abonnements</span>
            </div>
            <div>
              <strong>{stats.events}</strong>
              <span>soirées faites</span>
            </div>
          </div>
          <div className="profile-overview-actions">
            <button
              className="cta"
              type="button"
              onClick={() => setEditing((value) => !value)}
            >
              Modifier le profil
            </button>
            <Link className="account" href="/friends">
              <UserPlus size={17} />
              Ajouter des amis
            </Link>
          </div>
        </header>
        {settingsOpen && <WebThemeSelector />}
        <section className="profile-interests">
          <div className="section-head">
            <div>
              <h2>Ça m’intéresse</h2>
            </div>
          </div>
          {interestedEvents.length ? (
            <div>
              {interestedEvents.map((item) => {
                const cover = eventCoverUrl(item.cover_path);
                return (
                <Link
                  className="profile-event-card"
                  href={`/events/${item.slug}`}
                  key={item.id}
                >
                  {cover ? (
                    <img src={cover} alt="" />
                  ) : (
                    <span className="profile-event-cover-fallback">
                      <CalendarHeart />
                    </span>
                  )}
                  <span className="profile-event-copy">
                    <strong>{item.title}</strong>
                    <small>
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.starts_at))}{" "}
                      · {item.city}
                    </small>
                  </span>
                </Link>
                );
              })}
            </div>
          ) : (
            <p className="profile-empty">
              Les soirées marquées « Ça m’intéresse » apparaîtront ici.
            </p>
          )}
        </section>

        <section className="profile-albums">
          <div className="section-head">
            <div>
              <h2>Albums</h2>
            </div>
          </div>
          <div>
            <article>
              <strong>{stats.events}</strong>
              <h3>Artistes vus</h3>
            </article>
            <article>
              <strong>{stats.venues}</strong>
              <h3>Lieux visités</h3>
            </article>
          </div>
        </section>
        <section className="profile-party-stats">
          <article>
            <strong>{socialStats.friends}</strong>
            <span>amis</span>
          </article>
          <article>
            <strong>{stats.events}</strong>
            <span>souvenirs</span>
          </article>
          <article>
            <strong>{formatPartyTime(socialStats.partyMinutes)}</strong>
            <span>Party Time</span>
          </article>
        </section>
        <section className="profile-memories">
          <div className="section-head">
            <div>
              <h2>Souvenirs</h2>
            </div>
          </div>
          {memories.length ? (
            <div className="profile-memory-track">
              {memories.map((item) => {
                const cover = eventCoverUrl(item.cover_path);
                return (
                  <Link
                    className="profile-memory-card"
                    href={`/events/${item.slug}`}
                    key={item.id}
                  >
                    {cover ? (
                      <img src={cover} alt="" />
                    ) : (
                      <span className="profile-event-cover-fallback" />
                    )}
                    <strong>{item.title}</strong>
                    <small>
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "medium",
                      }).format(new Date(item.starts_at))}
                    </small>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="profile-empty">
              Tes anciennes soirées deviendront tes souvenirs.
            </p>
          )}
        </section>

        <div className="profile-public-access">
          {savedUsername ? (
            <Link
              className="profile-public-link"
              href={`/u/${encodeURIComponent(savedUsername)}`}
            >
              <ExternalLink size={16} />
              Voir mon profil public
            </Link>
          ) : (
            <p className="profile-public-help">
              Renseignez puis enregistrez un nom utilisateur pour créer votre
              profil public.
            </p>
          )}
        </div>

        <form
          id="profile-settings"
          className={`profile-form ${editing ? "profile-form-open" : "profile-form-collapsed"}`}
          onSubmit={handleSubmit}
        >
          <div className="profile-avatar-editor">
            <div className="profile-avatar profile-avatar-preview">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Photo de profil" />
              ) : (
                <span>
                  {profile.display_name.trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
            </div>
            <div className="profile-avatar-actions">
              <label className="profile-avatar-button" htmlFor="avatar">
                <Camera size={18} />
                {avatarFile ? "Changer la sélection" : "Choisir une photo"}
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
            <input id="email" type="email" value={email} disabled />
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
              value={profile.username ?? ""}
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
              <input
                id="preferred-genre"
                list="preferred-genres"
                value={genreDraft}
                onChange={(event) => setGenreDraft(event.target.value)}
                placeholder="Rechercher un style"
              />
              <datalist id="preferred-genres">
                {MUSIC_GENRES.map((item) => (
                  <option value={item} key={item} />
                ))}
              </datalist>
              <button
                type="button"
                disabled={
                  !genreDraft.trim() || profile.preferred_genres.length >= 20
                }
                onClick={() => {
                  const match = MUSIC_GENRES.find(
                    (item) =>
                      item.toLocaleLowerCase("fr") ===
                      genreDraft.trim().toLocaleLowerCase("fr"),
                  );
                  if (match && !profile.preferred_genres.includes(match)) {
                    setProfile({
                      ...profile,
                      preferred_genres: [...profile.preferred_genres, match],
                    });
                    setGenreDraft("");
                  }
                }}
              >
                <Plus size={17} />
                Ajouter
              </button>
            </div>
            <div className="profile-genre-list">
              {profile.preferred_genres.map((item) => (
                <span key={item}>
                  {item}
                  <button
                    type="button"
                    aria-label={`Retirer ${item}`}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        preferred_genres: profile.preferred_genres.filter(
                          (value) => value !== item,
                        ),
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
            <small>
              Ces styles servent à personnaliser l’ordre des prochaines soirées.
              20 maximum.
            </small>
          </div>

          <div className="profile-field">
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              value={profile.bio ?? ""}
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
            <small>{(profile.bio ?? "").length}/300</small>
          </div>
          <div className="profile-social-grid">
            {["instagram", "tiktok", "soundcloud", "deezer"].map((network) => (
              <div className="profile-field" key={network}>
                <label htmlFor={`social-${network}`}>
                  {network[0].toUpperCase() + network.slice(1)}
                </label>
                <input
                  id={`social-${network}`}
                  type="url"
                  value={profile.social_links[network] ?? ""}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      social_links: {
                        ...profile.social_links,
                        [network]: event.target.value,
                      },
                    })
                  }
                  placeholder={`Lien ${network}`}
                />
              </div>
            ))}
          </div>

          {message && <p className="profile-success">{message}</p>}

          {error && <p className="profile-error">{error}</p>}

          <button className="cta profile-save" type="submit" disabled={saving}>
            <Save size={18} />
            {saving ? "Enregistrement..." : "Enregistrer mon profil"}
          </button>
        </form>
        <button
          className="profile-back profile-logout"
          type="button"
          onClick={handleLogout}
        >
          <LogOut size={16} />
          Se déconnecter
        </button>
      </section>
    </main>
  );
}
