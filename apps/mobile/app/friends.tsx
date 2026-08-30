import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import RoundBackButton from "../components/RoundBackButton";
import { supabase } from "../lib/supabase";
import { ThemeColors, useAppTheme } from "../lib/theme";
type Person = {
  id: string;
  display_name: string;
  username: string | null;
  avatar_path: string | null;
};
export default function FriendsPage() {
  const { theme } = useAppTheme(),
    c = theme.colors,
    s = makeStyles(c),
    [query, setQuery] = useState(""),
    [people, setPeople] = useState<Person[]>([]),
    [sent, setSent] = useState(new Set<string>()),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void (async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          let request = supabase
            .from("profiles")
            .select("id,display_name,username,avatar_path")
            .neq("id", user?.id ?? "")
            .limit(30);
          if (query.trim())
            request = request.or(
              `display_name.ilike.%${query.trim()}%,username.ilike.%${query.trim()}%`,
            );
          const { data } = await request;
          setPeople((data ?? []) as Person[]);
          setLoading(false);
        })(),
      220,
    );
    return () => clearTimeout(timer);
  }, [query]);
  async function add(id: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("user_friendships")
      .insert({ requester_id: user.id, addressee_id: id });
    if (!error) setSent((current) => new Set(current).add(id));
  }
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <RoundBackButton />
      <Text style={s.eyebrow}>COMMUNAUTÉ</Text>
      <Text style={s.title}>Ajouter des amis.</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Nom ou pseudo"
        placeholderTextColor={c.textSubtle}
        style={s.input}
      />
      {loading ? (
        <ActivityIndicator color={c.mint} />
      ) : (
        people.map((person) => {
          const avatar = person.avatar_path
              ? supabase.storage
                  .from("avatars")
                  .getPublicUrl(person.avatar_path).data.publicUrl
              : null,
            done = sent.has(person.id);
          return (
            <View style={s.person} key={person.id}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={s.avatar} />
              ) : (
                <View style={s.avatarFallback}>
                  <Text style={s.avatarLetter}>
                    {(person.display_name || "?")[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={s.personCopy}>
                <Text style={s.personName}>
                  {person.display_name || "Membre NOCTURNE"}
                </Text>
                <Text style={s.handle}>
                  {person.username ? `@${person.username}` : "Profil membre"}
                </Text>
              </View>
              <Pressable
                disabled={done}
                onPress={() => void add(person.id)}
                style={[s.add, done && s.added]}
              >
                <Text style={s.addText}>{done ? "Envoyée" : "Ajouter"}</Text>
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    content: { padding: 22, paddingTop: 60, paddingBottom: 50 },
    eyebrow: {
      color: c.mint,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
      marginTop: 36,
    },
    title: {
      color: c.text,
      fontSize: 34,
      fontWeight: "900",
      letterSpacing: -1.8,
      marginTop: 9,
    },
    input: {
      marginVertical: 22,
      padding: 15,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 15,
      backgroundColor: c.surface,
      color: c.text,
    },
    person: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarFallback: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.violet,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarLetter: { color: c.onAccent, fontWeight: "900" },
    personCopy: { flex: 1 },
    personName: { color: c.text, fontWeight: "900" },
    handle: { color: c.textMuted, fontSize: 10, marginTop: 3 },
    add: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: c.mint,
    },
    added: { opacity: 0.5 },
    addText: { color: c.onAccent, fontSize: 10, fontWeight: "900" },
  });
