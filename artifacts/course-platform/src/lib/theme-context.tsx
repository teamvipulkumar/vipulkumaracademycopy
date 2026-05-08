import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "midnight";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

const ALL_THEMES: Theme[] = ["dark", "light", "midnight"];

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "midnight";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      // Allow ?theme=light|dark|midnight URL query string to preview a theme
      // without needing to manually flip localStorage. Useful for design QA.
      const urlTheme = new URLSearchParams(window.location.search).get("theme");
      if (isTheme(urlTheme)) return urlTheme;
      const stored = localStorage.getItem("vka-theme");
      // Migrate any legacy "forest" preference back to dark.
      if (isTheme(stored)) return stored;
    } catch {}
    return "dark";
  });

  // Apply the active theme class to <html> on every change.
  // Persistence is handled in setTheme/toggleTheme below — NOT here — so a
  // QA visit to `?theme=light` does not permanently overwrite the user's
  // saved preference in localStorage.
  useEffect(() => {
    const root = document.documentElement;
    // Strip the legacy `forest` class as well so users coming from a stale
    // session don't get a half-applied forest palette.
    root.classList.remove("dark", "light", "midnight", "forest");
    root.classList.add(theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem("vka-theme", t); } catch {}
  };
  const toggleTheme = () => {
    const next = ALL_THEMES[(ALL_THEMES.indexOf(theme) + 1) % ALL_THEMES.length];
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
