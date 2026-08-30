import { Pressable, StyleSheet, Text, View } from "react-native";
import { ThemeName, themes, useAppTheme } from "../lib/theme";
const order: ThemeName[] = ["nocturne", "obsidian", "dawn", "sunset"];
export default function ThemeSelector() {
  const { theme, setTheme } = useAppTheme(),
    c = theme.colors;
  return (
    <View style={s.wrap}>
      {order.map((name) => {
        const item = themes[name],
          active = theme.name === name;
        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => setTheme(name)}
            style={[
              s.card,
              {
                backgroundColor: c.surface,
                borderColor: active ? c.mint : c.borderStrong,
              },
            ]}
          >
            <View style={s.preview}>
              <View
                style={[s.swatch, { backgroundColor: item.colors.background }]}
              />
              <View style={[s.swatch, { backgroundColor: item.colors.text }]} />
              <View style={[s.swatch, { backgroundColor: item.colors.mint }]} />
              <View
                style={[s.swatch, { backgroundColor: item.colors.violet }]}
              />
            </View>
            <View style={s.copy}>
              <Text style={[s.name, { color: c.text }]}>{item.label}</Text>
              <Text style={[s.description, { color: c.textMuted }]}>
                {item.description}
              </Text>
            </View>
            <View
              style={[
                s.radio,
                { borderColor: active ? c.mint : c.borderStrong },
              ]}
            >
              {active ? (
                <View style={[s.radioDot, { backgroundColor: c.mint }]} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { gap: 10 },
  card: {
    minHeight: 82,
    padding: 13,
    borderWidth: 1,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  preview: {
    width: 42,
    height: 48,
    flexDirection: "row",
    flexWrap: "wrap",
    overflow: "hidden",
    borderRadius: 10,
  },
  swatch: { width: 21, height: 24 },
  copy: { flex: 1 },
  name: { fontSize: 14, fontWeight: "900" },
  description: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
