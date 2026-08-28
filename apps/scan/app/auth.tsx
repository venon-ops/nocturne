import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [identifier,setIdentifier]=useState('');
  const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  async function login(){
    setLoading(true);setError('');
    const value=identifier.trim().toLowerCase();
    const email=value.includes('@')?value:`${value}@scan.nocturne.app`;
    const {data,error:authError}=await supabase.auth.signInWithPassword({email,password});
    if(authError||!data.user){setError('Connexion impossible.');setLoading(false);return}
    const {data:profile}=await supabase.from('profiles').select('role').eq('id',data.user.id).single();
    if(!profile||!['organizer','admin','scanner'].includes(profile.role)){await supabase.auth.signOut();setError('Ce compte ne peut pas utiliser le scanner.');setLoading(false);return}
    if(profile.role==='scanner'){const {data:account}=await supabase.from('scanner_accounts').select('active').eq('profile_id',data.user.id).maybeSingle();if(!account?.active){await supabase.auth.signOut();setError('Ce compte scanner est désactivé.');setLoading(false);return}await supabase.rpc('log_scanner_auth_event',{p_event:'login'})}
    router.replace('/');
  }

  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={16}><View style={s.content}><Text style={s.logo}>NOCTURNE<Text style={s.dot}>°</Text></Text><Text style={s.pro}>SCAN</Text><Text style={s.title}>Contrôle des entrées.</Text><TextInput style={s.input} autoCapitalize="none" placeholder="Identifiant ou e-mail" placeholderTextColor="#777C91" value={identifier} onChangeText={setIdentifier}/><TextInput style={s.input} secureTextEntry placeholder="Mot de passe" placeholderTextColor="#777C91" value={password} onChangeText={setPassword}/>{error?<Text style={s.error}>{error}</Text>:null}<Pressable style={s.button} disabled={loading} onPress={login}>{loading?<ActivityIndicator color="#080A14"/>:<Text style={s.buttonText}>Se connecter</Text>}</Pressable></View></KeyboardAvoidingView>;
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#080A14'},content:{flex:1,justifyContent:'center',paddingHorizontal:25,paddingTop:30,paddingBottom:120,transform:[{translateY:50}]},logo:{color:'#F8F7FF',fontSize:24,fontWeight:'900'},dot:{color:'#FF4D99'},pro:{color:'#53F6D4',fontWeight:'900',letterSpacing:4,marginTop:4},title:{color:'#F8F7FF',fontSize:34,fontWeight:'900',marginVertical:35},input:{borderWidth:1,borderColor:'#292D42',borderRadius:14,padding:16,color:'#F8F7FF',marginBottom:12},button:{backgroundColor:'#53F6D4',padding:17,borderRadius:14,alignItems:'center',marginTop:10},buttonText:{color:'#080A14',fontWeight:'900'},error:{color:'#FF6B83',marginVertical:5}});
