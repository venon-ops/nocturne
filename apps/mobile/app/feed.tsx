import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { ThemeColors, useAppTheme } from "../lib/theme";
type Post = {
  id: string;
  body: string;
  created_at: string;
  artist_pages: { name: string } | null;
};
export default function Feed() {
  const { theme } = useAppTheme(),
    s = makeStyles(theme.colors),
    [posts, setPosts] = useState<Post[]>([]),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }
      const { data } = await supabase
        .from("feed_posts")
        .select("id,body,created_at,artist_pages(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      setPosts((data ?? []) as unknown as Post[]);
      setLoading(false);
    })();
  }, []);
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <Text style={s.eyebrow}>POUR TOI</Text>
      <Text style={s.title}>Fil d’actualité.</Text>
      {loading ? (
        <ActivityIndicator color="#53F6D4" />
      ) : !posts.length ? (
        <Text style={s.empty}>
          Les actualités des artistes que tu suis apparaîtront ici.
        </Text>
      ) : (
        posts.map((post) => (
          <View style={s.card} key={post.id}>
            <Text style={s.artist}>
              {post.artist_pages?.name ?? "NOCTURNE"}
            </Text>
            <Text style={s.body}>{post.body}</Text>
            <Text style={s.date}>
              {new Date(post.created_at).toLocaleString("fr-FR")}
            </Text>
          </View>
        ))
      )}
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
      marginBottom: 25,
    },
    empty: { color: c.textMuted, lineHeight: 20 },
    card: {
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 17,
      backgroundColor: c.surface,
      marginBottom: 12,
    },
    artist: { color: c.violet, fontWeight: "900" },
    body: { color: c.text, lineHeight: 21, marginTop: 10 },
    date: { color: c.textSubtle, fontSize: 9, marginTop: 12 },
  });
