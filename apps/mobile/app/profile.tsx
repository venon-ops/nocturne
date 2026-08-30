import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import RoundBackButton from "../components/RoundBackButton";
import GearIcon from "../components/GearIcon";
import UserPlusIcon from "../components/UserPlusIcon";
import { ThemeColors, useAppTheme } from "../lib/theme";
type Profile = {
  display_name: string;
  username: string | null;
  city: string | null;
  bio: string | null;
  avatar_path: string | null;
  preferred_genres: string[];
};
type ProfileEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  city: string;
  cover_path: string | null;
};
const partyTime = (minutes: number) => {
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60);
  return `${days} j ${hours} h`;
};
export default function ProfilePage() {
  const { theme } = useAppTheme(),
    s = makeStyles(theme.colors),
    [profile, setProfile] = useState<Profile | null>(null),
    [stats, setStats] = useState({
      followers: 0,
      following: 0,
      parties: 0,
      friends: 0,
      partyMinutes: 0,
    }),
    [interested, setInterested] = useState<ProfileEvent[]>([]),
    [memories, setMemories] = useState<ProfileEvent[]>([]),
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
      const [
        { data },
        { data: ticketData },
        { data: interestData },
        { count: followers },
        { count: following },
        { count: friends },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name,username,city,bio,avatar_path,preferred_genres")
          .eq("id", user.id)
          .single(),
        supabase
          .from("tickets")
          .select(
            "status,events(id,title,starts_at,ends_at,city,cover_path),orders!inner(buyer_id)",
          )
          .eq("orders.buyer_id", user.id),
        supabase
          .from("event_interests")
          .select("events(id,title,starts_at,ends_at,city,cover_path)")
          .eq("user_id", user.id),
        supabase
          .from("artist_follows")
          .select("*", { count: "exact", head: true })
          .eq("artist_id", user.id),
        supabase
          .from("artist_follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", user.id),
        supabase
          .from("user_friendships")
          .select("*", { count: "exact", head: true })
          .eq("status", "accepted")
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      ]);
      setProfile(data as Profile);
      const ticketRows = (ticketData ?? []) as unknown as Array<{
          status: string;
          events: ProfileEvent | null;
        }>,
        now = Date.now(),
        completed = [
          ...new Map(
            ticketRows
              .filter(
                (row) =>
                  row.events &&
                  (row.status === "used" ||
                    new Date(
                      row.events.ends_at ?? row.events.starts_at,
                    ).getTime() < now),
              )
              .map((row) => [row.events!.id, row.events!]),
          ).values(),
        ],
        minutes = completed.reduce(
          (sum, event) =>
            sum +
            Math.max(
              0,
              (new Date(event.ends_at ?? event.starts_at).getTime() -
                new Date(event.starts_at).getTime()) /
                60000,
            ),
          0,
        );
      setStats({
        followers: followers ?? 0,
        following: following ?? 0,
        parties: completed.length,
        friends: friends ?? 0,
        partyMinutes: Math.round(minutes),
      });
      setMemories(
        completed.sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
      );
      setInterested(
        (
          (interestData ?? []) as unknown as Array<{
            events: ProfileEvent | null;
          }>
        )
          .map((row) => row.events)
          .filter((event): event is ProfileEvent =>
            Boolean(event && new Date(event.starts_at).getTime() > now),
          )
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      );
      setLoading(false);
    })();
  }, []);
  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator color={theme.colors.mint} />
      </View>
    );
  const avatar = profile?.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data
        .publicUrl
    : null;
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <View style={s.topbar}>
        <RoundBackButton />
        <Pressable
          accessibilityLabel="Paramètres"
          style={s.settings}
          onPress={() => router.push("/settings")}
        >
          <GearIcon color={theme.colors.text} />
        </Pressable>
      </View>
      <View style={s.identity}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.avatar} />
        ) : (
          <View style={s.avatarFallback}>
            <Text style={s.avatarLetter}>
              {(profile?.display_name || "M")[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={s.identityCopy}>
          <Text style={s.name}>{profile?.display_name || "Mon profil"}</Text>
          <Text style={s.handle}>
            {profile?.username ? `@${profile.username}` : "Profil NOCTURNE"}
            {profile?.city ? ` · ${profile.city}` : ""}
          </Text>
          {profile?.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}
        </View>
      </View>
      <View style={s.favoriteGenres}>
        {(profile?.preferred_genres ?? []).slice(0, 3).map((value) => (
          <Text style={s.genre} key={value}>
            {value}
          </Text>
        ))}
      </View>
      <View style={s.stats}>
        <View>
          <Text style={s.stat}>{stats.followers}</Text>
          <Text style={s.statLabel}>Abonnés</Text>
        </View>
        <View>
          <Text style={s.stat}>{stats.following}</Text>
          <Text style={s.statLabel}>Abonnements</Text>
        </View>
        <View>
          <Text style={s.stat}>{stats.parties}</Text>
          <Text style={s.statLabel}>Soirées faites</Text>
        </View>
      </View>
      <View style={s.actions}>
        <Pressable style={s.edit} onPress={() => router.push("/edit-profile")}>
          <Text style={s.editText}>Modifier le profil</Text>
        </Pressable>
        <Pressable style={s.friend} onPress={() => router.push("/friends")}>
          <UserPlusIcon color={theme.colors.text} />
          <Text style={s.friendText}>Ajouter des amis</Text>
        </Pressable>
      </View>
      <Text style={s.heading}>Ça m’intéresse</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.horizontal}
      >
        {interested.length ? (
          interested.map((event) => (
            <Pressable
              key={event.id}
              style={s.eventMini}
              onPress={() =>
                router.push({ pathname: "/event", params: { id: event.id } })
              }
            >
              {event.cover_path ? (
                <Image
                  source={{
                    uri: supabase.storage
                      .from("event-media")
                      .getPublicUrl(event.cover_path).data.publicUrl,
                  }}
                  style={s.eventCover}
                />
              ) : (
                <View style={s.eventFallback} />
              )}
              <Text numberOfLines={2} style={s.eventName}>
                {event.title}
              </Text>
              <Text style={s.eventMeta}>{event.city}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={s.empty}>Tes coups de cœur apparaîtront ici.</Text>
        )}
      </ScrollView>
      <Text style={s.heading}>Albums</Text>
      <View style={s.albums}>
        <View style={s.album}>
          <Text style={s.albumNumber}>{stats.parties}</Text>
          <Text style={s.albumTitle}>Artistes vus</Text>
        </View>
        <View style={s.album}>
          <Text style={s.albumNumber}>
            {new Set(memories.map((event) => event.city)).size}
          </Text>
          <Text style={s.albumTitle}>Lieux visités</Text>
        </View>
      </View>
      <Text style={s.heading}>Stats</Text>
      <View style={s.bigStats}>
        <View style={s.bigStatCard}>
          <Text style={s.bigStat}>{stats.friends}</Text>
          <Text style={s.statLabel}>Amis</Text>
        </View>
        <View style={s.bigStatCard}>
          <Text style={s.bigStat}>{partyTime(stats.partyMinutes)}</Text>
          <Text style={s.statLabel}>Party Time</Text>
        </View>
      </View>
      <Text style={s.heading}>Souvenirs</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.horizontal}
      >
        {memories.length ? (
          memories.map((event) => (
            <Pressable
              key={event.id}
              style={s.memory}
              onPress={() =>
                router.push({ pathname: "/event", params: { id: event.id } })
              }
            >
              {event.cover_path ? (
                <Image
                  source={{
                    uri: supabase.storage
                      .from("event-media")
                      .getPublicUrl(event.cover_path).data.publicUrl,
                  }}
                  style={s.memoryCover}
                />
              ) : (
                <View style={s.eventFallback} />
              )}
              <Text numberOfLines={2} style={s.eventName}>
                {event.title}
              </Text>
              <Text style={s.eventMeta}>
                {new Date(event.starts_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={s.empty}>
            Tes anciennes soirées deviendront tes souvenirs.
          </Text>
        )}
      </ScrollView>
      <Pressable
        style={s.logout}
        onPress={async () => {
          await supabase.auth.signOut();
          router.replace("/");
        }}
      >
        <Text style={s.logoutText}>Se déconnecter</Text>
      </Pressable>
    </ScrollView>
  );
}
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    content: { padding: 22, paddingTop: 58, paddingBottom: 46 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
    },
    back: { color: c.textMuted },
    topbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    settings: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    identity: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      marginTop: 25,
    },
    identityCopy: { flex: 1 },
    avatar: {
      width: 82,
      height: 82,
      borderRadius: 41,
      borderWidth: 2,
      borderColor: c.violet,
    },
    avatarFallback: {
      width: 82,
      height: 82,
      borderRadius: 41,
      backgroundColor: c.violet,
      borderWidth: 2,
      borderColor: c.mint,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarLetter: { fontSize: 34, fontWeight: "900", color: c.onAccent },
    name: { color: c.text, fontSize: 25, fontWeight: "900" },
    handle: { color: c.mint, fontSize: 11, marginTop: 5 },
    bio: {
      color: c.textMuted,
      textAlign: "left",
      lineHeight: 20,
      marginTop: 14,
    },
    favoriteGenres: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 16,
    },
    genre: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: c.violet,
      borderRadius: 999,
      overflow: "hidden",
      color: c.violet,
      fontSize: 9,
      fontWeight: "900",
    },
    stats: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingVertical: 16,
      paddingHorizontal: 10,
      marginTop: 21,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 18,
      backgroundColor: c.surface,
    },
    stat: {
      color: c.text,
      fontSize: 22,
      fontWeight: "900",
      textAlign: "center",
    },
    statLabel: { color: c.textMuted, fontSize: 10, marginTop: 4 },
    actions: {
      flexDirection: "row",
      gap: 9,
      marginTop: 18,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    edit: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      backgroundColor: c.mint,
      alignItems: "center",
      justifyContent: "center",
    },
    editText: { color: c.onAccent, fontWeight: "900", fontSize: 11 },
    friend: {
      flex: 1,
      height: 46,
      flexDirection: "row",
      gap: 7,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    friendText: { color: c.text, fontWeight: "900", fontSize: 11 },
    heading: {
      color: c.text,
      fontSize: 18,
      fontWeight: "900",
      marginTop: 26,
      marginBottom: 11,
    },
    horizontal: { gap: 11, paddingRight: 22 },
    eventMini: {
      width: 145,
      paddingBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: c.surface,
    },
    eventCover: { width: "100%", height: 96 },
    eventFallback: {
      width: "100%",
      height: 96,
      backgroundColor: c.surfaceMuted,
    },
    eventName: {
      color: c.text,
      fontWeight: "900",
      fontSize: 11,
      lineHeight: 15,
      marginHorizontal: 10,
      marginTop: 9,
    },
    eventMeta: {
      color: c.textMuted,
      fontSize: 9,
      marginHorizontal: 10,
      marginTop: 4,
    },
    empty: { color: c.textMuted, fontSize: 11, paddingVertical: 18 },
    albums: { flexDirection: "row", gap: 10 },
    album: {
      flex: 1,
      minHeight: 108,
      padding: 15,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 18,
      backgroundColor: c.surface,
    },
    albumNumber: { color: c.violet, fontSize: 30, fontWeight: "900" },
    albumTitle: { color: c.text, fontWeight: "900", marginTop: 7 },
    bigStats: { flexDirection: "row", gap: 10 },
    bigStatCard: {
      flex: 1,
      minHeight: 82,
      padding: 15,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    bigStat: {
      color: c.text,
      fontSize: 22,
      fontWeight: "900",
      textAlign: "center",
    },
    memory: {
      width: 190,
      paddingBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: c.surface,
    },
    memoryCover: { width: "100%", height: 118 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 17,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowTitle: { color: c.text, fontWeight: "800" },
    rowValue: {
      maxWidth: "55%",
      color: c.textMuted,
      fontSize: 11,
      textAlign: "right",
    },
    logout: {
      padding: 16,
      marginTop: 34,
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 14,
      alignItems: "center",
    },
    logoutText: { color: c.danger, fontWeight: "900" },
  });
