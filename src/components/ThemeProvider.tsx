"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiFetch, isNativeBuild } from "@/lib/api";

type ThemeMode = "light" | "dark";

const THEME_KEY = "volnar.theme";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemeMode;
  children: ReactNode;
}) {
  // Native build: the static HTML bakes initialTheme="light"; the real value
  // lives in localStorage (already applied pre-paint by the root layout's
  // inline script), so state initializes from it instead of reverting on mount.
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (isNativeBuild && typeof window !== "undefined") {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "light") return stored;
    }
    return initialTheme;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // Native: match the iOS keyboard appearance to the app theme — otherwise a
    // dark-mode phone shows a black keyboard under the light UI (and vice versa).
    if (isNativeBuild) {
      (async () => {
        try {
          const { Capacitor } = await import("@capacitor/core");
          if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Keyboard")) return;
          const { Keyboard, KeyboardStyle } = await import("@capacitor/keyboard");
          await Keyboard.setStyle({ style: theme === "dark" ? KeyboardStyle.Dark : KeyboardStyle.Light });
        } catch {
          // Cosmetic — older binaries without the plugin keep the OS default.
        }
      })();
    }
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    document.cookie = `volnar.theme=${mode}; path=/; max-age=31536000; samesite=lax`;
    try { window.localStorage.setItem(THEME_KEY, mode); } catch {}
    apiFetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: mode }),
    }).catch((err) => console.error("Failed to persist theme:", err));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
