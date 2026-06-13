"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "oat";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("syncai-theme") as Theme) ?? "dark";
    setThemeState(saved);
    applyTheme(saved);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("syncai-theme", t);
    applyTheme(t);
  }

  // dark → light → oat → dark 순환
  function toggle() {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : prev === "light" ? "oat" : "dark";
      localStorage.setItem("syncai-theme", next);
      applyTheme(next);
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove("dark", "light", "oat");
  el.classList.add(theme);
}
