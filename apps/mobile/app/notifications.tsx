import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import RoundBackButton from "../components/RoundBackButton";
import { ThemeColors, useAppTheme } from "../lib/theme";
type Item = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};
const label = (item: Item) =>
  item.type === "ticket_resold"
    ? [
        "Billet revendu",
        `Ton remboursement de ${((Number(item.payload.refund_cents) || 0) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} est en cours.`,
      ]
    : item.type === "waitlist_batch_available"
      ? ["Billets disponibles", "Ton lot est réservé pendant 30 minutes."]
      : item.type === "waitlist_payment_action_required"
        ? [
            "Paiement à confirmer",
            "Ta banque demande une confirmation supplémentaire.",
          ]
        : ["Notification NOCTURNE", "Une nouvelle information est disponible."];
export default function Notifications() {
  const { theme } = useAppTheme(),
    c = theme.colors,
    s = makeStyles(c),
    [items, setItems] = useState<Item[]>([]),
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
        .from("notifications")
        .select("id,type,payload,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      setItems((data ?? []) as Item[]);
      setLoading(false);
    })();
  }, []);
  async function read(id: string) {
    const now = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: now }).eq("id", id);
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read_at: now } : item,
      ),
    );
  }
  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator color={c.mint} />
      </View>
    );
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <RoundBackButton />
      <Text style={s.eyebrow}>MON ESPACE</Text>
      <Text style={s.title}>Notifications.</Text>
      {!items.length ? (
        <Text style={s.empty}>Aucune notification pour le moment.</Text>
      ) : (
        items.map((item) => {
          const [title, body] = label(item);
          return (
            <Pressable
              key={item.id}
              style={[s.card, item.read_at && s.read]}
              onPress={() => void read(item.id)}
            >
              <View style={s.cardHead}>
                <Text style={s.cardTitle}>{title}</Text>
                {!item.read_at ? <Text style={s.new}>NOUVELLE</Text> : null}
              </View>
              <Text style={s.body}>{body}</Text>
              <Text style={s.date}>
                {new Date(item.created_at).toLocaleString("fr-FR")}
              </Text>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    content: { padding: 22, paddingTop: 64, paddingBottom: 50 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
    },
    back: { color: c.textMuted },
    eyebrow: {
      color: c.mint,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
      marginTop: 40,
    },
    title: {
      color: c.text,
      fontSize: 38,
      fontWeight: "900",
      letterSpacing: -2,
      marginTop: 10,
      marginBottom: 20,
    },
    empty: { color: c.textMuted, padding: 35, textAlign: "center" },
    card: {
      padding: 17,
      borderWidth: 1,
      borderColor: c.mint,
      borderRadius: 16,
      backgroundColor: c.surfaceRaised,
      marginBottom: 10,
    },
    read: { borderColor: c.border, backgroundColor: c.surface, opacity: 0.72 },
    cardHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
    },
    cardTitle: { color: c.text, fontWeight: "900" },
    new: { color: c.pink, fontSize: 8, fontWeight: "900" },
    body: { color: c.textMuted, fontSize: 12, lineHeight: 18, marginTop: 7 },
    date: { color: c.textSubtle, fontSize: 9, marginTop: 9 },
  });
