import { Stack } from 'expo-router';
export default function Layout(){ return <Stack screenOptions={{ headerShown:false, contentStyle:{backgroundColor:'#080A14'} }}><Stack.Screen name="index"/><Stack.Screen name="auth"/><Stack.Screen name="ticket"/></Stack> }
