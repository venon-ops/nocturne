import {router,Stack} from 'expo-router';
import * as Notifications from 'expo-notifications';
import {useEffect} from 'react';
import {View} from 'react-native';
import MobileTabBar from '../components/MobileTabBar';
import {registerPushNotifications} from '../lib/pushNotifications';
import {supabase} from '../lib/supabase';

function openNotification(response:Notifications.NotificationResponse){const data=response.notification.request.content.data,eventId=typeof data.eventId==='string'?data.eventId:null,route=typeof data.route==='string'?data.route:null;if(eventId)router.push({pathname:'/event',params:{id:eventId}});else if(route==='/ticket')router.push('/ticket');else router.push('/notifications')}

export default function Layout(){useEffect(()=>{void registerPushNotifications();const auth=supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN')void registerPushNotifications()}),response=Notifications.addNotificationResponseReceivedListener(openNotification);void Notifications.getLastNotificationResponseAsync().then(value=>{if(value)openNotification(value)});return()=>{auth.data.subscription.unsubscribe();response.remove()}},[]);return <View style={{flex:1,backgroundColor:'#080A14'}}><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#080A14'},animation:'fade',animationDuration:220,gestureEnabled:true}}><Stack.Screen name="index"/><Stack.Screen name="upcoming"/><Stack.Screen name="feed"/><Stack.Screen name="search"/><Stack.Screen name="auth"/><Stack.Screen name="event"/><Stack.Screen name="ticket"/><Stack.Screen name="notifications"/><Stack.Screen name="profile"/></Stack><MobileTabBar/></View>}
