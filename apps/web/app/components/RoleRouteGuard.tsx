'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase-browser';

export default function RoleRouteGuard(){
 const pathname=usePathname(),searchParams=useSearchParams();
 useEffect(()=>{if(!isSupabaseConfigured||pathname.startsWith('/organizer'))return;let active=true;async function protect(){const supabase=getSupabase();const {data:{user}}=await supabase.auth.getUser();if(!user||!active)return;const {data}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();const organization=['organizer','organizer_pending'].includes(data?.role??''),preview=pathname.startsWith('/events/')&&searchParams.get('preview')==='organizer';if(organization&&!preview)location.replace('/organizer/dashboard')}protect();return()=>{active=false}},[pathname,searchParams]);
 return null;
}

