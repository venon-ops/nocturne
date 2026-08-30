import { ScrollView, StyleSheet, Text } from "react-native";
import RoundBackButton from "../components/RoundBackButton";
import ThemeSelector from "../components/ThemeSelector";
import { ThemeColors, useAppTheme } from "../lib/theme";
export default function SettingsPage() {
  const { theme } = useAppTheme(),
    s = makeStyles(theme.colors);
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <RoundBackButton />
      <Text style={s.eyebrow}>PARAMÈTRES</Text>
      <Text style={s.title}>Apparence.</Text>
      <Text style={s.intro}>
        Choisis l’ambiance de NOCTURNE. Ton choix reste enregistré sur ce
        téléphone.
      </Text>
      <ThemeSelector />
    </ScrollView>
  );
}
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.background },
    content: { padding: 22, paddingTop: 60, paddingBottom: 50 },
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
      marginBottom: 24,
    },
  });
