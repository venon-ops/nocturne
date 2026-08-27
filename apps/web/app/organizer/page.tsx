'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarPlus, GripVertical, ImagePlus, LayoutList, LoaderCircle, LogOut, Plus, Trash2 } from 'lucide-react';
import { getSupabase } from '../../lib/supabase-browser';
import { MUSIC_GENRES } from '../../lib/music-genres';
import OrganizerEventsList from './OrganizerEventsList';
import AddressAutocomplete from '../components/AddressAutocomplete';

type AccessState = 'loading' | 'guest' | 'forbidden' | 'pending' | 'organizer' | 'admin';
type TicketPhase = { id: number; name: string; quantity: string; price: string };

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function OrganizerPage() {
  const [access, setAccess] = useState<AccessState>('loading');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [city, setCity] = useState('');
  const [address,setAddress]=useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [artists, setArtists] = useState('');
  const [publicationMode, setPublicationMode] = useState<'draft'|'now'|'scheduled'>('draft');
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('');
  const [bannerFile, setBannerFile] = useState<File|null>(null);
  const [bannerPreview, setBannerPreview] = useState<string|null>(null);
  const [phases, setPhases] = useState<TicketPhase[]>([
    { id: 1, name: 'Tarif standard', quantity: '', price: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [quotaError, setQuotaError] = useState('');
  const [activeView, setActiveView] = useState<'events'|'create'>('events');
  const [draggedPhase,setDraggedPhase]=useState<number|null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'create') setActiveView('create');
    const showEvents=()=>setActiveView('events');
    window.addEventListener('organizer-view',showEvents);
    async function checkAccess() {
      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setAccess('guest'); return; }
      const { data } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single();
      setAccess(data?.role === 'admin' ? 'admin' : data?.role === 'organizer' ? 'organizer' : data?.role === 'organizer_pending' ? 'pending' : 'forbidden');
    }
    checkAccess();
    return ()=>window.removeEventListener('organizer-view',showEvents);
  }, []);

  function updateTitle(value: string) {
    const previousAutoSlug = slugify(title);
    setTitle(value);
    if (!slug || slug === previousAutoSlug) setSlug(slugify(value));
  }

  function updatePhase(id: number, field: keyof Omit<TicketPhase, 'id'>, value: string) {
    if (field === 'quantity') {
      const otherTotal = phases.reduce((sum, phase) => sum + (phase.id === id ? 0 : Number(phase.quantity) || 0), 0);
      if (Number(value) + otherTotal > Number(maxCapacity)) {
        setQuotaError(`Il reste ${Math.max(0, Number(maxCapacity) - otherTotal)} place(s) disponible(s).`);
        return;
      }
      setQuotaError('');
    }
    setPhases(current => current.map(phase => phase.id === id ? { ...phase, [field]: value } : phase));
  }

  function addPhase() {
    setPhases(current => [...current, { id: Date.now(), name: `Phase ${current.length + 1}`, quantity: '', price: '' }]);
  }

  function selectBanner(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; setError('');
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setError('La bannière doit être au format JPG, PNG ou WebP.'); event.target.value=''; return; }
    if (file.size > 10*1024*1024) { setError('La bannière ne doit pas dépasser 10 Mo.'); event.target.value=''; return; }
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerFile(file); setBannerPreview(URL.createObjectURL(file));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(''); setError('');
    try {
      const artistNames = artists.split(/[,\n]/).map(name => name.trim()).filter(Boolean);
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      const ticketPhases = phases.map(phase => ({
        name: phase.name.trim(),
        quantity: Number(phase.quantity),
        price_cents: Math.round(Number(phase.price.replace(',', '.')) * 100),
        position: phases.indexOf(phase),
      }));
      if (end <= start) throw new Error('end_before_start');
      if (ticketPhases.reduce((sum, phase) => sum + phase.quantity, 0) > Number(maxCapacity)) {
        throw new Error('capacity_exceeded');
      }
      const supabase = getSupabase();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error('not_authenticated');
      const { data: eventId, error: createError } = await supabase.rpc('create_event_with_artists', {
        p_title: title, p_slug: slug, p_city: city,
        p_starts_at: start.toISOString(), p_ends_at: end.toISOString(),
        p_max_capacity: Number(maxCapacity), p_ticket_phases: ticketPhases,
        p_description: description || null, p_genre: genre || null,
        p_status: publicationMode === 'now' ? 'published' : 'draft', p_artist_names: artistNames,
      });
      if (createError) throw createError;
      const {error:addressError}=await supabase.from('events').update({address:address.trim()}).eq('id',eventId);
      if(addressError)throw addressError;
      let uploadedPath: string|null = null;
      try {
        if (bannerFile) {
          uploadedPath = `${authData.user.id}/${eventId}/banner`;
          const { error: uploadError } = await supabase.storage.from('event-media').upload(uploadedPath,bannerFile,{contentType:bannerFile.type,cacheControl:'3600',upsert:true});
          if (uploadError) throw uploadError;
          const { error: bannerError } = await supabase.rpc('set_event_banner',{p_event_id:eventId,p_cover_path:uploadedPath});
          if (bannerError) throw bannerError;
        }
        if (publicationMode === 'scheduled') {
          const scheduledAt = new Date(`${publishDate}T${publishTime}`);
          if (scheduledAt <= new Date()) throw new Error('publication_in_past');
          const { error: scheduleError } = await supabase.rpc('schedule_event_publication',{p_event_id:eventId,p_publish_at:scheduledAt.toISOString()});
          if (scheduleError) throw scheduleError;
        }
      } catch (afterCreateError) {
        if (uploadedPath) await supabase.storage.from('event-media').remove([uploadedPath]);
        await supabase.from('events').delete().eq('id',eventId);
        throw afterCreateError;
      }
      setMessage(publicationMode === 'now' ? 'Événement publié.' : publicationMode === 'scheduled' ? 'Événement enregistré et publication programmée.' : 'Événement enregistré en brouillon.');
      if (publicationMode === 'now') location.assign(`/events/${slug}`);
      else {
        setTitle(''); setSlug(''); setCity(''); setAddress(''); setStartDate(''); setStartTime(''); setEndDate(''); setEndTime(''); setMaxCapacity('');
        setGenre(''); setDescription(''); setArtists('');
        setPhases([{ id: Date.now(), name: 'Tarif standard', quantity: '', price: '' }]);
        setPublicationMode('draft'); setPublishDate(''); setPublishTime(''); setBannerFile(null);
        if (bannerPreview) URL.revokeObjectURL(bannerPreview); setBannerPreview(null);
        setActiveView('events');
      }
      console.info('Événement créé :', eventId);
    } catch (createError) {
      console.error(createError);
      const detail = createError instanceof Error ? createError.message : '';
      setError(detail.toLowerCase().includes('duplicate') ? 'Cette adresse d’événement est déjà utilisée.' : detail.includes('end_before_start') ? 'La fin doit être postérieure au début.' : detail.includes('capacity_exceeded') ? 'La somme des places des phases dépasse la capacité maximale.' : detail.includes('publication_in_past') ? 'La publication programmée doit être dans le futur.' : 'Impossible de créer l’événement. Vérifiez les informations saisies.');
    } finally { setSaving(false); }
  }

  async function logout() {
    await getSupabase().auth.signOut();
    location.assign('/organizer/auth');
  }

  if (access === 'loading') return <main className="dashboard"><p>Chargement...</p></main>;
  if (access === 'guest') return <main className="dashboard organizer-access"><p className="eyebrow">ESPACE ORGANISATION</p><h1>Connectez-vous pour continuer.</h1><Link className="cta" href="/organizer/auth">Connexion organisateur</Link></main>;
  if (access === 'pending') return <main className="dashboard organizer-access"><p className="eyebrow">VALIDATION EN COURS</p><h1>Votre espace est presque prêt.</h1><p>Votre organisation doit être validée avant de pouvoir créer et publier des soirées.</p><div className="organizer-access-actions"><Link className="profile-back" href="/"><ArrowLeft size={16}/>Retour au site public</Link><button className="pro-logout" type="button" onClick={logout}><LogOut size={16}/>Se déconnecter</button></div></main>;
  if (access === 'forbidden') return <main className="dashboard organizer-access"><p className="eyebrow">COMPTE UTILISATEUR</p><h1>Cet espace est réservé aux organisations.</h1><p>Utilisez une connexion organisateur ou créez un espace professionnel.</p><div className="organizer-access-actions"><button className="pro-logout" type="button" onClick={logout}><LogOut size={16}/>Changer de compte</button></div></main>;

  return <div className="organizer-create pro-category-content">
    <header className="dash-head"><div><p className="eyebrow">PROGRAMMATION</p><h1>Vos soirées.</h1><p>Gérez votre programmation ou créez une nouvelle soirée.</p></div></header>
    <div className="organizer-switch" role="tablist" aria-label="Gestion des soirées">
      <button className={activeView==='events'?'active':''} type="button" role="tab" aria-selected={activeView==='events'} onClick={()=>setActiveView('events')}><LayoutList size={20}/><span><strong>Mes soirées</strong><small>Consulter et gérer</small></span></button>
      <button className={activeView==='create'?'active':''} type="button" role="tab" aria-selected={activeView==='create'} onClick={()=>setActiveView('create')}><CalendarPlus size={20}/><span><strong>Créer une nouvelle soirée</strong><small>Configurer et publier</small></span></button>
    </div>
    {message&&activeView==='events'&&<p className="profile-success organizer-global-message">{message}</p>}
    {activeView==='events'&&<div className="organizer-panel slide-from-left" role="tabpanel"><OrganizerEventsList /></div>}
    {activeView==='create'&&<div className="organizer-panel slide-from-right" role="tabpanel">
    <form className="event-create-form" onSubmit={submit}>
      <div className="profile-field"><label htmlFor="event-title">Nom de la soirée</label><input id="event-title" required minLength={3} maxLength={120} value={title} onChange={event=>updateTitle(event.target.value)}/></div>
      <div className="profile-field"><label htmlFor="event-slug">Adresse publique</label><input id="event-slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={event=>setSlug(slugify(event.target.value))}/><small>/events/{slug || 'nom-de-la-soiree'}</small></div>
      <div className="profile-field"><label>Adresse du lieu</label><AddressAutocomplete value={address} city={city} onChange={(nextAddress,nextCity)=>{setAddress(nextAddress);if(nextCity)setCity(nextCity)}}/><small>Sélectionnez une proposition pour remplir automatiquement la ville.</small></div>
      <div className="profile-field"><label htmlFor="event-city">Ville</label><input id="event-city" required readOnly value={city}/></div>
      <fieldset className="event-datetime"><legend>Début et fin</legend><div className="event-form-grid"><div className="profile-field"><label htmlFor="start-date">Date de début</label><input id="start-date" type="date" required value={startDate} onChange={event=>{setStartDate(event.target.value);if(!endDate)setEndDate(event.target.value)}}/></div><div className="profile-field"><label htmlFor="start-time">Heure de début</label><input id="start-time" type="time" required value={startTime} onChange={event=>setStartTime(event.target.value)}/></div><div className="profile-field"><label htmlFor="end-date">Date de fin</label><input id="end-date" type="date" required min={startDate} value={endDate} onChange={event=>setEndDate(event.target.value)}/></div><div className="profile-field"><label htmlFor="end-time">Heure de fin</label><input id="end-time" type="time" required value={endTime} onChange={event=>setEndTime(event.target.value)}/></div></div></fieldset>
      <div className="profile-field"><label htmlFor="event-artists">Artistes programmés</label><textarea id="event-artists" rows={4} value={artists} onChange={event=>setArtists(event.target.value)} placeholder="Un nom par ligne, ou séparés par des virgules"/><small>Les variantes de casse et d’accents sont regroupées automatiquement.</small></div>
      <div className="profile-field"><label htmlFor="event-genre">Genre musical</label><input id="event-genre" list="music-genres" maxLength={100} value={genre} onChange={event=>setGenre(event.target.value)} placeholder="Rechercher ou saisir un style"/><datalist id="music-genres">{MUSIC_GENRES.map(item=><option value={item} key={item}/>)}</datalist><small>{MUSIC_GENRES.length} styles proposés, avec saisie libre possible.</small></div>
      <div className="profile-field"><label htmlFor="event-description">Description</label><textarea id="event-description" rows={6} value={description} onChange={event=>setDescription(event.target.value)}/></div>
      <div className="profile-field event-banner-field"><label>Bannière de la soirée</label>{bannerPreview?<img className="event-banner-preview" src={bannerPreview} alt="Aperçu de la bannière"/>:<div className="event-banner-placeholder"><ImagePlus size={28}/><span>Format paysage recommandé, 10 Mo maximum</span></div>}<label className="profile-avatar-button" htmlFor="event-banner"><ImagePlus size={17}/>{bannerFile?'Changer la bannière':'Choisir une bannière'}</label><input className="profile-avatar-input" id="event-banner" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectBanner}/></div>
      <div className="profile-field"><label htmlFor="max-capacity">Capacité maximale</label><input id="max-capacity" type="number" required min={1} step={1} value={maxCapacity} onChange={event=>{setMaxCapacity(event.target.value);setPhases([{id:Date.now(),name:'Tarif standard',quantity:'',price:''}]);setQuotaError('')}}/><small>Information privée, visible uniquement par l’organisation et l’administration. Saisissez-la pour débloquer les phases.</small></div>
      {Number(maxCapacity)>0?<fieldset className="ticket-phases"><div className="ticket-phases-title"><legend>Phases de billetterie</legend><button type="button" onClick={addPhase} disabled={phases.reduce((sum,phase)=>sum+(Number(phase.quantity)||0),0)>=Number(maxCapacity)}><Plus size={16}/>Ajouter une phase</button></div>{phases.map((phase,index)=>{const others=phases.reduce((sum,item)=>sum+(item.id===phase.id?0:Number(item.quantity)||0),0);return <div className="ticket-phase-row" draggable onDragStart={()=>setDraggedPhase(index)} onDragOver={event=>event.preventDefault()} onDrop={()=>{if(draggedPhase===null||draggedPhase===index)return;setPhases(current=>{const next=[...current];const [moved]=next.splice(draggedPhase,1);next.splice(index,0,moved);return next});setDraggedPhase(null)}} key={phase.id}><button className="phase-drag" type="button" aria-label={`Déplacer ${phase.name}`} title="Glisser pour réordonner"><GripVertical size={20}/></button><div className="profile-field"><label htmlFor={`phase-name-${phase.id}`}>Nom de la phase</label><input id={`phase-name-${phase.id}`} required maxLength={100} value={phase.name} onChange={event=>updatePhase(phase.id,'name',event.target.value)} placeholder="Early bird, Phase 1…"/></div><div className="profile-field"><label htmlFor={`phase-quantity-${phase.id}`}>Nombre de places</label><input id={`phase-quantity-${phase.id}`} type="number" required min={1} max={Math.max(1,Number(maxCapacity)-others)} step={1} value={phase.quantity} onChange={event=>updatePhase(phase.id,'quantity',event.target.value)}/></div><div className="profile-field"><label htmlFor={`phase-price-${phase.id}`}>Prix (€)</label><input id={`phase-price-${phase.id}`} type="number" required min={0} step="0.01" value={phase.price} onChange={event=>updatePhase(phase.id,'price',event.target.value)}/></div><button className="phase-remove" type="button" aria-label={`Supprimer la phase ${index+1}`} disabled={phases.length===1} onClick={()=>setPhases(current=>current.filter(item=>item.id!==phase.id))}><Trash2 size={17}/></button></div>})}{quotaError&&<p className="profile-error">{quotaError}</p>}<small>Glissez les phases pour définir leur ordre. Total attribué : {phases.reduce((sum,phase)=>sum+(Number(phase.quantity)||0),0)} / {Number(maxCapacity)} places</small></fieldset>:<div className="ticket-phases-locked">Renseignez la capacité maximale pour configurer les phases de billetterie.</div>}
      <div className="profile-field"><label htmlFor="publication-mode">Publication</label><select id="publication-mode" value={publicationMode} onChange={event=>setPublicationMode(event.target.value as typeof publicationMode)}><option value="draft">Enregistrer en brouillon</option><option value="now">Publier maintenant</option><option value="scheduled">Programmer la publication</option></select></div>
      {publicationMode==='scheduled'&&<div className="event-form-grid scheduled-publication"><div className="profile-field"><label htmlFor="publish-date">Jour de publication</label><input id="publish-date" type="date" required min={new Date().toISOString().slice(0,10)} value={publishDate} onChange={event=>setPublishDate(event.target.value)}/></div><div className="profile-field"><label htmlFor="publish-time">Heure de publication</label><input id="publish-time" type="time" required value={publishTime} onChange={event=>setPublishTime(event.target.value)}/></div></div>}
      {message&&<p className="profile-success">{message}</p>}{error&&<p className="profile-error">{error}</p>}
      <button className="cta profile-save" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<CalendarPlus size={18}/>}Créer la soirée</button>
    </form></div>}
  </div>;
}

