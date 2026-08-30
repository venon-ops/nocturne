"use client";
import { Check } from "lucide-react";
import { useWebTheme, type WebThemeName } from "./WebThemeProvider";
const choices: {
  name: WebThemeName;
  label: string;
  description: string;
  colors: string[];
}[] = [
  {
    name: "nocturne",
    label: "Nocturne",
    description: "Menthe, violet et rose néon.",
    colors: ["#080a14", "#f8f7ff", "#53f6d4", "#a888ff"],
  },
  {
    name: "obsidian",
    label: "Obsidienne",
    description: "Graphite, gris et blanc.",
    colors: ["#111214", "#fafafa", "#d9fff7", "#c8bcff"],
  },
  {
    name: "dawn",
    label: "Aube",
    description: "Clair avec des accents Nocturne.",
    colors: ["#f5f3fa", "#17151e", "#00a98c", "#7557d9"],
  },
  {
    name: "sunset",
    label: "Sunset",
    description: "Prune, corail et orange solaire.",
    colors: ["#17101d", "#fff8f2", "#ffb45c", "#ff657d"],
  },
];
export default function WebThemeSelector() {
  const { theme, setTheme } = useWebTheme();
  return (
    <section className="web-theme-settings" aria-labelledby="theme-title">
      <p className="eyebrow">APPARENCE</p>
      <h2 id="theme-title">Thème de NOCTURNE</h2>
      <p>Le choix est mémorisé dans ce navigateur.</p>
      <div>
        {choices.map((choice) => (
          <button
            type="button"
            className={theme === choice.name ? "active" : ""}
            onClick={() => setTheme(choice.name)}
            key={choice.name}
          >
            <span className="web-theme-preview">
              {choice.colors.map((color) => (
                <i style={{ backgroundColor: color }} key={color} />
              ))}
            </span>
            <span>
              <strong>{choice.label}</strong>
              <small>{choice.description}</small>
            </span>
            {theme === choice.name ? <Check size={18} /> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
