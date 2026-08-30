import { router } from "expo-router";
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
import Svg, { Path } from "react-native-svg";
import CitySelector from "../components/CitySelector";
import UpcomingFilters, {
  type DateFilter,
} from "../components/UpcomingFilters";
import { supabase } from "../lib/supabase";
import { ThemeColors, useAppTheme } from "../lib/theme";

type EventRow = {
  id: string;
  title: string;
  city: string;
  address: string | null;
  genre: string | null;
  starts_at: string;
  cover_path: string | null;
  ticket_types: { price_cents: number }[];
};

export default function Upcoming() {
  const { theme } = useAppTheme(),
    s = makeStyles(theme.colors),
    [events, setEvents] = useState<EventRow[]>([]),
    [city, setCity] = useState<string | null>(null),
    [dateFilter, setDateFilter] = useState<DateFilter>("all"),
    [genre, setGenre] = useState<string | null>(null),
    [price, setPrice] = useState<number | null>(null),
    [liked, setLiked] = useState<Set<string>>(new Set()),
    [userId, setUserId] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      const [
        { data },
        {
          data: { user },
        },
      ] = await Promise.all([
        supabase
          .from("events")
          .select(
            "id,title,city,address,genre,starts_at,cover_path,ticket_types(price_cents)",
          )
          .eq("status", "published")
          .gte("ends_at", new Date().toISOString())
          .order("starts_at")
          .limit(50),
        supabase.auth.getUser(),
      ]);
      if (user) {
        setUserId(user.id);
        const [{ data: profile }, { data: interests }] = await Promise.all([
          supabase
            .from("profiles")
            .select("city")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("event_interests")
            .select("event_id")
            .eq("user_id", user.id),
        ]);
        setCity(profile?.city ?? null);
        setLiked(new Set((interests ?? []).map((item) => item.event_id)));
      }
      setEvents((data ?? []) as EventRow[]);
      setLoading(false);
    })();
  }, []);
  const genres = useMemo(
    () =>
      [...new Set(events.flatMap((event) => genreParts(event.genre)))].sort(
        (a, b) => a.localeCompare(b, "fr"),
      ),
    [events],
  );
  const visible = useMemo(() => {
    const now = new Date(),
      todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const weekendStart = new Date(todayStart),
      day = todayStart.getDay();
    weekendStart.setDate(
      weekendStart.getDate() + (day === 0 ? -1 : (6 - day + 7) % 7),
    );
    const weekendEnd = new Date(weekendStart);
    weekendEnd.setDate(weekendEnd.getDate() + 2);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return events.filter((event) => {
      const starts = new Date(event.starts_at),
        minimum = Math.min(
          ...event.ticket_types.map((ticket) => ticket.price_cents),
        );
      if (
        city &&
        event.city.toLocaleLowerCase("fr") !== city.toLocaleLowerCase("fr")
      )
        return false;
      if (genre && !genreParts(event.genre).includes(genre)) return false;
      if (price !== null && (!Number.isFinite(minimum) || minimum > price))
        return false;
      if (dateFilter === "today" && (starts < todayStart || starts >= todayEnd))
        return false;
      if (
        dateFilter === "weekend" &&
        (starts < weekendStart || starts >= weekendEnd)
      )
        return false;
      if (dateFilter === "week" && (starts < now || starts > weekEnd))
        return false;
      return true;
    });
  }, [city, dateFilter, events, genre, price]);
  async function toggleLike(eventId: string) {
    if (!userId) {
      router.push("/auth");
      return;
    }
    const selected = liked.has(eventId);
    setLiked((current) => {
      const next = new Set(current);
      selected ? next.delete(eventId) : next.add(eventId);
      return next;
    });
    const { error } = selected
      ? await supabase
          .from("event_interests")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", userId)
      : await supabase
          .from("event_interests")
          .insert({ event_id: eventId, user_id: userId });
    if (error)
      setLiked((current) => {
        const next = new Set(current);
        selected ? next.add(eventId) : next.delete(eventId);
        return next;
      });
  }
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <View style={s.filterBar}>
        <CitySelector city={city} onChange={setCity} />
        <View style={s.filterScroller}>
          <UpcomingFilters
            date={dateFilter}
            genre={genre}
            price={price}
            genres={genres}
            onDate={setDateFilter}
            onGenre={setGenre}
            onPrice={setPrice}
          />
        </View>
      </View>
      <Text style={s.eyebrow}>AGENDA</Text>
      <Text style={s.title}>À venir.</Text>
      <Text style={s.intro}>
        {city
          ? `Les prochaines soirées à ${city}, dans l’ordre.`
          : "Toutes les prochaines soirées, dans l’ordre."}
      </Text>
      {loading ? (
        <ActivityIndicator color="#53F6D4" style={s.loading} />
      ) : !visible.length ? (
        <Text style={s.empty}>Aucune soirée ne correspond à ces filtres.</Text>
      ) : (
        visible.map((event) => (
          <EventListItem
            key={event.id}
            event={event}
            liked={liked.has(event.id)}
            onLike={() => void toggleLike(event.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

function EventListItem({
  event,
  liked,
  onLike,
}: {
  event: EventRow;
  liked: boolean;
  onLike: () => void;
}) {
  const { theme } = useAppTheme(),
    s = makeStyles(theme.colors),
    cover = event.cover_path
      ? supabase.storage.from("event-media").getPublicUrl(event.cover_path).data
          .publicUrl
      : null,
    minimum = Math.min(
      ...event.ticket_types.map((ticket) => ticket.price_cents),
    ),
    genres = genreParts(event.genre);
  return (
    <View style={s.card}>
      <Pressable
        style={s.cardMain}
        onPress={() =>
          router.push({ pathname: "/event", params: { id: event.id } })
        }
      >
        {cover ? (
          <Image source={{ uri: cover }} style={s.image} />
        ) : (
          <View style={s.fallback} />
        )}
        <View style={s.info}>
          <Text numberOfLines={2} style={s.name}>
            {event.title}
          </Text>
          <Text style={s.details}>
            {new Date(event.starts_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {Number.isFinite(minimum)
              ? ` · Dès ${(minimum / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
              : ""}
          </Text>
          <Text numberOfLines={1} style={s.place}>
            {event.address || event.city}
          </Text>
          {genres.length ? (
            <View style={s.genres}>
              {genres.slice(0, 3).map((value) => (
                <Text key={value} style={s.genre}>
                  {value}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={
          liked ? "Retirer des favoris" : "Ajouter aux favoris"
        }
        hitSlop={10}
        style={s.like}
        onPress={onLike}
      >
        <Svg width={23} height={23} viewBox="0 0 24 24">
          <Path
            d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.4a5.5 5.5 0 0 0-.1-7.8Z"
            fill={liked ? "#FF4D99" : "none"}
            stroke={liked ? "#FF4D99" : "#8D92A6"}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
    </View>
  );
}
function genreParts(value: string | null) {
  return (
    value
      ?.split(/[,/·]+/)
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 110 },
    filterBar: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    filterScroller: { flex: 1, minWidth: 0 },
    eyebrow: {
      color: c.mint,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
      marginTop: 27,
    },
    title: {
      color: c.text,
      fontSize: 40,
      fontWeight: "900",
      letterSpacing: -2,
      marginTop: 10,
    },
    intro: { color: c.textMuted, marginTop: 6, marginBottom: 20 },
    loading: { marginTop: 50 },
    empty: { color: c.textMuted, textAlign: "center", paddingVertical: 45 },
    card: {
      minHeight: 122,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    cardMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 7,
    },
    image: {
      width: 88,
      height: 110,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
    },
    fallback: {
      width: 88,
      height: 110,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
    },
    info: { flex: 1, minWidth: 0, paddingVertical: 4 },
    name: { color: c.text, fontSize: 15, fontWeight: "900", lineHeight: 19 },
    details: { color: c.text, fontSize: 11, fontWeight: "800", marginTop: 8 },
    place: { color: c.textMuted, fontSize: 10, marginTop: 5 },
    genres: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 9 },
    genre: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 9,
      overflow: "hidden",
      color: c.textMuted,
      fontSize: 8,
      fontWeight: "800",
    },
    like: {
      width: 38,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
    },
  });
