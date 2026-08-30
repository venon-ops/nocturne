import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../lib/supabase";
import { ThemeColors, useAppTheme } from "../lib/theme";

export default function CitySelector({
  city,
  onChange,
}: {
  city: string | null;
  onChange: (city: string) => void;
}) {
  const { theme } = useAppTheme(),
    c = theme.colors,
    s = makeStyles(c),
    [open, setOpen] = useState(false),
    [cities, setCities] = useState<string[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("events")
        .select("city")
        .eq("status", "published")
        .gte("ends_at", new Date().toISOString())
        .order("city");
      setCities([
        ...new Set((data ?? []).map((item) => item.city).filter(Boolean)),
      ]);
    })();
  }, []);
  async function choose(next: string) {
    setOpen(false);
    onChange(next);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user)
      await supabase.from("profiles").update({ city: next }).eq("id", user.id);
  }
  return (
    <>
      <Pressable
        accessibilityLabel="Choisir la ville"
        style={s.trigger}
        onPress={() => setOpen(true)}
      >
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path
            d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"
            fill="none"
            stroke={c.mint}
            strokeWidth={1.8}
          />
          <Path
            d="M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
            fill="none"
            stroke={c.mint}
            strokeWidth={1.8}
          />
        </Svg>
        <View>
          <Text style={s.label}>VILLE</Text>
          <Text numberOfLines={1} style={s.city}>
            {city ?? "Choisir"}
          </Text>
        </View>
        <Text style={s.chevron}>⌄</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={s.sheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={s.handle} />
            <Text style={s.title}>Choisir une ville</Text>
            <ScrollView style={s.list}>
              {cities.map((value) => (
                <Pressable
                  key={value}
                  style={[s.row, value === city && s.rowActive]}
                  onPress={() => void choose(value)}
                >
                  <Text style={[s.rowText, value === city && s.rowTextActive]}>
                    {value}
                  </Text>
                  {value === city ? <Text style={s.check}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={s.close} onPress={() => setOpen(false)}>
              <Text style={s.closeText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    trigger: {
      width: 142,
      height: 44,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      backgroundColor: c.surface,
    },
    label: {
      color: c.textSubtle,
      fontSize: 7,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    city: {
      maxWidth: 75,
      color: c.text,
      fontSize: 12,
      fontWeight: "900",
      marginTop: 1,
    },
    chevron: { color: c.textMuted, fontSize: 16, marginLeft: "auto" },
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,.68)",
    },
    sheet: {
      maxHeight: "70%",
      padding: 20,
      paddingBottom: 32,
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
    title: {
      color: c.text,
      fontSize: 22,
      fontWeight: "900",
      marginBottom: 14,
    },
    list: { maxHeight: 360 },
    row: {
      height: 52,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowActive: { backgroundColor: `${c.mint}12` },
    rowText: { color: c.text, fontWeight: "800" },
    rowTextActive: { color: c.mint },
    check: { color: c.mint, fontWeight: "900" },
    close: {
      padding: 15,
      marginTop: 16,
      borderRadius: 14,
      backgroundColor: c.surfaceRaised,
      alignItems: "center",
    },
    closeText: { color: c.textMuted, fontWeight: "900" },
  });
