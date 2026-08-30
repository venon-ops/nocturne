import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BellIcon from "../components/BellIcon";
import CitySelector from "../components/CitySelector";
import { supabase } from "../lib/supabase";
import { ThemeColors, useAppTheme } from "../lib/theme";

type EventCard = {
  id: string;
  title: string;
  city: string;
  starts_at: string;
  cover_path: string | null;
  genre: string | null;
};
type PostCard = {
  id: string;
  artist_id: string;
  body: string;
  published_at: string;
  event_id: string | null;
};
type Artist = { display_name: string; avatar_path: string | null };
const shuffle = <T,>(values: T[]) =>
  values
    .map((value) => ({ value, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.value);
const coverUrl = (path: string | null) =>
  path
    ? supabase.storage.from("event-media").getPublicUrl(path).data.publicUrl
    : null;

export default function Home() {
  const { theme } = useAppTheme(),
    c = theme.colors,
    s = makeStyles(c),
    [events, setEvents] = useState<EventCard[]>([]),
    [posts, setPosts] = useState<PostCard[]>([]),
    [artists, setArtists] = useState<Record<string, Artist>>({}),
    [loading, setLoading] = useState(true),
    [signedIn, setSignedIn] = useState(false),
    [city, setCity] = useState<string | null>(null),
    [avatarUrl, setAvatarUrl] = useState<string | null>(null),
    [unread, setUnread] = useState(0);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const {
          data: { session },
        } = await supabase.auth.getSession(),
        user = session?.user;
      setSignedIn(Boolean(user));
      let profileCity: string | null = null;
      if (user) {
        const [{ data: profile }, { count }, { data: follows }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("city,avatar_path")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("notifications")
              .select("*", { count: "exact", head: true })
              .is("read_at", null),
            supabase
              .from("artist_follows")
              .select("artist_id")
              .eq("follower_id", user.id),
          ]);
        if (!mounted) return;
        profileCity = profile?.city ?? null;
        setCity(profileCity);
        setUnread(count ?? 0);
        setAvatarUrl(
          profile?.avatar_path
            ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path)
                .data.publicUrl
            : null,
        );
        const artistIds = (follows ?? []).map((item) => item.artist_id);
        if (artistIds.length) {
          const [{ data: followedPosts }, { data: artistProfiles }] =
            await Promise.all([
              supabase
                .from("feed_posts")
                .select("id,artist_id,body,published_at,event_id")
                .in("artist_id", artistIds)
                .is("deleted_at", null)
                .order("published_at", { ascending: false })
                .limit(20),
              supabase
                .from("profiles")
                .select("id,display_name,avatar_path")
                .in("id", artistIds),
            ]);
          setPosts((followedPosts ?? []) as PostCard[]);
          setArtists(
            Object.fromEntries(
              (artistProfiles ?? []).map((item) => [
                item.id,
                {
                  display_name: item.display_name,
                  avatar_path: item.avatar_path,
                },
              ]),
            ),
          );
        }
      }
      const { data: eventRows } = await supabase
        .from("events")
        .select("id,title,city,starts_at,cover_path,genre")
        .eq("status", "published")
        .gte("ends_at", new Date().toISOString())
        .limit(40);
      if (!mounted) return;
      const all = (eventRows ?? []) as EventCard[],
        local = profileCity
          ? all.filter(
              (event) =>
                event.city.toLocaleLowerCase("fr") ===
                profileCity!.toLocaleLowerCase("fr"),
            )
          : [],
        elsewhere = profileCity
          ? all.filter(
              (event) =>
                event.city.toLocaleLowerCase("fr") !==
                profileCity!.toLocaleLowerCase("fr"),
            )
          : all;
      setEvents([...shuffle(local), ...shuffle(elsewhere)].slice(0, 16));
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);
  const feed = useMemo(() => {
    const rows: Array<
      { kind: "event"; value: EventCard } | { kind: "post"; value: PostCard }
    > = [];
    const length = Math.max(events.length, posts.length);
    for (let index = 0; index < length; index++) {
      if (events[index]) rows.push({ kind: "event", value: events[index] });
      if (posts[index]) rows.push({ kind: "post", value: posts[index] });
    }
    return rows;
  }, [events, posts]);
  function selectCity(next: string) {
    setCity(next);
    setEvents((current) =>
      [...current].sort(
        (a, b) =>
          Number(
            b.city.toLocaleLowerCase("fr") === next.toLocaleLowerCase("fr"),
          ) -
          Number(
            a.city.toLocaleLowerCase("fr") === next.toLocaleLowerCase("fr"),
          ),
      ),
    );
  }
  return (
    <View style={s.page}>
      <StatusBar style={c.statusBar} />
      <View style={s.fixed}>
        <View style={s.head}>
          <CitySelector city={city} onChange={selectCity} />
          {signedIn ? (
            <View style={s.headActions}>
              <Link href="/notifications" asChild>
                <Pressable style={s.notification}>
                  <BellIcon color={c.text} />
                  {unread > 0 ? (
                    <Text style={s.notificationCount}>
                      {unread > 9 ? "9+" : unread}
                    </Text>
                  ) : null}
                </Pressable>
              </Link>
              <Link href="/profile" asChild>
                <Pressable style={s.avatar}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
                  ) : (
                    <Text style={s.avatarText}>MOI</Text>
                  )}
                </Pressable>
              </Link>
            </View>
          ) : (
            <Link href="/auth" style={s.login}>
              Se connecter
            </Link>
          )}
        </View>
        <Text style={s.eyebrow}>
          {city ? `AUTOUR DE ${city.toUpperCase()}` : "DÉCOUVRIR LA NUIT"}
        </Text>
        <Text style={s.title}>
          Ton fil<Text style={s.titleDot}>.</Text>
        </Text>
        <Text style={s.subtitle}>
          {signedIn
            ? "Les artistes que tu suis et des soirées à découvrir près de toi."
            : "Des soirées sélectionnées pour découvrir ce qui se passe autour de toi."}
        </Text>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        {loading ? (
          <ActivityIndicator color="#53F6D4" style={s.loading} />
        ) : (
          feed.map((item) =>
            item.kind === "event" ? (
              <Link
                href={{ pathname: "/event", params: { id: item.value.id } }}
                key={`event-${item.value.id}`}
                asChild
              >
                <Pressable style={s.eventCard}>
                  {coverUrl(item.value.cover_path) ? (
                    <Image
                      source={{ uri: coverUrl(item.value.cover_path)! }}
                      style={s.cover}
                    />
                  ) : (
                    <View style={s.coverFallback} />
                  )}
                  <View style={s.overlay} />
                  <View style={s.discovery}>
                    <Text>DÉCOUVERTE</Text>
                  </View>
                  <View style={s.eventInfo}>
                    <Text style={s.eventDate}>
                      {new Date(item.value.starts_at).toLocaleDateString(
                        "fr-FR",
                        {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}{" "}
                      · {item.value.city}
                    </Text>
                    <Text style={s.eventTitle}>{item.value.title}</Text>
                    {item.value.genre ? (
                      <Text style={s.genre}>{item.value.genre}</Text>
                    ) : null}
                  </View>
                </Pressable>
              </Link>
            ) : (
              <View style={s.postCard} key={`post-${item.value.id}`}>
                <View style={s.artistLine}>
                  {artists[item.value.artist_id]?.avatar_path ? (
                    <Image
                      source={{
                        uri: supabase.storage
                          .from("avatars")
                          .getPublicUrl(
                            artists[item.value.artist_id].avatar_path!,
                          ).data.publicUrl,
                      }}
                      style={s.artistAvatar}
                    />
                  ) : (
                    <View style={s.artistFallback} />
                  )}
                  <View>
                    <Text style={s.artistName}>
                      {artists[item.value.artist_id]?.display_name ||
                        "Artiste NOCTURNE"}
                    </Text>
                    <Text style={s.postDate}>
                      {new Date(item.value.published_at).toLocaleDateString(
                        "fr-FR",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </Text>
                  </View>
                </View>
                <Text style={s.postBody}>{item.value.body}</Text>
                {item.value.event_id ? (
                  <Link
                    href={{
                      pathname: "/event",
                      params: { id: item.value.event_id },
                    }}
                    style={s.eventLink}
                  >
                    Voir la soirée →
                  </Link>
                ) : null}
              </View>
            ),
          )
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    fixed: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    head: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    logo: {
      fontSize: 20,
      fontWeight: "900",
      color: c.text,
      letterSpacing: -1,
    },
    logoDot: { color: c.pink },
    login: { color: c.mint },
    notification: {
      position: "relative",
      width: 40,
      height: 40,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    notificationCount: {
      position: "absolute",
      top: -4,
      right: -4,
      minWidth: 17,
      height: 17,
      paddingTop: 3,
      borderRadius: 9,
      overflow: "hidden",
      backgroundColor: c.pink,
      color: "#FFF",
      fontSize: 8,
      fontWeight: "900",
      textAlign: "center",
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: c.violet,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarImage: { width: "100%", height: "100%" },
    avatarText: { color: c.onAccent, fontSize: 10, fontWeight: "900" },
    eyebrow: {
      color: c.mint,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.4,
      marginTop: 28,
    },
    title: {
      color: c.text,
      fontSize: 39,
      fontWeight: "900",
      letterSpacing: -2,
      marginTop: 6,
    },
    titleDot: { color: c.pink },
    subtitle: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 110 },
    loading: { marginTop: 60 },
    eventCard: {
      height: 250,
      borderRadius: 21,
      overflow: "hidden",
      marginBottom: 14,
      backgroundColor: c.surfaceRaised,
    },
    cover: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
    coverFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.surfaceMuted,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
    },
    discovery: {
      position: "absolute",
      top: 14,
      left: 14,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 7,
      backgroundColor: c.mint,
    },
    eventInfo: { position: "absolute", left: 17, right: 17, bottom: 17 },
    eventDate: {
      color: "#53F6D4",
      fontSize: 10,
      fontWeight: "900",
      textTransform: "capitalize",
    },
    eventTitle: {
      color: "#FFF",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 4,
    },
    genre: { color: "#D8D7E2", fontSize: 11, marginTop: 4 },
    postCard: {
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      backgroundColor: c.surface,
      marginBottom: 14,
    },
    artistLine: { flexDirection: "row", alignItems: "center", gap: 10 },
    artistAvatar: { width: 38, height: 38, borderRadius: 19 },
    artistFallback: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.violet,
    },
    artistName: { color: c.text, fontWeight: "900" },
    postDate: { color: c.textSubtle, fontSize: 9, marginTop: 3 },
    postBody: { color: c.text, fontSize: 14, lineHeight: 21, marginTop: 16 },
    eventLink: {
      color: c.mint,
      fontSize: 11,
      fontWeight: "900",
      marginTop: 16,
    },
  });
