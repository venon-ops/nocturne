import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { StatusBarStyle } from "expo-status-bar";

export type ThemeName = "nocturne" | "obsidian" | "dawn" | "sunset";
export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  mint: string;
  violet: string;
  pink: string;
  danger: string;
  onAccent: string;
  overlay: string;
  tabBar: string;
  statusBar: StatusBarStyle;
  ticketBackground: string;
  ticketText: string;
  ticketMuted: string;
  qrBackground: string;
};
export type AppTheme = {
  name: ThemeName;
  label: string;
  description: string;
  colors: ThemeColors;
};

export const themes: Record<ThemeName, AppTheme> = {
  nocturne: {
    name: "nocturne",
    label: "Nocturne",
    description: "La nuit signature, menthe et violette.",
    colors: {
      background: "#080A14",
      surface: "#101321",
      surfaceRaised: "#171B2B",
      surfaceMuted: "#24283C",
      border: "#292D42",
      borderStrong: "#343950",
      text: "#F8F7FF",
      textMuted: "#9FA3B8",
      textSubtle: "#73788D",
      mint: "#53F6D4",
      violet: "#A888FF",
      pink: "#FF4D99",
      danger: "#FF779E",
      onAccent: "#071016",
      overlay: "rgba(3,5,12,.50)",
      tabBar: "rgba(15,18,31,.97)",
      statusBar: "light",
      ticketBackground: "#F8F7FF",
      ticketText: "#171A27",
      ticketMuted: "#666B78",
      qrBackground: "#FFFFFF",
    },
  },
  obsidian: {
    name: "obsidian",
    label: "Obsidienne",
    description: "Noir profond, gris graphite et blanc.",
    colors: {
      background: "#111214",
      surface: "#1A1C1F",
      surfaceRaised: "#222428",
      surfaceMuted: "#2B2E33",
      border: "#32353A",
      borderStrong: "#474B52",
      text: "#FAFAFA",
      textMuted: "#B3B3B3",
      textSubtle: "#7C7C7C",
      mint: "#D9FFF7",
      violet: "#C8BCFF",
      pink: "#FF75AE",
      danger: "#FF879F",
      onAccent: "#111214",
      overlay: "rgba(0,0,0,.58)",
      tabBar: "rgba(25,27,30,.98)",
      statusBar: "light",
      ticketBackground: "#202225",
      ticketText: "#FAFAFA",
      ticketMuted: "#B3B3B3",
      qrBackground: "#FFFFFF",
    },
  },
  dawn: {
    name: "dawn",
    label: "Aube",
    description: "Clair, doux, ponctué de néons Nocturne.",
    colors: {
      background: "#F5F3FA",
      surface: "#FFFFFF",
      surfaceRaised: "#F0EDF7",
      surfaceMuted: "#E8E3F1",
      border: "#DDD7E8",
      borderStrong: "#C9C1D9",
      text: "#17151E",
      textMuted: "#6F687A",
      textSubtle: "#91899E",
      mint: "#00A98C",
      violet: "#7557D9",
      pink: "#D92878",
      danger: "#C9345F",
      onAccent: "#FFFFFF",
      overlay: "rgba(18,12,28,.34)",
      tabBar: "rgba(255,255,255,.98)",
      statusBar: "dark",
      ticketBackground: "#FFFFFF",
      ticketText: "#17151E",
      ticketMuted: "#6F687A",
      qrBackground: "#FFFFFF",
    },
  },
  sunset: {
    name: "sunset",
    label: "Sunset",
    description: "Prune nocturne, corail et orange solaire.",
    colors: {
      background: "#17101D",
      surface: "#24162B",
      surfaceRaised: "#302039",
      surfaceMuted: "#3B2944",
      border: "#4A3152",
      borderStrong: "#68415D",
      text: "#FFF8F2",
      textMuted: "#C9B6C4",
      textSubtle: "#9D8295",
      mint: "#FFB45C",
      violet: "#D08BFF",
      pink: "#FF657D",
      danger: "#FF7A8F",
      onAccent: "#25111A",
      overlay: "rgba(28,8,28,.52)",
      tabBar: "rgba(34,20,42,.98)",
      statusBar: "light",
      ticketBackground: "#FFF4EC",
      ticketText: "#291521",
      ticketMuted: "#765B6C",
      qrBackground: "#FFFFFF",
    },
  },
};
const STORAGE_KEY = "nocturne.theme";
const ThemeContext = createContext({
  theme: themes.nocturne,
  setTheme: (_name: ThemeName) => {},
});
export function ThemeProvider({ children }: PropsWithChildren) {
  const [name, setName] = useState<ThemeName>("nocturne");
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value && value in themes) setName(value as ThemeName);
    });
  }, []);
  const value = useMemo(
    () => ({
      theme: themes[name],
      setTheme: (next: ThemeName) => {
        setName(next);
        void AsyncStorage.setItem(STORAGE_KEY, next);
      },
    }),
    [name],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
export function useAppTheme() {
  return useContext(ThemeContext);
}
