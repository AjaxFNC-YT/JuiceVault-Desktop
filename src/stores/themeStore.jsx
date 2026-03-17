import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { updateUserPreferences } from "@/lib/api";

export const THEMES = [
  {
    id: "default",
    name: "Crimson Night",
    bg: "#050505",
    gradients: [
      "radial-gradient(ellipse 80% 70% at 25% 20%, rgba(80, 10, 20, 0.5) 0%, transparent 70%)",
      "radial-gradient(ellipse 60% 60% at 75% 60%, rgba(40, 10, 60, 0.4) 0%, transparent 70%)",
    ],
    preview: ["#500a14", "#280a3c"],
    accent: ["#e83a5d", "#9333ea"],
  },
  {
    id: "midnight",
    name: "Midnight Blue",
    bg: "#030812",
    gradients: [
      "radial-gradient(ellipse 80% 70% at 20% 25%, rgba(10, 30, 80, 0.5) 0%, transparent 70%)",
      "radial-gradient(ellipse 60% 60% at 80% 65%, rgba(15, 10, 60, 0.4) 0%, transparent 70%)",
    ],
    preview: ["#0a1e50", "#0f0a3c"],
    accent: ["#3b82f6", "#6366f1"],
  },
  {
    id: "emerald",
    name: "Emerald Forest",
    bg: "#030a05",
    gradients: [
      "radial-gradient(ellipse 80% 70% at 30% 20%, rgba(10, 60, 30, 0.5) 0%, transparent 70%)",
      "radial-gradient(ellipse 60% 60% at 70% 65%, rgba(5, 40, 40, 0.35) 0%, transparent 70%)",
    ],
    preview: ["#0a3c1e", "#052828"],
    accent: ["#10b981", "#14b8a6"],
  },
  {
    id: "sunset",
    name: "Sunset",
    bg: "#0a0505",
    gradients: [
      "radial-gradient(ellipse 80% 70% at 25% 25%, rgba(100, 30, 10, 0.45) 0%, transparent 70%)",
      "radial-gradient(ellipse 60% 60% at 75% 60%, rgba(80, 50, 5, 0.35) 0%, transparent 70%)",
    ],
    preview: ["#641e0a", "#503205"],
    accent: ["#f97316", "#eab308"],
  },
  {
    id: "arctic",
    name: "Arctic",
    bg: "#040608",
    gradients: [
      "radial-gradient(ellipse 80% 70% at 25% 25%, rgba(15, 50, 70, 0.45) 0%, transparent 70%)",
      "radial-gradient(ellipse 60% 60% at 75% 60%, rgba(30, 30, 60, 0.35) 0%, transparent 70%)",
    ],
    preview: ["#0f3246", "#1e1e3c"],
    accent: ["#38bdf8", "#818cf8"],
  },
  {
    id: "void",
    name: "Void",
    bg: "#020202",
    gradients: [],
    preview: ["#0a0a0a", "#050505"],
    accent: ["#e83a5d", "#9333ea"],
  },
  {
    id: "rose",
    name: "Rose Gold",
    bg: "#080404",
    gradients: [
      "radial-gradient(ellipse 80% 70% at 30% 25%, rgba(80, 25, 40, 0.4) 0%, transparent 70%)",
      "radial-gradient(ellipse 60% 60% at 70% 65%, rgba(60, 30, 20, 0.3) 0%, transparent 70%)",
    ],
    preview: ["#501928", "#3c1e14"],
    accent: ["#f43f5e", "#d97706"],
  },
  {
    id: "aurora",
    name: "Aurora",
    bg: "#030808",
    gradients: [
      "radial-gradient(ellipse 70% 60% at 20% 30%, rgba(10, 60, 60, 0.4) 0%, transparent 70%)",
      "radial-gradient(ellipse 50% 50% at 80% 50%, rgba(30, 10, 60, 0.35) 0%, transparent 70%)",
      "radial-gradient(ellipse 40% 40% at 50% 80%, rgba(10, 50, 30, 0.25) 0%, transparent 70%)",
    ],
    preview: ["#0a3c3c", "#1e0a3c"],
    accent: ["#2dd4bf", "#a78bfa"],
  },
];

export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [themeId, _setThemeId] = useState(() => localStorage.getItem("theme") || "default");

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];

  const setThemeId = useCallback((id) => {
    _setThemeId(id);
    localStorage.setItem("theme", id);
    updateUserPreferences({ theme: id }).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
