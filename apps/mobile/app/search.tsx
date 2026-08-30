import { Link } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { ThemeColors, useAppTheme } from "../lib/theme";
type EventResult = {
  id: string;
  title: string;
  city: string;
  cover_path: string | null;
};
export default function Search() {
  const { theme } = useAppTheme(),
    c = theme.colors,
    s = makeStyles(c),
    [query, setQuery] = useState(""),
    [events, setEvents] = useState<EventResult[]>([]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void (async () => {
          let request = supabase
            .from("events")
            .select("id,title,city,cover_path")
            .eq("status", "published")
            .limit(30);
          if (query.trim())
            request = request.or(
              `title.ilike.%${query.trim()}%,city.ilike.%${query.trim()}%`,
            );
          const { data } = await request;
          setEvents((data ?? []) as EventResult[]);
        })(),
      250,
    );
    return () => clearTimeout(timer);
  }, [query]);
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.eyebrow}>EXPLORER</Text>
      <Text style={s.title}>Recherche.</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Soirée, ville…"
        placeholderTextColor={c.textSubtle}
        style={s.input}
      />
      {events.map((event) => (
        <Link
          key={event.id}
          href={{ pathname: "/event", params: { id: event.id } }}
          asChild
        >
          <Pressable style={s.result}>
            {event.cover_path ? (
              <Image
                source={{
                  uri: supabase.storage
                    .from("event-media")
                    .getPublicUrl(event.cover_path).data.publicUrl,
                }}
                style={s.image}
              />
            ) : (
              <View style={s.fallback} />
            )}
            <View>
              <Text style={s.name}>{event.title}</Text>
              <Text style={s.city}>{event.city}</Text>
            </View>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    content: { padding: 22, paddingTop: 65, paddingBottom: 110 },
    eyebrow: {
      color: c.mint,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
    },
    title: {
      color: c.text,
      fontSize: 38,
      fontWeight: "900",
      letterSpacing: -2,
      marginTop: 10,
    },
    input: {
      padding: 15,
      marginVertical: 22,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 14,
      backgroundColor: c.surface,
      color: c.text,
    },
    result: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    image: { width: 64, height: 64, borderRadius: 12 },
    fallback: {
      width: 64,
      height: 64,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
    },
    name: { color: c.text, fontWeight: "900" },
    city: { color: c.textMuted, fontSize: 11, marginTop: 5 },
  });
