"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
export type WebThemeName = "nocturne" | "obsidian" | "dawn" | "sunset";
const KEY = "nocturne.theme.web";
const Context = createContext({
  theme: "nocturne" as WebThemeName,
  setTheme: (_theme: WebThemeName) => {},
});
export default function WebThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setValue] = useState<WebThemeName>("nocturne");
  useEffect(() => {
    const stored = localStorage.getItem(KEY) as WebThemeName | null;
    if (stored && ["nocturne", "obsidian", "dawn", "sunset"].includes(stored))
      setValue(stored);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme =
      theme === "dawn" ? "light" : "dark";
  }, [theme]);
  const value = useMemo(
    () => ({
      theme,
      setTheme: (next: WebThemeName) => {
        setValue(next);
        localStorage.setItem(KEY, next);
      },
    }),
    [theme],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWebTheme() {
  return useContext(Context);
}
