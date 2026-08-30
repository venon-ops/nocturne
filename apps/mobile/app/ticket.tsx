import { router } from "expo-router";
import * as Brightness from "expo-brightness";
import { useEffect, useMemo, useState } from "react";
import QRCode from "react-native-qrcode-svg";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import TicketResaleActions from "../components/TicketResaleActions";
import RoundBackButton from "../components/RoundBackButton";
import { ThemeColors, useAppTheme } from "../lib/theme";

type TicketStatus =
  | "valid"
  | "used"
  | "refunded"
  | "cancelled"
  | "resale_pending"
  | "resold";
type ResaleMode = "public" | "private" | null;
type EventInfo = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  city: string;
  address: string | null;
  cover_path: string | null;
  genre: string | null;
};
type TicketRow = {
  id: string;
  qr_token: string | null;
  public_code: string;
  purchase_price_cents: number;
  status: TicketStatus;
  resale_mode: ResaleMode;
  events: EventInfo | null;
  ticket_types: { name: string; sales_cutoff_at: string } | null;
};
type EventGroup = { event: EventInfo; tickets: TicketRow[] };
type Category = "upcoming" | "pending" | "past";

const statusLabel = (status: TicketStatus, mode: ResaleMode = null) =>
  status === "valid"
    ? "Actif"
    : status === "used"
      ? "Scanné"
      : status === "resale_pending"
        ? mode === "private"
          ? "En transfert"
          : "En revente"
        : status === "resold"
          ? "Revendu"
          : status === "refunded"
            ? "Remboursé"
            : "Annulé";
const dateLabel = (event: EventInfo) =>
  new Date(event.starts_at)
    .toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", " ·");
const coverUrl = (path: string | null) =>
  path
    ? supabase.storage.from("event-media").getPublicUrl(path).data.publicUrl
    : null;
const genres = (value: string | null) =>
  value
    ?.split(/[,/·]+/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

export default function Tickets() {
  const { theme } = useAppTheme(),
    c = theme.colors,
    s = makeStyles(c),
    [tickets, setTickets] = useState<TicketRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<EventGroup | null>(null),
    [active, setActive] = useState(0),
    [category, setCategory] = useState<Category>("upcoming");
  const { width } = useWindowDimensions(),
    cardWidth = width - 48;
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth");
        return;
      }
      const [{ data, error: ticketError }, { data: history }, { data: modes }] =
        await Promise.all([
          supabase
            .from("tickets")
            .select(
              "id,qr_token,public_code,purchase_price_cents,status,events(id,title,starts_at,ends_at,city,address,cover_path,genre),ticket_types(name,sales_cutoff_at),orders!inner(buyer_id)",
            )
            .eq("orders.buyer_id", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("ticket_resale_history")
            .select(
              "listing_id,original_public_code,price_cents,events(id,title,starts_at,ends_at,city,address,cover_path,genre),ticket_types(name,sales_cutoff_at)",
            )
            .eq("seller_id", user.id)
            .order("sold_at", { ascending: false }),
          supabase.rpc("get_my_ticket_resale_modes"),
        ]);
      if (!mounted) return;
      if (ticketError) setError("Impossible de charger vos billets.");
      else {
        const modeMap = new Map(
            (
              (modes ?? []) as Array<{
                ticket_id: string;
                mode: Exclude<ResaleMode, null>;
              }>
            ).map((item) => [item.ticket_id, item.mode]),
          ),
          current = (
            (data ?? []) as unknown as Omit<TicketRow, "resale_mode">[]
          ).map((item) => ({
            ...item,
            resale_mode: modeMap.get(item.id) ?? null,
          })),
          resold = (
            (history ?? []) as unknown as Array<{
              listing_id: string;
              original_public_code: string;
              price_cents: number;
              events: EventInfo | null;
              ticket_types: { name: string; sales_cutoff_at: string } | null;
            }>
          ).map((item) => ({
            id: `resold-${item.listing_id}`,
            qr_token: null,
            public_code: item.original_public_code,
            purchase_price_cents: item.price_cents,
            status: "resold" as const,
            resale_mode: null,
            events: item.events,
            ticket_types: item.ticket_types,
          }));
        setTickets([...current, ...resold]);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);
  const activeQr = Boolean(
    selected?.tickets[active]?.qr_token &&
      selected?.tickets[active]?.status === "valid",
  );
  useEffect(() => {
    if (!activeQr) return;
    let previous: number | null = null,
      cancelled = false;
    void Brightness.getBrightnessAsync()
      .then((value) => {
        if (cancelled) return;
        previous = value;
        return Brightness.setBrightnessAsync(1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (previous !== null)
        void Brightness.setBrightnessAsync(previous).catch(() => undefined);
    };
  }, [activeQr, selected?.event.id]);
  const groups = useMemo(() => {
    const map = new Map<string, EventGroup>();
    for (const ticket of tickets) {
      if (!ticket.events) continue;
      const group = map.get(ticket.events.id);
      if (group) group.tickets.push(ticket);
      else
        map.set(ticket.events.id, { event: ticket.events, tickets: [ticket] });
    }
    return [...map.values()];
  }, [tickets]);
  const filtered = useMemo(
    () =>
      groups.filter((group) => {
        const active = group.tickets.some(
            (ticket) => ticket.status === "valid",
          ),
          pending =
            !active &&
            group.tickets.some((ticket) => ticket.status === "resale_pending"),
          past =
            new Date(group.event.ends_at || group.event.starts_at) < new Date();
        return category === "pending"
          ? pending
          : category === "past"
            ? past && !pending
            : !past && !pending;
      }),
    [groups, category],
  );
  function openGroup(group: EventGroup) {
    setSelected(group);
    setActive(0);
    router.setParams({ detail: "1" });
  }
  function closeGroup() {
    setSelected(null);
    setActive(0);
    router.setParams({ detail: undefined });
  }
  function updateStatus(
    ticketId: string,
    status: TicketStatus,
    resaleMode: ResaleMode = null,
  ) {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, status, resale_mode: resaleMode }
          : ticket,
      ),
    );
    setSelected((current) =>
      current
        ? {
            ...current,
            tickets: current.tickets.map((ticket) =>
              ticket.id === ticketId
                ? { ...ticket, status, resale_mode: resaleMode }
                : ticket,
            ),
          }
        : current,
    );
  }
  if (loading)
    return (
      <View style={s.center}>
        <ActivityIndicator color={c.mint} />
      </View>
    );
  if (selected) {
    const ticket = selected.tickets[active];
    return (
      <ScrollView style={s.page} contentContainerStyle={s.detailContent}>
        <RoundBackButton onPress={closeGroup} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + 12}
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={s.carousel}
          onMomentumScrollEnd={(event) =>
            setActive(
              Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12)),
            )
          }
        >
          {selected.tickets.map((item) => (
            <View key={item.id} style={[s.ticket, { width: cardWidth }]}>
              <Text style={[s.status, s[`status_${item.status}`]]}>
                {statusLabel(item.status, item.resale_mode).toUpperCase()}
              </Text>
              <Text style={s.ticketTitle}>{selected.event.title}</Text>
              <Text style={s.ticketType}>
                {item.ticket_types?.name ?? "Billet"}
              </Text>
              <Text style={s.price}>
                Acheté{" "}
                {(item.purchase_price_cents / 100).toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                })}
              </Text>
              {item.qr_token && item.status === "valid" ? (
                <View style={s.qr}>
                  <QRCode
                    value={`nocturne:ticket:${item.qr_token}`}
                    size={205}
                    backgroundColor={c.qrBackground}
                  />
                </View>
              ) : (
                <View style={s.inactive}>
                  <Text style={s.inactiveTitle}>
                    {item.status === "resold"
                      ? "Revente terminée"
                      : "QR code indisponible"}
                  </Text>
                  <Text style={s.inactiveText}>
                    {item.status === "resold"
                      ? "L’ancien QR code est définitivement désactivé."
                      : `Ce billet est actuellement « ${statusLabel(item.status, item.resale_mode).toLowerCase()} ».`}
                  </Text>
                </View>
              )}
              <Text style={s.code}>{item.public_code}</Text>
            </View>
          ))}
        </ScrollView>
        {selected.tickets.length > 1 ? (
          <View style={s.dots}>
            {selected.tickets.map((item, index) => (
              <View
                key={item.id}
                style={[s.dot, index === active && s.dotActive]}
              />
            ))}
          </View>
        ) : null}
        <TicketResaleActions
          ticketId={ticket.id}
          status={ticket.status}
          resaleMode={ticket.resale_mode}
          eventId={selected.event.id}
          eventTitle={selected.event.title}
          eventAddress={selected.event.address || selected.event.city}
          startsAt={selected.event.starts_at}
          endsAt={selected.event.ends_at}
          publicCode={ticket.public_code}
          purchasePriceCents={ticket.purchase_price_cents}
          resaleClosed={
            !ticket.ticket_types?.sales_cutoff_at ||
            new Date(ticket.ticket_types.sales_cutoff_at) <= new Date()
          }
          onStatus={(status, mode) => updateStatus(ticket.id, status, mode)}
        />
      </ScrollView>
    );
  }
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <Text style={s.listEyebrow}>MON ESPACE</Text>
      <Text style={s.title}>Mes billets.</Text>
      <Text style={s.intro}>Retrouvez toutes vos soirées et vos QR codes.</Text>
      <View style={s.categoryTabs}>
        {(
          [
            ["upcoming", "À venir"],
            ["pending", "En attente"],
            ["past", "Passées"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            style={[s.categoryTab, category === value && s.categoryTabActive]}
            onPress={() => setCategory(value)}
          >
            <Text
              style={[
                s.categoryTabText,
                category === value && s.categoryTabTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {!filtered.length ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Aucun billet.</Text>
          <Text style={s.intro}>Aucun billet dans cette catégorie.</Text>
        </View>
      ) : (
        filtered.map((group) => (
          <Pressable
            key={group.event.id}
            style={s.eventCard}
            onPress={() => openGroup(group)}
          >
            {coverUrl(group.event.cover_path) ? (
              <Image
                source={{ uri: coverUrl(group.event.cover_path)! }}
                style={s.eventImage}
              />
            ) : (
              <View style={s.eventImageFallback} />
            )}
            <View style={s.eventText}>
              <Text numberOfLines={2} style={s.eventTitle}>
                {group.event.title}
              </Text>
              <Text style={s.eventDate}>
                {dateLabel(group.event)} · Dès{" "}
                {(
                  Math.min(
                    ...group.tickets.map(
                      (ticket) => ticket.purchase_price_cents,
                    ),
                  ) / 100
                ).toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                })}
              </Text>
              <Text numberOfLines={1} style={s.eventPlace}>
                {group.event.address || group.event.city}
              </Text>
              <View style={s.badges}>
                {genres(group.event.genre)
                  .slice(0, 2)
                  .map((value) => (
                    <Text key={value} style={s.genreBadge}>
                      {value}
                    </Text>
                  ))}
                {[
                  ...new Map(
                    group.tickets.map((ticket) => [
                      `${ticket.status}-${ticket.resale_mode}`,
                      ticket,
                    ]),
                  ).values(),
                ].map((ticket) => (
                  <Text
                    key={`${ticket.status}-${ticket.resale_mode}`}
                    style={[s.badge, s[`badge_${ticket.status}`]]}
                  >
                    {statusLabel(
                      ticket.status,
                      ticket.resale_mode,
                    ).toUpperCase()}
                  </Text>
                ))}
              </View>
            </View>
            <Text style={s.count}>
              {group.tickets.length}
              <Text style={s.countLabel}>
                {" "}
                billet{group.tickets.length > 1 ? "s" : ""}
              </Text>{" "}
              ›
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    content: { padding: 24, paddingTop: 48, paddingBottom: 130 },
    detailContent: { padding: 24, paddingTop: 58, paddingBottom: 40 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
    },
    back: { color: c.textMuted, fontSize: 14 },
    roundBack: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    roundBackIcon: {
      color: c.text,
      fontSize: 31,
      lineHeight: 34,
      fontWeight: "400",
      marginTop: -2,
    },
    listEyebrow: {
      color: c.mint,
      fontSize: 10,
      letterSpacing: 1.5,
      fontWeight: "800",
    },
    eyebrow: {
      color: c.mint,
      fontSize: 10,
      letterSpacing: 1.5,
      marginTop: 42,
      fontWeight: "800",
    },
    title: {
      color: c.text,
      fontSize: 40,
      fontWeight: "900",
      letterSpacing: -2,
      marginTop: 10,
    },
    intro: { color: c.textMuted, marginTop: 8, lineHeight: 20 },
    categoryTabs: {
      flexDirection: "row",
      marginTop: 28,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    categoryTab: {
      flex: 1,
      paddingVertical: 13,
      alignItems: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    categoryTabActive: { borderBottomColor: c.mint },
    categoryTabText: { color: c.textSubtle, fontSize: 13, fontWeight: "800" },
    categoryTabTextActive: { color: c.text },
    error: { color: c.danger, marginTop: 24 },
    empty: {
      padding: 35,
      marginTop: 35,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      alignItems: "center",
    },
    emptyTitle: { color: c.text, fontWeight: "900", fontSize: 20 },
    eventCard: {
      minHeight: 124,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 7,
      marginTop: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    eventImage: {
      width: 88,
      height: 110,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
    },
    eventImageFallback: {
      width: 88,
      height: 110,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
    },
    eventText: { flex: 1, minWidth: 0 },
    eventTitle: {
      color: c.text,
      fontSize: 15,
      fontWeight: "900",
      lineHeight: 19,
    },
    eventDate: {
      color: c.text,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 8,
    },
    eventPlace: { color: c.textMuted, fontSize: 10, marginTop: 5 },
    badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
    genreBadge: {
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 7,
      overflow: "hidden",
      color: c.textMuted,
      fontSize: 8,
      fontWeight: "800",
    },
    badge: {
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 6,
      overflow: "hidden",
      backgroundColor: `${c.mint}24`,
      color: c.mint,
      fontSize: 8,
      fontWeight: "900",
    },
    badge_resale_pending: {
      backgroundColor: "rgba(255,192,74,.14)",
      color: "#FFCA7A",
    },
    badge_resold: { backgroundColor: "rgba(255,77,153,.14)", color: "#FF779E" },
    badge_refunded: {
      backgroundColor: "rgba(255,77,153,.14)",
      color: "#FF779E",
    },
    badge_cancelled: {
      backgroundColor: "rgba(255,77,153,.14)",
      color: "#FF779E",
    },
    badge_used: { backgroundColor: "rgba(168,136,255,.16)", color: "#A888FF" },
    badge_valid: {},
    count: { color: c.text, fontSize: 12, fontWeight: "900" },
    countLabel: { color: c.textMuted, fontSize: 9, fontWeight: "700" },
    carousel: { gap: 12 },
    ticket: {
      backgroundColor: c.ticketBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 24,
      padding: 24,
      alignItems: "center",
      marginTop: 18,
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 7,
      marginTop: 16,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.borderStrong,
    },
    dotActive: { width: 18, backgroundColor: c.mint },
    status: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 7,
      overflow: "hidden",
      backgroundColor: "#DCF7F2",
      color: "#178C78",
      fontSize: 9,
      fontWeight: "900",
    },
    status_resale_pending: { backgroundColor: "#FFF0D3", color: "#96620F" },
    status_resold: { backgroundColor: "#FFE0ED", color: "#B82C69" },
    status_refunded: { backgroundColor: "#FFE0ED", color: "#B82C69" },
    status_cancelled: { backgroundColor: "#FFE0ED", color: "#B82C69" },
    status_used: { backgroundColor: "#EAE4FF", color: "#7151C8" },
    status_valid: {},
    ticketTitle: {
      color: c.ticketText,
      fontWeight: "900",
      fontSize: 23,
      textAlign: "center",
      marginTop: 18,
    },
    ticketType: { color: c.ticketMuted, fontWeight: "700", marginTop: 8 },
    price: {
      color: c.ticketText,
      fontWeight: "900",
      fontSize: 16,
      marginTop: 10,
    },
    qr: {
      marginVertical: 24,
      padding: 12,
      borderRadius: 16,
      backgroundColor: c.qrBackground,
    },
    code: {
      color: c.ticketText,
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: 1.5,
      marginTop: 12,
    },
    inactive: {
      width: "100%",
      padding: 25,
      marginTop: 24,
      borderRadius: 16,
      backgroundColor: c.surfaceRaised,
      alignItems: "center",
    },
    inactiveTitle: { color: c.text, fontWeight: "900" },
    inactiveText: {
      color: c.textMuted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: "center",
      marginTop: 7,
    },
  });
