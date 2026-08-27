'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { getSupabase } from '../../lib/supabase-browser';
import Link from 'next/link';

type UserState = {
  email: string | null;
  name: string | null;
};

export default function AccountLink() {
  const router = useRouter();

  const [user, setUser] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUser({
          email: user.email ?? null,
          name:
            user.user_metadata?.full_name ??
            user.email?.split('@')[0] ??
            'Mon compte',
        });
      } else {
        setUser(null);
      }

      setLoading(false);
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user;

      if (currentUser) {
        setUser({
          email: currentUser.email ?? null,
          name:
            currentUser.user_metadata?.full_name ??
            currentUser.email?.split('@')[0] ??
            'Mon compte',
        });
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    setOpen(false);

    const supabase = getSupabase();

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Erreur lors de la déconnexion :', error.message);
      return;
    }

    setUser(null);

    router.refresh();
    router.push('/');
  }

  if (loading) {
    return <span className="account">...</span>;
  }

  if (!user) {
    return (
      <a className="account" href="/auth">
        Se connecter
      </a>
    );
  }

  return (
    <div className="account-menu">
      <button
        className="account account-button"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span>{user.name}</span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="account-dropdown">
          <div className="account-info">
            <strong>{user.name}</strong>
            {user.email && <small>{user.email}</small>}
          </div>

          <div className="account-divider" />

            <Link
            className="account-profile-link"
            href="/profile"
            onClick={() => setOpen(false)}
>
                <User size={16} />
        Mon profil
            </Link>

        <button
        className="logout-button"
        type="button"
        onClick={handleLogout}
>
            <LogOut size={16} />
         Se déconnecter
            </button>
        </div>
      )}
    </div>
  );
}