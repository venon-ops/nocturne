import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
type Links = {
  instagram?: string;
  tiktok?: string;
  soundcloud?: string;
  deezer?: string;
};
export default function EditProfilePage() {
  const { theme } = useAppTheme(),
    c = theme.colors,
    s = makeStyles(c),
    [bio, setBio] = useState(""),
    [genres, setGenres] = useState(""),
    [links, setLinks] = useState<Links>({}),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("bio,preferred_genres,social_links")
        .eq("id", user.id)
        .single();
      setBio(data?.bio ?? "");
      setGenres((data?.preferred_genres ?? []).join(", "));
      setLinks((data?.social_links ?? {}) as Links);
      setLoading(false);
    })();
  }, []);
  async function save() {
    setSaving(true);
    const {
        data: { user },
      } = await supabase.auth.getUser(),
      preferred = genres
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 20);
    const { error } = user
      ? await supabase
          .from("profiles")
          .update({
            bio: bio.trim() || null,
            preferred_genres: preferred,
            social_links: links,
          })
          .eq("id", user.id)
      : { error: new Error("Non connecté") };
    setSaving(false);
    Alert.alert(
      error ? "Impossible d’enregistrer" : "Profil mis à jour",
      error?.message ?? "Tes informations sont enregistrées.",
    );
  }
  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator color={c.mint} />
      </View>
    );
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <RoundBackButton />
      <Text style={s.eyebrow}>MODIFIER</Text>
      <Text style={s.title}>Mon profil.</Text>
      <Text style={s.intro}>
        Bio, styles favoris et réseaux visibles sur ton profil.
      </Text>
      <Text style={s.label}>Bio</Text>
      <TextInput
        multiline
        maxLength={300}
        value={bio}
        onChangeText={setBio}
        placeholder="Parle de tes nuits…"
        placeholderTextColor={c.textSubtle}
        style={[s.input, s.bio]}
      />
      <Text style={s.label}>3 styles préférés</Text>
      <TextInput
        value={genres}
        onChangeText={setGenres}
        placeholder="House, Techno, Disco"
        placeholderTextColor={c.textSubtle}
        style={s.input}
      />
      <Text style={s.help}>
        Sépare les styles par des virgules. Les trois premiers apparaissent en
        haut du profil.
      </Text>
      {(["instagram", "tiktok", "soundcloud", "deezer"] as const).map(
        (name) => (
          <View key={name}>
            <Text style={s.label}>{name[0].toUpperCase() + name.slice(1)}</Text>
            <TextInput
              autoCapitalize="none"
              value={links[name] ?? ""}
              onChangeText={(value) =>
                setLinks((current) => ({ ...current, [name]: value }))
              }
              placeholder={`Lien ${name}`}
              placeholderTextColor={c.textSubtle}
              style={s.input}
            />
          </View>
        ),
      )}
      <Pressable disabled={saving} style={s.save} onPress={() => void save()}>
        <Text style={s.saveText}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    content: { padding: 22, paddingTop: 60, paddingBottom: 50 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
    },
    eyebrow: {
      color: c.mint,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
      marginTop: 36,
    },
    title: {
      color: c.text,
      fontSize: 38,
      fontWeight: "900",
      letterSpacing: -2,
      marginTop: 9,
    },
    intro: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 7,
      marginBottom: 22,
    },
    label: {
      color: c.text,
      fontSize: 11,
      fontWeight: "900",
      marginTop: 15,
      marginBottom: 7,
    },
    input: {
      padding: 14,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 14,
      backgroundColor: c.surface,
      color: c.text,
    },
    bio: { minHeight: 100, textAlignVertical: "top" },
    help: { color: c.textMuted, fontSize: 9, lineHeight: 14, marginTop: 7 },
    save: {
      padding: 16,
      borderRadius: 15,
      backgroundColor: c.mint,
      alignItems: "center",
      marginTop: 25,
    },
    saveText: { color: c.onAccent, fontWeight: "900" },
  });
