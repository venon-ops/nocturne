import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import {supabase} from './supabase';

Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:true})});

export async function registerPushNotifications(){
 if(Constants.appOwnership==='expo')return;
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return;
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('nocturne',{name:'NOCTURNE',importance:Notifications.AndroidImportance.HIGH,vibrationPattern:[0,180,120,180],lightColor:'#53F6D4'});
 let permission=(await Notifications.getPermissionsAsync()).status;
 if(permission!=='granted')permission=(await Notifications.requestPermissionsAsync()).status;
 if(permission!=='granted')return;
 const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
 if(!projectId)return;
 const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 await supabase.rpc('register_expo_push_token',{p_token:token,p_platform:Platform.OS});
}
