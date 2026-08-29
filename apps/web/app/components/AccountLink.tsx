'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Ticket, User } from 'lucide-react';
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
  const [unread, setUnread] = useState(0);

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
        const {count}=await supabase.from('notifications').select('*',{count:'exact',head:true}).is('read_at',null);
        setUnread(count??0);
      } else {
        setUser(null);
        setUnread(0);
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

  useEffect(()=>{if(!user)return;const supabase=getSupabase();let active=true;async function refresh(){const {count}=await supabase.from('notifications').select('*',{count:'exact',head:true}).is('read_at',null);if(active)setUnread(count??0)}const timer=setInterval(()=>void refresh(),30000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}},[user]);

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
      <Link className="notification-trigger" href="/notifications" aria-label={unread?`${unread} notification${unread>1?'s':''} non lue${unread>1?'s':''}`:'Notifications'}>
        <Bell size={18}/>{unread>0&&<span>{unread>9?'9+':unread}</span>}
      </Link>
      <button
        className="account account-button"
        onClick={() => {if(matchMedia('(max-width: 700px)').matches){router.push('/profile');return}setOpen(!open)}}
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

          <Link className="account-profile-link" href="/tickets" onClick={() => setOpen(false)}>
            <Ticket size={16} />
            Mes billets
          </Link>

          <Link className="account-profile-link" href="/notifications" onClick={() => setOpen(false)}>
            <Bell size={16}/>
            Notifications{unread>0&&<strong className="notification-menu-count">{unread}</strong>}
          </Link>

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

