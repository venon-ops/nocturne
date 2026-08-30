import { router } from "expo-router";
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useAppTheme } from "../lib/theme";

export default function RoundBackButton({
  onPress,
  style,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useAppTheme(),
    c = theme.colors;
  return (
    <Pressable
      accessibilityLabel="Retour"
      style={[
        s.button,
        { borderColor: c.borderStrong, backgroundColor: c.surface },
        style,
      ]}
      onPress={onPress ?? (() => router.back())}
    >
      <Text style={[s.icon, { color: c.text }]}>‹</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#30354A",
    backgroundColor: "#111421",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    color: "#F8F7FF",
    fontSize: 31,
    lineHeight: 34,
    fontWeight: "400",
    marginTop: -2,
  },
});
