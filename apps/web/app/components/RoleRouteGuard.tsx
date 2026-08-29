'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase-browser';

export default function RoleRouteGuard(){
 const pathname=usePathname(),searchParams=useSearchParams();
 useEffect(()=>{if(!isSupabaseConfigured||pathname==='/organizer/auth'||pathname==='/admin/auth')return;let active=true;async function protect(){const supabase=getSupabase();const {data:{user}}=await supabase.auth.getUser();if(!active)return;if(!user){if(pathname.startsWith('/organizer'))location.replace('/organizer/auth');else if(pathname.startsWith('/admin'))location.replace('/admin/auth');return}const {data}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle(),role=data?.role??'',organization=['organizer','organizer_pending'].includes(role),admin=role==='admin',preview=pathname.startsWith('/events/')&&searchParams.get('preview')==='organizer';if(pathname.startsWith('/admin')){if(!admin)location.replace(organization?'/organizer/dashboard':'/');return}if(pathname.startsWith('/organizer')){if(admin)location.replace('/admin/dashboard');else if(!organization)location.replace('/organizer/auth');return}if(admin)location.replace('/admin/dashboard');else if(organization&&!preview)location.replace('/organizer/dashboard')}protect();return()=>{active=false}},[pathname,searchParams]);
 return null;
}

