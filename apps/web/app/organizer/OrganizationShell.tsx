'use client';

import { CSSProperties, ReactNode, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ListMusic, LogOut, Settings } from 'lucide-react';
import { getSupabase } from '../../lib/supabase-browser';

export default function OrganizationShell({children}:{children:ReactNode}) {
  const pathname=usePathname();
  const active=pathname.includes('/settings')?'settings':pathname==='/organizer/dashboard'?'dashboard':'events';
  const indexes={dashboard:0,events:1,settings:2};
  const previousIndex=useRef(indexes[active]);
  const direction=indexes[active]>=previousIndex.current?'forward':'backward';
  useEffect(()=>{previousIndex.current=indexes[active]},[active]);
  async function logout(){await getSupabase().auth.signOut();location.assign('/organizer/auth')}
  if(pathname==='/organizer/auth')return <>{children}</>;
  const item=(section:keyof typeof indexes,href:string,label:string,icon:ReactNode)=><Link className={active===section?'active':''} href={href} onClick={()=>section==='events'&&window.dispatchEvent(new CustomEvent('organizer-view',{detail:'events'}))}>{icon}{label}</Link>;
  return <main className="pro-dashboard-page">
    <aside className="pro-sidebar">
      <Link className="pro-brand" href="/organizer/dashboard">NOCTURNE<span>°</span><small>ORGANISATION</small></Link>
      <nav aria-label="Navigation organisation" style={{'--nav-index':indexes[active]} as CSSProperties}>
        <i className="pro-nav-highlight" aria-hidden="true"/>
        {item('dashboard','/organizer/dashboard','Vue d’ensemble',<LayoutDashboard size={18}/>)}
        {item('events','/organizer','Visuel soirées',<ListMusic size={18}/>)}
        {item('settings','/organizer/settings','Paramètres',<Settings size={18}/>)}
      </nav>
      <div className="pro-sidebar-bottom"><Link href="/">Voir le site public</Link><button type="button" onClick={logout}><LogOut size={17}/>Se déconnecter</button></div>
    </aside>
    <section className="pro-dashboard-main pro-dashboard-main-wide"><div className={`pro-dashboard-content-slide ${direction}`} key={pathname}>{children}</div></section>
  </main>;
}
