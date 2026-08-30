import {
  router,
  useGlobalSearchParams,
  usePathname,
  type Href,
} from "expo-router";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BrandIcon from "./BrandIcon";
import { useAppTheme } from "../lib/theme";

const tabs = [
  { href: "/", icon: "feed", label: "Fil" },
  { href: "/upcoming", icon: "calendar", label: "À venir" },
  { href: "/ticket", icon: "ticket", label: "Billets" },
  { href: "/search", icon: "search", label: "Explorer" },
] as const;

export default function MobileTabBar() {
  const pathname = usePathname(),
    params = useGlobalSearchParams<{ detail?: string }>(),
    insets = useSafeAreaInsets(),
    [width, setWidth] = useState(0),
    { theme } = useAppTheme(),
    c = theme.colors;
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.href === pathname),
  );
  const hidden =
      [
        "/auth",
        "/event",
        "/profile",
        "/settings",
        "/friends",
        "/edit-profile",
        "/notifications",
      ].includes(pathname) ||
      (pathname === "/ticket" && params.detail === "1"),
    position = useRef(new Animated.Value(activeIndex)).current,
    wasHidden = useRef(hidden);
  useEffect(() => {
    if (wasHidden.current && !hidden) position.setValue(activeIndex);
    else if (!hidden)
      Animated.timing(position, {
        toValue: activeIndex,
        duration: 260,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }).start();
    wasHidden.current = hidden;
  }, [activeIndex, hidden, position]);
  if (hidden) return null;
  const slot = width ? Math.max(0, (width - 14) / 4) : 0;
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        s.bar,
        {
          bottom: Math.max(insets.bottom, 12),
          backgroundColor: c.tabBar,
          borderColor: c.border,
        },
      ]}
    >
      {slot > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.slider,
            {
              width: slot,
              backgroundColor: `${c.mint}12`,
              borderColor: `${c.mint}24`,
              transform: [{ translateX: Animated.multiply(position, slot) }],
            },
          ]}
        />
      ) : null}
      {tabs.map((tab, index) => {
        const active = index === activeIndex;
        return (
          <Pressable
            key={tab.href}
            onPress={() => {
              if (!active) router.replace(tab.href as Href);
            }}
            style={({ pressed }) => [s.tab, pressed && s.pressed]}
          >
            <Animated.View style={[s.iconWrap, active && s.iconActive]}>
              <BrandIcon
                name={tab.icon}
                color={active ? c.mint : c.textSubtle}
                size={21}
              />
            </Animated.View>
            <Text
              numberOfLines={1}
              style={[
                s.label,
                { color: c.textSubtle },
                active && s.labelActive,
                active && { color: c.text },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 18,
    right: 18,
    height: 70,
    paddingHorizontal: 7,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: "rgba(168,136,255,.2)",
    borderRadius: 24,
    backgroundColor: "rgba(15,18,31,.97)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 16,
    overflow: "hidden",
  },
  slider: {
    position: "absolute",
    left: 7,
    top: 6,
    bottom: 6,
    borderRadius: 18,
    backgroundColor: "rgba(83,246,212,.065)",
    borderWidth: 1,
    borderColor: "rgba(83,246,212,.1)",
  },
  tab: {
    position: "relative",
    zIndex: 1,
    width: "25%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  pressed: { opacity: 0.58, transform: [{ scale: 0.97 }] },
  iconWrap: { height: 25, alignItems: "center", justifyContent: "center" },
  iconActive: { transform: [{ translateY: -1 }] },
  label: {
    color: "#74798E",
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.1,
    marginTop: 2,
  },
  labelActive: { color: "#F8F7FF", fontWeight: "900" },
});
