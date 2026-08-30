import { initStripe, useStripe } from "@stripe/stripe-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import RoundBackButton from "../components/RoundBackButton";
import { ThemeColors, useAppTheme } from "../lib/theme";
type TicketType = {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sold_quantity: number;
  sales_cutoff_at: string;
};
type EventDetails = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  city: string;
  address: string | null;
  starts_at: string;
  cover_path: string | null;
  ticket_types: TicketType[];
};
const coverUrl = (path: string | null) =>
  path
    ? path.startsWith("http")
      ? path
      : supabase.storage.from("event-media").getPublicUrl(path).data.publicUrl
    : null;
export default function EventPage() {
  const { theme } = useAppTheme(),
    c = theme.colors,
    s = makeStyles(c),
    { id } = useLocalSearchParams<{ id: string }>(),
    { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [event, setEvent] = useState<EventDetails | null>(null),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [loading, setLoading] = useState(true),
    [paying, setPaying] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("events")
        .select(
          "id,slug,title,description,city,address,starts_at,cover_path,ticket_types(id,name,price_cents,quantity,sold_quantity,sales_cutoff_at)",
        )
        .eq("id", id)
        .single();
      if (!mounted) return;
      if (loadError) setError("Cette soirée est indisponible.");
      else setEvent(data as EventDetails);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [id]);
  const total = useMemo(
    () =>
      event?.ticket_types.reduce(
        (sum, ticket) =>
          sum + (quantities[ticket.id] ?? 0) * ticket.price_cents,
        0,
      ) ?? 0,
    [event, quantities],
  );
  async function buy() {
    if (!event || !total) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth");
      return;
    }
    setPaying(true);
    setError("");
    try {
      const items = event.ticket_types
          .map((ticket) => ({
            ticketTypeId: ticket.id,
            quantity: quantities[ticket.id] ?? 0,
          }))
          .filter((item) => item.quantity > 0),
        { data, error: invokeError } = await supabase.functions.invoke(
          "create-mobile-payment-intent",
          { body: { items } },
        );
      if (
        invokeError ||
        !data?.paymentIntentClientSecret ||
        !data?.publishableKey
      )
        throw Error(
          data?.error || invokeError?.message || "Paiement indisponible",
        );
      await initStripe({
        publishableKey: data.publishableKey,
        urlScheme: "nocturne",
      });
      const initialized = await initPaymentSheet({
        merchantDisplayName: "NOCTURNE",
        paymentIntentClientSecret: data.paymentIntentClientSecret,
        returnURL: "nocturne://stripe-redirect",
        allowsDelayedPaymentMethods: false,
        appearance: {
          colors: {
            primary: c.mint,
            background: c.surface,
            componentBackground: c.surfaceRaised,
            componentBorder: c.borderStrong,
            componentText: c.text,
            primaryText: c.onAccent,
            secondaryText: c.textMuted,
          },
        },
      });
      if (initialized.error) throw Error(initialized.error.message);
      const presented = await presentPaymentSheet();
      if (presented.error) {
        if (presented.error.code !== "Canceled")
          throw Error(presented.error.message);
        return;
      }
      Alert.alert(
        "Paiement confirmé",
        "Tes billets vont apparaître dans « Mes billets ».",
        [
          {
            text: "Voir mes billets",
            onPress: () => router.replace("/ticket"),
          },
        ],
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Paiement impossible.",
      );
    } finally {
      setPaying(false);
    }
  }
  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator color={c.mint} />
      </View>
    );
  if (!event)
    return (
      <View style={s.center}>
        <Text style={s.error}>{error}</Text>
        <RoundBackButton />
      </View>
    );
  const cover = coverUrl(event.cover_path),
    selected = Object.values(quantities).reduce((sum, value) => sum + value, 0);
  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        {cover ? (
          <Image source={{ uri: cover }} style={s.cover} />
        ) : (
          <View style={s.coverFallback} />
        )}
        <RoundBackButton style={s.backButton} />
        <View style={s.body}>
          <Text style={s.date}>
            {new Date(event.starts_at).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <Text style={s.title}>{event.title}</Text>
          <Text style={s.place}>
            {event.address ? `${event.address}, ` : ""}
            {event.city}
          </Text>
          {event.description ? (
            <Text style={s.description}>{event.description}</Text>
          ) : null}
          <Text style={s.heading}>Billets</Text>
          {event.ticket_types.map((ticket) => {
            const remaining = Math.max(
                0,
                ticket.quantity - ticket.sold_quantity,
              ),
              closed = new Date(ticket.sales_cutoff_at) <= new Date(),
              quantity = quantities[ticket.id] ?? 0;
            return (
              <View
                key={ticket.id}
                style={[s.ticket, (closed || !remaining) && s.ticketClosed]}
              >
                <View style={s.ticketInfo}>
                  <Text style={s.ticketName}>{ticket.name}</Text>
                  <Text style={s.remaining}>
                    {closed
                      ? "Vente terminée"
                      : `${remaining} disponible${remaining > 1 ? "s" : ""}`}
                  </Text>
                  <Text style={s.price}>
                    {(ticket.price_cents / 100).toLocaleString("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </Text>
                </View>
                <View style={s.quantity}>
                  <Pressable
                    disabled={!quantity}
                    onPress={() =>
                      setQuantities((current) => ({
                        ...current,
                        [ticket.id]: Math.max(0, quantity - 1),
                      }))
                    }
                  >
                    <Text style={s.quantityButton}>−</Text>
                  </Pressable>
                  <Text style={s.quantityValue}>{quantity}</Text>
                  <Pressable
                    disabled={
                      closed ||
                      !remaining ||
                      quantity >= remaining ||
                      selected >= 10
                    }
                    onPress={() =>
                      setQuantities((current) => ({
                        ...current,
                        [ticket.id]: quantity + 1,
                      }))
                    }
                  >
                    <Text style={s.quantityButton}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {error ? <Text style={s.error}>{error}</Text> : null}
        </View>
      </ScrollView>
      {total > 0 ? (
        <View style={s.checkout}>
          <View>
            <Text style={s.checkoutLabel}>
              {selected} billet{selected > 1 ? "s" : ""}
            </Text>
            <Text style={s.checkoutTotal}>
              {(total / 100).toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })}
            </Text>
          </View>
          <Pressable disabled={paying} style={s.buy} onPress={() => void buy()}>
            <Text style={s.buyText}>{paying ? "Chargement…" : "Payer"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  content: { paddingBottom: 130 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    backgroundColor: c.background,
    padding: 30,
  },
  cover: { width: "100%", height: 310 },
  coverFallback: { height: 250, backgroundColor: c.surfaceMuted },
  backButton: {
    position: "absolute",
    top: 55,
    left: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: c.text, fontSize: 34, lineHeight: 36 },
  back: { color: c.mint },
  body: { padding: 22 },
  date: {
    color: c.mint,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "capitalize",
  },
  title: {
    color: c.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.5,
    marginTop: 10,
  },
  place: { color: c.violet, fontWeight: "700", marginTop: 10 },
  description: { color: c.textMuted, lineHeight: 22, marginTop: 24 },
  heading: {
    color: c.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 30,
    marginBottom: 12,
  },
  ticket: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: c.surface,
  },
  ticketClosed: { opacity: 0.42 },
  ticketInfo: { flex: 1 },
  ticketName: { color: c.text, fontWeight: "800" },
  remaining: { color: c.textMuted, fontSize: 10, marginTop: 4 },
  price: { color: c.mint, fontWeight: "900", fontSize: 17, marginTop: 7 },
  quantity: { flexDirection: "row", alignItems: "center", gap: 13 },
  quantityButton: {
    width: 32,
    height: 32,
    paddingTop: 4,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 16,
    overflow: "hidden",
    color: c.text,
    fontSize: 18,
    textAlign: "center",
  },
  quantityValue: {
    minWidth: 14,
    color: c.text,
    fontWeight: "900",
    textAlign: "center",
  },
  checkout: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    paddingLeft: 18,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 20,
    backgroundColor: c.surface,
  },
  checkoutLabel: { color: c.textMuted, fontSize: 10 },
  checkoutTotal: {
    color: c.text,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 2,
  },
  buy: {
    minWidth: 130,
    padding: 15,
    borderRadius: 14,
    backgroundColor: c.mint,
    alignItems: "center",
  },
  buyText: { color: c.onAccent, fontWeight: "900" },
  error: { color: c.danger, fontSize: 12, lineHeight: 18, marginTop: 15 },
  });
