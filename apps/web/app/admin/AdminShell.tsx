'use client';
import { ReactNode } from 'react';
import Link from 'next/link';
import { Building2, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { getSupabase } from '../../lib/supabase-browser';

export default function AdminShell({children}:{children:ReactNode}){const pathname=usePathname();if(pathname==='/admin/auth')return <>{children}</>;async function logout(){await getSupabase().auth.signOut();location.assign('/admin/auth')}return <main className="admin-site"><aside className="admin-sidebar"><Link className="pro-brand" href="/admin/dashboard">NOCTURNE<span>°</span><small>ADMINISTRATION</small></Link><nav><Link className={pathname.includes('/dashboard')?'active':''} href="/admin/dashboard"><LayoutDashboard/>Vue d’ensemble</Link><Link className={pathname.includes('/organizations')?'active':''} href="/admin/organizations"><Building2/>Organisations</Link><Link className={pathname.includes('/artist-claims')?'active':''} href="/admin/artist-claims"><ShieldCheck/>Modération</Link></nav><button onClick={logout}><LogOut/>Se déconnecter</button></aside><section className="admin-main">{children}</section></main>}
