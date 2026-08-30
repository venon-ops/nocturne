import { router, Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { View } from "react-native";
import MobileTabBar from "../components/MobileTabBar";
import { registerPushNotifications } from "../lib/pushNotifications";
import { supabase } from "../lib/supabase";
import { ThemeProvider, useAppTheme } from "../lib/theme";

function openNotification(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data,
    eventId = typeof data.eventId === "string" ? data.eventId : null,
    route = typeof data.route === "string" ? data.route : null;
  if (eventId) router.push({ pathname: "/event", params: { id: eventId } });
  else if (route === "/ticket") router.push("/ticket");
  else router.push("/notifications");
}

function ThemedLayout() {
  const { theme } = useAppTheme(),
    c = theme.colors;
  useEffect(() => {
    void registerPushNotifications();
    const auth = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") void registerPushNotifications();
      }),
      response =
        Notifications.addNotificationResponseReceivedListener(openNotification);
    void Notifications.getLastNotificationResponseAsync().then((value) => {
      if (value) openNotification(value);
    });
    return () => {
      auth.data.subscription.unsubscribe();
      response.remove();
    };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
          animation: "fade",
          animationDuration: 220,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="upcoming" />
        <Stack.Screen name="feed" />
        <Stack.Screen name="search" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="event" />
        <Stack.Screen name="ticket" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="edit-profile" />
      </Stack>
      <MobileTabBar />
    </View>
  );
}
export default function Layout() {
  return (
    <ThemeProvider>
      <ThemedLayout />
    </ThemeProvider>
  );
}
