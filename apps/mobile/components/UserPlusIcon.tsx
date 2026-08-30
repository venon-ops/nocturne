import { StyleSheet, Text, View } from "react-native";

export default function UserPlusIcon({ color }: { color: string }) {
  return (
    <View style={s.icon} accessibilityElementsHidden>
      <View style={[s.head, { borderColor: color }]} />
      <View style={[s.shoulders, { borderColor: color }]} />
      <Text style={[s.plus, { color }]}>+</Text>
    </View>
  );
}

const s = StyleSheet.create({
  icon: { width: 19, height: 18, position: "relative" },
  head: {
    position: "absolute",
    top: 1,
    left: 4,
    width: 7,
    height: 7,
    borderWidth: 1.6,
    borderRadius: 4,
  },
  shoulders: {
    position: "absolute",
    left: 1,
    bottom: 0,
    width: 13,
    height: 7,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  plus: {
    position: "absolute",
    right: -1,
    top: 3,
    fontSize: 11,
    lineHeight: 12,
    fontWeight: "900",
  },
});
