import { router } from 'expo-router';
import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { cacheActiveSession, cacheEvents, clearActiveSession, getCachedActiveSession, getCachedEvents, getEventCache, isManifestPreparationDue, isOnline, pendingCount, prepareDueManifests, syncPending, type ActiveScanSession, type CachedEvent } from '../lib/offline';

const MANIFEST_REFRESH_INTERVAL_MS=5*60*1000;

export default function Events(){
  const [events,setEvents]=useState<CachedEvent[]>([]);
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [prepared,setPrepared]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [online,setOnline]=useState(true);
  const [pending,setPending]=useState(0);
  const [message,setMessage]=useState('');
  const [namingEvent,setNamingEvent]=useState<CachedEvent|null>(null);
  const [sessionLabel,setSessionLabel]=useState('');
  const [startingSession,setStartingSession]=useState(false);
  const [activeSession,setActiveSession]=useState<ActiveScanSession|null>(null);
  const preparingManifests=useRef(false);

  const prepareManifests=useCallback(async(rows:CachedEvent[],notify=false)=>{
    if(preparingManifests.current||!rows.some(event=>isManifestPreparationDue(event))||!await isOnline())return;
    preparingManifests.current=true;
    try{
      const result=await prepareDueManifests(rows);
      if(result.prepared.length){
        setPrepared(current=>result.prepared.reduce<Record<string,string>>((next,cache)=>({...next,[cache.event.id]:cache.downloadedAt}),current));
        if(notify)setMessage(`${result.prepared.length} manifeste${result.prepared.length>1?'s':''} actualisé${result.prepared.length>1?'s':''} automatiquement.`);
      }
      if(result.failed.length)setMessage(`Préparation automatique incomplète : ${result.failed.length} manifeste${result.failed.length>1?'s':''} à réessayer.`);
    }finally{
      preparingManifests.current=false;
    }
  },[]);

  useEffect(()=>{async function load(){
    const connected=await isOnline();setOnline(connected);
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){router.replace('/auth');return}
    let currentSession=await getCachedActiveSession(session.user.id);
    if(connected){
      const {data:activeRows}=await supabase.rpc('get_active_scan_session');
      const active=Array.isArray(activeRows)?activeRows[0]:null;
      if(active){currentSession={id:active.id,eventId:active.event_id,eventTitle:active.event_title,label:active.label,startedAt:active.started_at,scannerId:session.user.id};await cacheActiveSession(currentSession)}
      else if(currentSession){currentSession=null;await clearActiveSession()}
    }
    setActiveSession(currentSession);
    let rows=await getCachedEvents();
    if(connected){
      const {data:profile}=await supabase.from('profiles').select('role').eq('id',session.user.id).single();
      if(!profile||!['organizer','admin','scanner'].includes(profile.role)){await supabase.auth.signOut();router.replace('/auth');return}
      const {data}=await supabase.rpc('get_scan_events');
      rows=(data??[]) as CachedEvent[];await cacheEvents(rows);
      const sync=await syncPending();if(sync.synced||sync.conflicts)setMessage(`${sync.synced} scan${sync.synced>1?'s':''} synchronisé${sync.synced>1?'s':''}${sync.conflicts?` · ${sync.conflicts} conflit${sync.conflicts>1?'s':''}`:''}`);
      if(rows.length){const {data:entries}=await supabase.from('check_ins').select('event_id').in('event_id',rows.map(event=>event.id));const next:Record<string,number>={};(entries??[]).forEach(entry=>{next[entry.event_id]=(next[entry.event_id]??0)+1});setCounts(next)}
    }else{
      const next:Record<string,number>={};
      for(const item of rows){const cache=await getEventCache(item.id);next[item.id]=(cache?.baseCount??0)+await pendingCount(item.id)}
      setCounts(next);
    }
    setEvents(rows);setPending(await pendingCount());
    const cached:Record<string,string>={};for(const event of rows){const manifest=await getEventCache(event.id);if(manifest)cached[event.id]=manifest.downloadedAt}setPrepared(cached);
    if(connected)await prepareManifests(rows);
    setLoading(false);
  }void load()},[]);

  useEffect(()=>{
    if(!events.length)return;
    const refresh=()=>void prepareManifests(events);
    const appState=AppState.addEventListener('change',state=>{if(state==='active')refresh()});
    const timer=setInterval(refresh,MANIFEST_REFRESH_INTERVAL_MS);
    return()=>{appState.remove();clearInterval(timer)};
  },[events,prepareManifests]);

  useEffect(()=>{
    let synchronizing=false;
    const subscription=Network.addNetworkStateListener(state=>{
      const connected=Boolean(state.isConnected&&state.isInternetReachable===true);
      setOnline(connected);
      if(!connected||synchronizing)return;
      synchronizing=true;
      void (async()=>{
        try{
          const before=await pendingCount();
          const sync=await syncPending();
          setPending(sync.pending);
          if(sync.synced||sync.conflicts){
            setMessage(`${sync.synced} scan${sync.synced>1?'s':''} synchronisé${sync.synced>1?'s':''}${sync.conflicts?` · ${sync.conflicts} conflit${sync.conflicts>1?'s':''}`:''}`);
          }else if(before&&sync.pending){
            setMessage('Synchronisation en attente. Nouvelle tentative à la prochaine reconnexion.');
          }
          if(events.length){
            await prepareManifests(events);
            const {data:entries}=await supabase.from('check_ins').select('event_id').in('event_id',events.map(item=>item.id));
            const next:Record<string,number>={};
            (entries??[]).forEach(entry=>{next[entry.event_id]=(next[entry.event_id]??0)+1});
            setCounts(next);
          }
        }finally{
          synchronizing=false;
        }
      })();
    });
    return()=>subscription.remove();
  },[events,prepareManifests]);

  useEffect(()=>{
    let synchronizing=false;
    async function retry(){
      if(synchronizing)return;
      synchronizing=true;
      try{
        const connected=await isOnline();
        setOnline(connected);
        if(!connected){
          const next:Record<string,number>={};
          for(const item of events){const cache=await getEventCache(item.id);next[item.id]=(cache?.baseCount??0)+await pendingCount(item.id)}
          setCounts(next);
          setPending(await pendingCount());
          return;
        }
        if(await pendingCount()===0)return;
        const sync=await syncPending();
        setPending(sync.pending);
        if(sync.synced||sync.conflicts){
          setOnline(true);
          setMessage(`${sync.synced} scan${sync.synced>1?'s':''} synchronisé${sync.synced>1?'s':''}${sync.conflicts?` · ${sync.conflicts} conflit${sync.conflicts>1?'s':''}`:''}`);
          if(events.length){
            const {data:entries}=await supabase.from('check_ins').select('event_id').in('event_id',events.map(item=>item.id));
            const next:Record<string,number>={};
            (entries??[]).forEach(entry=>{next[entry.event_id]=(next[entry.event_id]??0)+1});
            setCounts(next);
          }
        }else if(sync.error){
          setMessage(`Synchronisation impossible : ${sync.error}`);
        }
      }finally{
        synchronizing=false;
      }
    }
    void retry();
    const timer=setInterval(()=>void retry(),5000);
    return()=>clearInterval(timer);
  },[events]);

  async function startSession(){
    if(!namingEvent||sessionLabel.trim().length<2)return;
    setStartingSession(true);setMessage('');
    const {data,error}=await supabase.rpc('start_scan_session',{p_event:namingEvent.id,p_label:sessionLabel.trim()});
    setStartingSession(false);
    if(error||!data){setMessage('Impossible de démarrer ce poste de scan. Vérifiez la connexion.');return}
    const {data:{session:authSession}}=await supabase.auth.getSession();
    if(!authSession){setMessage('Votre session de connexion a expiré.');return}
    const active={id:String(data),eventId:namingEvent.id,eventTitle:namingEvent.title,label:sessionLabel.trim(),startedAt:new Date().toISOString(),scannerId:authSession.user.id};
    await cacheActiveSession(active);setActiveSession(active);
    router.push({pathname:'/scan',params:{event:active.eventId,title:active.eventTitle,session:active.id,label:active.label}});
    setNamingEvent(null);setSessionLabel('');
  }
  function resumeSession(){if(activeSession)router.push({pathname:'/scan',params:{event:activeSession.eventId,title:activeSession.eventTitle,session:activeSession.id,label:activeSession.label}})}
  async function endSession(){
    if(!activeSession)return;
    if(!await isOnline()){setMessage('Reconnectez Internet avant de fermer ce poste.');return}
    const sync=await syncPending();setPending(sync.pending);
    if(sync.pending){setMessage('Des scans attendent encore leur synchronisation. Réessayez dans un instant.');return}
    const {data,error}=await supabase.rpc('end_scan_session',{p_session:activeSession.id});
    if(error||!data){setMessage(`Impossible de fermer ce poste${error?.message?` : ${error.message}`:''}.`);return}
    await clearActiveSession();setActiveSession(null);setMessage('Poste de scan fermé.');
  }
  async function logout(){await supabase.rpc('log_scanner_auth_event',{p_event:'logout'});await supabase.auth.signOut();router.replace('/auth')}
  if(loading)return <View style={s.center}><ActivityIndicator size="large" color="#53F6D4"/></View>;
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <View style={s.head}><View><Text style={s.logo}>NOCTURNE<Text style={s.dot}>°</Text></Text><Text style={s.pro}>SCAN</Text></View><Pressable onPress={logout}><Text style={s.logout}>Déconnexion</Text></Pressable></View>
    <View style={[s.network,online?s.networkOn:s.networkOff]}><View style={[s.networkDot,online?s.networkDotOn:s.networkDotOff]}/><Text style={[s.networkText,online?s.networkTextOn:s.networkTextOff]}>{online?'EN LIGNE':`HORS LIGNE — ${pending} EN ATTENTE`}</Text></View>
    <Text style={s.eyebrow}>CONTRÔLE DES ENTRÉES</Text><Text style={s.title}>{activeSession?'Poste actif.':'Choisissez une soirée.'}</Text><Text style={s.intro}>{activeSession?'Reprenez ou fermez votre session de contrôle.':'Soirées en cours ou à venir'}</Text>
    {message?<Text style={s.message}>{message}</Text>:null}
    {activeSession?<View style={a.box}><Text style={s.sessionEyebrow}>SESSION EN COURS</Text><Text style={a.label}>{activeSession.label}</Text><Text style={a.event}>{activeSession.eventTitle}</Text><Text style={a.time}>Démarrée à {new Date(activeSession.startedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</Text><Pressable style={a.resume} onPress={resumeSession}><Text style={a.resumeText}>Reprendre le scan</Text></Pressable><Pressable style={a.end} onPress={()=>void endSession()}><Text style={a.endText}>Fermer ce poste</Text></Pressable></View>:null}
    {!activeSession&&namingEvent?<View style={s.sessionBox}><Text style={s.sessionEyebrow}>NOM DU POSTE DE SCAN</Text><Text style={s.sessionEvent}>{namingEvent.title}</Text><TextInput style={s.sessionInput} value={sessionLabel} onChangeText={setSessionLabel} placeholder="Ex. Entrée Nord ou Julien" placeholderTextColor="#777C91" maxLength={60} autoFocus/><View style={s.sessionActions}><Pressable onPress={()=>{setNamingEvent(null);setSessionLabel('')}}><Text style={s.cancel}>Annuler</Text></Pressable><Pressable style={s.sessionButton} disabled={startingSession||sessionLabel.trim().length<2} onPress={()=>void startSession()}><Text style={s.sessionButtonText}>{startingSession?'Démarrage…':'Commencer à scanner'}</Text></Pressable></View></View>:null}
    {!activeSession?<View style={s.list}>{events.length?events.map(event=><View key={event.id} style={s.card}><Pressable style={s.eventAction} onPress={()=>{setNamingEvent(event);setSessionLabel('')}}><View style={s.date}><Text style={s.day}>{new Date(event.starts_at).toLocaleDateString('fr-FR',{day:'2-digit'})}</Text><Text style={s.month}>{new Date(event.starts_at).toLocaleDateString('fr-FR',{month:'short'})}</Text></View><View style={s.details}><Text style={s.eventTitle}>{event.title}</Text><Text style={s.meta}>{event.city} · {new Date(event.starts_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</Text><Text style={s.count}>{counts[event.id]??0} scanné{(counts[event.id]??0)>1?'s':''}</Text></View><Text style={s.arrow}>›</Text></Pressable><Text style={[s.offlineState,prepared[event.id]?s.offlineReady:null]}>{prepared[event.id]?'✓ Manifeste hors ligne prêt':isManifestPreparationDue(event)?online?'Préparation automatique en cours…':'Préparation dès le retour du réseau':'Préparation automatique 3 h avant'}</Text></View>):<Text style={s.empty}>Aucune soirée disponible. Connectez-vous une première fois avant de passer hors ligne.</Text>}</View>:null}
  </ScrollView>;
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#080A14'},content:{padding:22,paddingTop:60},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#080A14'},head:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},logo:{color:'#F8F7FF',fontSize:21,fontWeight:'900'},dot:{color:'#FF4D99'},pro:{color:'#53F6D4',fontSize:10,fontWeight:'900',letterSpacing:3},logout:{color:'#9FA3B8'},network:{width:'100%',marginTop:25,paddingHorizontal:16,paddingVertical:14,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},networkOn:{backgroundColor:'rgba(83,246,212,.14)',borderColor:'rgba(83,246,212,.55)'},networkOff:{backgroundColor:'rgba(255,183,77,.17)',borderColor:'rgba(255,183,77,.65)'},networkDot:{width:11,height:11,borderRadius:6},networkDotOn:{backgroundColor:'#53F6D4'},networkDotOff:{backgroundColor:'#FFB74D'},networkText:{fontSize:14,fontWeight:'900',letterSpacing:1.2},networkTextOn:{color:'#53F6D4'},networkTextOff:{color:'#FFCA7A'},eyebrow:{color:'#53F6D4',fontSize:10,fontWeight:'800',letterSpacing:1.5,marginTop:30},title:{color:'#F8F7FF',fontSize:36,fontWeight:'900',marginTop:9},intro:{color:'#9FA3B8',marginTop:8},message:{color:'#FFD07A',marginTop:16},sessionBox:{marginTop:22,padding:18,borderWidth:1,borderColor:'#A888FF',borderRadius:17,backgroundColor:'#101321'},sessionEyebrow:{color:'#A888FF',fontSize:10,fontWeight:'900',letterSpacing:1.3},sessionEvent:{color:'#F8F7FF',fontSize:18,fontWeight:'900',marginTop:7},sessionInput:{marginTop:15,padding:14,borderWidth:1,borderColor:'#343950',borderRadius:12,backgroundColor:'#0B0E1B',color:'#F8F7FF'},sessionActions:{marginTop:14,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:18},cancel:{color:'#9FA3B8'},sessionButton:{paddingHorizontal:16,paddingVertical:12,borderRadius:12,backgroundColor:'#53F6D4'},sessionButtonText:{color:'#080A14',fontWeight:'900',fontSize:12},list:{gap:12,marginTop:28},card:{borderWidth:1,borderColor:'#292D42',borderRadius:17,backgroundColor:'#101321',overflow:'hidden'},eventAction:{flexDirection:'row',alignItems:'center',gap:14,padding:16},date:{width:48,alignItems:'center'},day:{color:'#53F6D4',fontWeight:'900',fontSize:25},month:{color:'#9FA3B8',textTransform:'uppercase'},details:{flex:1,gap:4},eventTitle:{color:'#F8F7FF',fontWeight:'900',fontSize:17},meta:{color:'#9FA3B8',fontSize:12},count:{color:'#53F6D4',fontSize:12,fontWeight:'800'},arrow:{color:'#F8F7FF',fontSize:30},offlineState:{borderTopWidth:1,borderTopColor:'#292D42',padding:12,textAlign:'center',color:'#9FA3B8',fontSize:12},offlineReady:{color:'#53F6D4',backgroundColor:'rgba(83,246,212,.08)',fontWeight:'800'},empty:{color:'#9FA3B8',textAlign:'center',marginTop:40}});
const a=StyleSheet.create({box:{marginTop:24,padding:20,borderWidth:1,borderColor:'rgba(83,246,212,.55)',borderRadius:18,backgroundColor:'#101321'},label:{color:'#FF4D99',fontSize:26,fontWeight:'900',marginTop:9},event:{color:'#F8F7FF',fontSize:16,fontWeight:'800',marginTop:5},time:{color:'#9FA3B8',fontSize:12,marginTop:5},resume:{marginTop:20,padding:15,borderRadius:13,alignItems:'center',backgroundColor:'#53F6D4'},resumeText:{color:'#080A14',fontWeight:'900'},end:{marginTop:10,padding:13,borderWidth:1,borderColor:'#D93F5C',borderRadius:13,alignItems:'center'},endText:{color:'#FF6B83',fontWeight:'900'}});
