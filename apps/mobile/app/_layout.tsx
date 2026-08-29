import { Stack } from 'expo-router';
import {View} from 'react-native';
import MobileTabBar from '../components/MobileTabBar';
export default function Layout(){ return <View style={{flex:1,backgroundColor:'#080A14'}}><Stack screenOptions={{ headerShown:false, contentStyle:{backgroundColor:'#080A14'}, animation:'fade', animationDuration:220, gestureEnabled:true }}><Stack.Screen name="index"/><Stack.Screen name="feed"/><Stack.Screen name="search"/><Stack.Screen name="auth"/><Stack.Screen name="event"/><Stack.Screen name="ticket"/><Stack.Screen name="notifications"/><Stack.Screen name="profile"/></Stack><MobileTabBar/></View> }
