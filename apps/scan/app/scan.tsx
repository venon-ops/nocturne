import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { getEventCache, isOnline, pendingCount, validateOffline, validateOfflinePublicCode } from '../lib/offline';

type Result={type:'accepted'|'already_used'|'wrong_event'|'invalid'|'unauthorized'|'technical_error'|'offline_unavailable';name:string|null}|null;

export default function Scan(){
  const {event,title,session,label}=useLocalSearchParams<{event:string;title:string;session:string;label:string}>();
  const [permission,requestPermission]=useCameraPermissions();
  const [result,setResult]=useState<Result>(null);
  const [count,setCount]=useState(0);
  const [online,setOnline]=useState(true);
  const [pending,setPending]=useState(0);
  const [manualOpen,setManualOpen]=useState(false);
  const [manualCode,setManualCode]=useState('');
  const locked=useRef(false);
  const lastScan=useRef({value:'',at:0});
  const manualInputRef=useRef<TextInput>(null);
  const manualTransition=useRef(new Animated.Value(0)).current;

  useEffect(()=>{if(!event)return;(async()=>{if(await isOnline()){const {count:initial}=await supabase.from('check_ins').select('id',{count:'exact',head:true}).eq('event_id',event);setCount(initial??0)}else{const cache=await getEventCache(event);setCount((cache?.baseCount??0)+await pendingCount(event))}})()},[event]);
  useEffect(()=>{
    if(!event)return;
    async function refreshStatus(){setOnline(await isOnline());setPending(await pendingCount(event))}
    void refreshStatus();
    const timer=setInterval(()=>void refreshStatus(),5000);
    return()=>clearInterval(timer);
  },[event]);
  useEffect(()=>{if(!result)return;const timer=setTimeout(()=>{setResult(null);locked.current=false},1700);return()=>clearTimeout(timer)},[result]);

  function openManual(){
    setManualOpen(true);
    Animated.timing(manualTransition,{toValue:1,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();
  }
  function closeManual(){
    Keyboard.dismiss();
    Animated.timing(manualTransition,{toValue:0,duration:180,easing:Easing.inOut(Easing.quad),useNativeDriver:true}).start(()=>{setManualOpen(false);setManualCode('')});
  }

  async function validate(rawValue:string){
    if(locked.current)return;const now=Date.now();if(lastScan.current.value===rawValue&&now-lastScan.current.at<3500)return;lastScan.current={value:rawValue,at:now};locked.current=true;
    const prefix='nocturne:ticket:';if(!rawValue.startsWith(prefix)){setResult({type:'invalid',name:null});return}
    if(!event||!session){setResult({type:'unauthorized',name:null});return}
    if(!await isOnline()){const offlineResult=await validateOffline(event,session,rawValue.slice(prefix.length));setResult(offlineResult);if(offlineResult.type==='accepted'){setCount(current=>current+1);setPending(current=>current+1)}return}
    const {data:{user},error:userError}=await supabase.auth.getUser();if(userError){setResult({type:'technical_error',name:null});return}if(!user||!event){setResult({type:'unauthorized',name:null});return}
    const {data,error}=await supabase.rpc('validate_ticket_token_for_session',{p_token:rawValue.slice(prefix.length),p_event:event,p_session:session});
    if(error){setResult({type:error.message.toLowerCase().includes('not authorized')?'unauthorized':'technical_error',name:null});return}
    const response=Array.isArray(data)?data[0]:null;const type=response?.result==='accepted'||response?.result==='already_used'||response?.result==='wrong_event'?response.result:'invalid';setResult({type,name:response?.attendee_name??null});if(type==='accepted'){const {count:next}=await supabase.from('check_ins').select('id',{count:'exact',head:true}).eq('event_id',event);setCount(current=>next??current+1)}
  }

  async function validateManual(){
    if(locked.current||!event||!session)return;
    let code=manualCode.trim().toUpperCase().replace(/[—–]/g,'-').replace(/\s+/g,'');
    if(!code.startsWith('NOC-'))code=`NOC-${code}`;
    if(!/^NOC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(code)){locked.current=true;setResult({type:'invalid',name:null});return}
    locked.current=true;
    if(!await isOnline()){
      const offlineResult=await validateOfflinePublicCode(event,session,code);setResult(offlineResult);
      if(offlineResult.type==='accepted'){setCount(current=>current+1);setPending(current=>current+1);closeManual()}
      return;
    }
    const {data,error}=await supabase.rpc('validate_ticket_public_code_for_session',{p_code:code,p_event:event,p_session:session});
    if(error){setResult({type:error.message.toLowerCase().includes('not authorized')?'unauthorized':'technical_error',name:null});return}
    const response=Array.isArray(data)?data[0]:null;const type=response?.result==='accepted'||response?.result==='already_used'||response?.result==='wrong_event'?response.result:'invalid';
    setResult({type,name:response?.attendee_name??null});
    if(type==='accepted'){const {count:next}=await supabase.from('check_ins').select('id',{count:'exact',head:true}).eq('event_id',event);setCount(current=>next??current+1);closeManual()}
  }

  if(!permission)return <View style={s.page}/>;
  if(!permission.granted)return <View style={s.permission}><Text style={s.permissionTitle}>La caméra est nécessaire pour contrôler les billets.</Text><Pressable style={s.button} onPress={requestPermission}><Text style={s.buttonText}>Autoriser la caméra</Text></Pressable></View>;
  const accepted=result?.type==='accepted';const technical=result?.type==='technical_error'||result?.type==='offline_unavailable';
  const scanOpacity=manualTransition.interpolate({inputRange:[0,1],outputRange:[1,0]});
  const scanTranslate=manualTransition.interpolate({inputRange:[0,1],outputRange:[0,-70]});
  return <View style={s.page}>
    <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={manualOpen?undefined:({data})=>void validate(data)}/>
    <View style={s.mask}>
      <View style={s.header}><Pressable onPress={()=>router.back()}><Text style={s.back}>‹ Soirées</Text></Pressable><View style={[s.status,online?s.statusOn:s.statusOff]}><View style={[s.statusDot,online?s.statusDotOn:s.statusDotOff]}/><Text style={[s.statusText,online?s.statusTextOn:s.statusTextOff]}>{online?'EN LIGNE':'HORS LIGNE'}</Text></View></View>
      <Animated.View pointerEvents={manualOpen?'none':'auto'} style={[s.scanContent,{opacity:scanOpacity,transform:[{translateY:scanTranslate}]}]}>
        <View style={s.heading}><Text style={s.title}>{title||'Scanner un billet'}</Text><Text style={s.sessionLabel}>{label||'Poste de scan'}</Text><Text style={s.help}>Cadrez le QR code du participant</Text></View>
        <View style={s.stats}><View style={s.stat}><Text style={s.statValue}>{count}</Text><Text style={s.statLabel}>BILLETS SCANNÉS</Text></View>{!online&&<View style={s.stat}><Text style={[s.statValue,s.pendingValue]}>{pending}</Text><Text style={s.statLabel}>EN ATTENTE</Text></View>}</View>
        <View style={s.frame}/><Text style={s.bottomHelp}>Maintenez le QR code dans le cadre</Text>
        <Pressable style={s.manualTrigger} onPress={openManual}><Text style={s.manualTriggerText}>Saisir un numéro de billet</Text></Pressable>
      </Animated.View>
      {result&&<View style={[s.banner,{top:109},accepted?s.success:technical?s.warning:s.failure]}><Text style={s.icon}>{accepted?'✓':technical?'!':'×'}</Text><View><Text style={s.bannerTitle}>{accepted?'BILLET VALIDE':result.type==='already_used'?'DÉJÀ SCANNÉ':result.type==='wrong_event'?'BILLET INVALIDE':result.type==='offline_unavailable'?'HORS LIGNE INDISPONIBLE':result.type==='technical_error'?'ERREUR RÉSEAU':result.type==='unauthorized'?'NON AUTORISÉ':'BILLET INVALIDE'}</Text><Text style={s.bannerText}>{result.type==='wrong_event'?'Mauvais événement':result.type==='offline_unavailable'?'Téléchargez d’abord cette soirée':result.type==='technical_error'?'Réessayez dans un instant':result.name??''}</Text></View></View>}
    </View>
    <Modal visible={manualOpen} transparent statusBarTranslucent animationType="slide" onShow={()=>setTimeout(()=>manualInputRef.current?.focus(),180)} onRequestClose={closeManual}><KeyboardAvoidingView style={[s.manualModal,{backgroundColor:'rgba(8,10,20,.22)'}]} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={12}><View style={[s.manualPanel,{transform:[{translateY:53}]}]}><Text style={s.manualTitle}>Validation manuelle</Text><Text style={s.manualHelp}>Saisissez le numéro inscrit sous le QR code.</Text><TextInput ref={manualInputRef} style={s.manualInput} value={manualCode} onChangeText={setManualCode} placeholder="NOC-7K4M-92XP" placeholderTextColor="#777C91" autoCapitalize="characters" autoCorrect={false} maxLength={15}/><View style={s.manualActions}><Pressable onPress={closeManual}><Text style={s.manualCancel}>Annuler</Text></Pressable><Pressable style={s.manualValidate} onPress={()=>void validateManual()}><Text style={s.manualValidateText}>Valider le billet</Text></Pressable></View></View></KeyboardAvoidingView></Modal>
  </View>;
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#080A14'},mask:{flex:1,padding:22,paddingTop:58,backgroundColor:'rgba(8,10,20,.38)'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},scanContent:{flex:1},back:{color:'#F8F7FF',fontSize:16,fontWeight:'700'},status:{paddingHorizontal:11,paddingVertical:7,borderRadius:18,flexDirection:'row',alignItems:'center',gap:7,borderWidth:1},statusOn:{backgroundColor:'rgba(8,30,28,.85)',borderColor:'#53F6D4'},statusOff:{backgroundColor:'rgba(49,31,8,.9)',borderColor:'#FFB74D'},statusDot:{width:8,height:8,borderRadius:4},statusDotOn:{backgroundColor:'#53F6D4'},statusDotOff:{backgroundColor:'#FFB74D'},statusText:{fontSize:10,fontWeight:'900',letterSpacing:1},statusTextOn:{color:'#53F6D4'},statusTextOff:{color:'#FFCA7A'},heading:{alignItems:'center',marginTop:24},title:{color:'#F8F7FF',fontSize:24,fontWeight:'900',textAlign:'center'},sessionLabel:{color:'#FF4D99',fontSize:12,fontWeight:'900',letterSpacing:1,marginTop:5},help:{color:'#F8F7FF',marginTop:6},stats:{flexDirection:'row',justifyContent:'center',gap:10,marginTop:18},stat:{minWidth:130,alignItems:'center',paddingHorizontal:16,paddingVertical:11,borderRadius:14,backgroundColor:'rgba(8,10,20,.82)',borderWidth:1,borderColor:'rgba(255,255,255,.2)'},statValue:{color:'#53F6D4',fontSize:27,fontWeight:'900'},pendingValue:{color:'#FFCA7A'},statLabel:{color:'#F8F7FF',fontSize:9,fontWeight:'900',letterSpacing:1.2,marginTop:2},frame:{width:270,height:270,borderWidth:3,borderColor:'#53F6D4',borderRadius:25,alignSelf:'center',marginTop:22},bottomHelp:{color:'#F8F7FF',fontWeight:'700',textAlign:'center',marginTop:15,textShadowColor:'#000',textShadowRadius:5},manualTrigger:{alignSelf:'center',marginTop:13,paddingHorizontal:15,paddingVertical:10,borderWidth:1,borderColor:'rgba(255,255,255,.45)',borderRadius:20,backgroundColor:'rgba(8,10,20,.72)'},manualTriggerText:{color:'#F8F7FF',fontSize:11,fontWeight:'900'},manualModal:{flex:1,justifyContent:'center',paddingHorizontal:16,backgroundColor:'rgba(8,10,20,.72)'},manualPanel:{width:'100%',padding:20,borderWidth:1,borderColor:'#A888FF',borderRadius:18,backgroundColor:'#101321',shadowColor:'#000',shadowOpacity:.45,shadowRadius:24,elevation:12,transform:[{translateY:-42}]},manualTitle:{color:'#F8F7FF',fontSize:21,fontWeight:'900'},manualHelp:{color:'#9FA3B8',fontSize:12,marginTop:5},manualInput:{marginTop:15,padding:15,borderWidth:1,borderColor:'#343950',borderRadius:12,backgroundColor:'#080A14',color:'#F8F7FF',fontSize:17,fontWeight:'900',letterSpacing:1.2},manualActions:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:18,marginTop:15},manualCancel:{color:'#9FA3B8'},manualValidate:{paddingHorizontal:16,paddingVertical:12,borderRadius:11,backgroundColor:'#53F6D4'},manualValidateText:{color:'#080A14',fontWeight:'900'},permission:{flex:1,justifyContent:'center',padding:28,backgroundColor:'#080A14'},permissionTitle:{color:'#F8F7FF',fontSize:25,fontWeight:'900',textAlign:'center'},button:{backgroundColor:'#53F6D4',padding:16,borderRadius:14,alignItems:'center',marginTop:25},buttonText:{color:'#080A14',fontWeight:'900'},banner:{position:'absolute',top:14,left:14,right:14,padding:17,borderRadius:16,flexDirection:'row',alignItems:'center',gap:13},success:{backgroundColor:'#15986F'},failure:{backgroundColor:'#D93F5C'},warning:{backgroundColor:'#C77816'},icon:{color:'#FFF',fontSize:30,fontWeight:'900'},bannerTitle:{color:'#FFF',fontWeight:'900',fontSize:17},bannerText:{color:'rgba(255,255,255,.88)',marginTop:2}});
