import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { ThemeColors, useAppTheme } from "../lib/theme";
type Status =
  | "valid"
  | "resale_pending"
  | "resold"
  | "used"
  | "refunded"
  | "cancelled";
type ResaleMode = "public" | "private" | null;
type Props = {
  ticketId: string;
  status: Status;
  resaleMode: ResaleMode;
  eventId: string;
  eventTitle: string;
  eventAddress: string;
  startsAt: string;
  endsAt: string | null;
  publicCode: string;
  purchasePriceCents: number;
  resaleClosed: boolean;
  onStatus: (status: Status, mode?: ResaleMode) => void;
};
const calendarDate = (value: string) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export default function TicketResaleActions(props: Props) {
  const { theme } = useAppTheme(),
    s = makeStyles(theme.colors),
    [working, setWorking] = useState(false),
    [options, setOptions] = useState(false);
  async function publicResale() {
    setWorking(true);
    const { error } = await supabase.functions.invoke(
      "list-ticket-for-resale",
      { body: { ticketId: props.ticketId } },
    );
    setWorking(false);
    if (error) {
      Alert.alert(
        "Revente impossible",
        "La période de revente est peut-être terminée.",
      );
      return;
    }
    props.onStatus("resale_pending", "public");
    Alert.alert(
      "Billet mis en vente",
      "Tu seras averti dès que ton billet sera revendu.",
    );
  }
  async function privateTransfer() {
    setWorking(true);
    const { data, error } = await supabase.rpc("create_private_ticket_resale", {
      p_ticket: props.ticketId,
    });
    setWorking(false);
    if (error || !data) {
      Alert.alert(
        "Transfert impossible",
        "Impossible de générer le lien sécurisé.",
      );
      return;
    }
    props.onStatus("resale_pending", "private");
    await Share.share({
      title: `Billet — ${props.eventTitle}`,
      message: `Accepte et paie ce billet NOCTURNE : ${(process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")}/resale/${data}`,
    });
  }
  async function cancel() {
    setWorking(true);
    const { error } = await supabase.rpc("cancel_ticket_resale", {
      p_ticket: props.ticketId,
    });
    setWorking(false);
    if (error) {
      Alert.alert("Annulation impossible", error.message);
      return;
    }
    props.onStatus("valid", null);
  }
  function addCalendar() {
    const start = calendarDate(props.startsAt),
      end = calendarDate(
        props.endsAt ??
          new Date(
            new Date(props.startsAt).getTime() + 4 * 3600000,
          ).toISOString(),
      ),
      url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(props.eventTitle)}&dates=${start}/${end}&location=${encodeURIComponent(props.eventAddress)}`;
    void Linking.openURL(url);
    setOptions(false);
  }
  function itinerary() {
    const query = encodeURIComponent(props.eventAddress),
      url =
        Platform.OS === "ios"
          ? `maps://?q=${query}`
          : `https://www.google.com/maps/search/?api=1&query=${query}`;
    void Linking.openURL(url);
    setOptions(false);
  }
  const actionButtons =
    props.status === "valid" ? (
      <>
        <Pressable
          disabled={working || props.resaleClosed}
          style={[s.primary, props.resaleClosed && s.disabled]}
          onPress={() => void publicResale()}
        >
          <Text style={s.primaryText}>
            {working ? "Traitement…" : "Revendre"}
          </Text>
        </Pressable>
        <Pressable
          disabled={working || props.resaleClosed}
          style={[s.secondary, props.resaleClosed && s.disabled]}
          onPress={() => void privateTransfer()}
        >
          <Text style={s.secondaryText}>Transférer</Text>
        </Pressable>
      </>
    ) : props.status === "resale_pending" ? (
      <Pressable
        disabled={working}
        style={s.cancel}
        onPress={() => void cancel()}
      >
        <Text style={s.cancelText}>
          {working
            ? "Traitement…"
            : props.resaleMode === "private"
              ? "Annuler le transfert"
              : "Annuler la revente"}
        </Text>
      </Pressable>
    ) : null;
  return (
    <View style={s.panel}>
      {props.resaleClosed && props.status === "valid" ? (
        <Text style={s.closed}>
          La période de revente et de transfert est terminée.
        </Text>
      ) : null}
      <View style={s.actions}>
        {actionButtons}
        <Pressable style={s.optionButton} onPress={() => setOptions(true)}>
          <Text style={s.optionText}>•••</Text>
        </Pressable>
      </View>
      <Modal
        visible={options}
        transparent
        animationType="fade"
        onRequestClose={() => setOptions(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setOptions(false)}>
          <Pressable
            style={s.sheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Options du billet</Text>
            <Pressable
              style={s.menuRow}
              onPress={() => {
                setOptions(false);
                router.push({
                  pathname: "/event",
                  params: { id: props.eventId },
                });
              }}
            >
              <Text style={s.menuText}>Voir l’événement</Text>
              <Text style={s.chevron}>›</Text>
            </Pressable>
            <Pressable style={s.menuRow} onPress={addCalendar}>
              <Text style={s.menuText}>Ajouter au calendrier</Text>
              <Text style={s.chevron}>›</Text>
            </Pressable>
            <Pressable style={s.menuRow} onPress={itinerary}>
              <Text style={s.menuText}>Obtenir l’itinéraire</Text>
              <Text style={s.chevron}>›</Text>
            </Pressable>
            <Pressable
              style={s.menuRow}
              onPress={() => {
                setOptions(false);
                Alert.alert(
                  "Détails de la commande",
                  `Référence : ${props.publicCode}\nPrix payé : ${(props.purchasePriceCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}\nStatut : ${props.status}`,
                );
              }}
            >
              <Text style={s.menuText}>Détails de la commande</Text>
              <Text style={s.chevron}>›</Text>
            </Pressable>
            <Pressable
              style={s.menuRow}
              onPress={() => {
                setOptions(false);
                void Linking.openURL(
                  `mailto:?subject=${encodeURIComponent(`Question — ${props.eventTitle} — ${props.publicCode}`)}`,
                );
              }}
            >
              <Text style={s.menuText}>Contacter l’organisateur</Text>
              <Text style={s.chevron}>›</Text>
            </Pressable>
            <Pressable style={s.close} onPress={() => setOptions(false)}>
              <Text style={s.closeText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    panel: { gap: 10, marginTop: 18, paddingBottom: 8 },
    closed: { color: c.textMuted, fontSize: 11, textAlign: "center" },
    actions: { flexDirection: "row", gap: 8 },
    primary: {
      flex: 1,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.mint,
      alignItems: "center",
    },
    primaryText: { color: c.onAccent, fontWeight: "900" },
    secondary: {
      flex: 1,
      padding: 13,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: c.surface,
    },
    secondaryText: { color: c.text, fontWeight: "900" },
    disabled: { opacity: 0.3 },
    cancel: {
      flex: 1,
      padding: 13,
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 14,
      alignItems: "center",
    },
    cancelText: { color: c.danger, fontWeight: "900" },
    optionButton: {
      width: 48,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
    },
    optionText: {
      color: c.text,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 1,
    },
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,.65)",
    },
    sheet: {
      padding: 20,
      paddingBottom: 34,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: c.surface,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderStrong,
      marginBottom: 17,
    },
    sheetTitle: {
      color: c.text,
      fontSize: 21,
      fontWeight: "900",
      marginBottom: 10,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    menuText: { color: c.text, fontWeight: "700" },
    chevron: { color: c.mint, fontSize: 24 },
    close: {
      padding: 15,
      marginTop: 16,
      borderRadius: 14,
      backgroundColor: c.surfaceRaised,
      alignItems: "center",
    },
    closeText: { color: c.textMuted, fontWeight: "900" },
  });
