'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Percent, ShieldCheck } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase-browser';

export default function AdminDashboard(){const [organizations,setOrganizations]=useState(0),[pending,setPending]=useState(0);useEffect(()=>{void (async()=>{const supabase=getSupabase(),[{count},{count:pendingCount}]=await Promise.all([supabase.from('organizer_profiles').select('*',{count:'exact',head:true}),supabase.from('profiles').select('*',{count:'exact',head:true}).eq('role','organizer_pending')]);setOrganizations(count??0);setPending(pendingCount??0)})()},[]);return <div className="admin-content"><header><p className="eyebrow">NOCTURNE ADMIN</p><h1>Pilotage de la plateforme.</h1><p>Gérez les organisations, les commissions et les demandes nécessitant une décision NOCTURNE.</p></header><section className="admin-stat-grid"><Link href="/admin/organizations"><Building2/><strong>{organizations}</strong><span>Organisations</span></Link><Link href="/admin/organizations"><Percent/><strong>8 % / 10 %</strong><span>Taux par défaut</span></Link><Link href="/admin/organizations"><ShieldCheck/><strong>{pending}</strong><span>Comptes à valider</span></Link></section></div>}
