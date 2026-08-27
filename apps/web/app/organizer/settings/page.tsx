'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, Save } from 'lucide-react';
import { getSupabase } from '../../../lib/supabase-browser';

type Access='loading'|'guest'|'forbidden'|'ready';

export default function OrganizerSettingsPage(){
  const [access,setAccess]=useState<Access>('loading'),[name,setName]=useState(''),[email,setEmail]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{async function load(){const supabase=getSupabase();const {data:auth}=await supabase.auth.getUser();if(!auth.user){setAccess('guest');return}const {data:profile}=await supabase.from('profiles').select('role').eq('id',auth.user.id).single();if(profile?.role!=='organizer'&&profile?.role!=='admin'){setAccess('forbidden');return}const {data:organization}=await supabase.from('organizer_profiles').select('name').eq('profile_id',auth.user.id).maybeSingle();setName(organization?.name??'');setEmail(auth.user.email??'');setAccess('ready')}load()},[]);
  async function save(event:FormEvent){event.preventDefault();setSaving(true);setMessage('');setError('');const supabase=getSupabase();const {data:auth}=await supabase.auth.getUser();if(!auth.user){setError('Votre session a expiré.');setSaving(false);return}const {error:updateError}=await supabase.from('organizer_profiles').update({name:name.trim()}).eq('profile_id',auth.user.id);if(updateError)setError('Impossible d’enregistrer les paramètres.');else setMessage('Paramètres enregistrés.');setSaving(false)}
  if(access==='loading')return <main className="dashboard"><p>Chargement…</p></main>;
  if(access==='guest')return <main className="dashboard organizer-access"><h1>Connectez-vous pour continuer.</h1><Link className="cta" href="/organizer/auth">Connexion organisateur</Link></main>;
  if(access==='forbidden')return <main className="dashboard organizer-access"><h1>Accès réservé aux organisations.</h1></main>;
  return <div className="pro-category-content"><header className="pro-category-header"><p className="eyebrow">PARAMÈTRES</p><h1>Votre organisation.</h1><p>Gérez les informations générales utilisées dans votre espace professionnel.</p></header><form className="pro-settings-card" onSubmit={save}><div className="profile-field"><label htmlFor="organization-name">Nom de l’organisation</label><input id="organization-name" required minLength={2} maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></div><div className="profile-field"><label htmlFor="organization-email">Adresse de connexion</label><input id="organization-email" value={email} disabled/><small>La modification de l’adresse de connexion sera ajoutée ultérieurement.</small></div>{message&&<p className="profile-success">{message}</p>}{error&&<p className="profile-error">{error}</p>}<button className="cta profile-save" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<Save size={18}/>}Enregistrer</button></form></div>;
}
