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
    // Keep the browser-chrome tint / native WebView background in sync with the
    // chosen theme on a runtime toggle (the per-request viewport sets the initial
    // value; without this the address-bar tint would keep the load-time colour).
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute("content", theme === "dark" ? "#131109" : "#F6F5F1"));
    // Native: match the iOS keyboard AND status bar to the app theme. Both follow
    // the system light/dark by default, so a user whose OS appearance disagrees
    // with their chosen in-app theme would otherwise get a black keyboard under a
    // light UI, or dark-on-dark (invisible) status-bar clock/battery.
    if (isNativeBuild) {
      (async () => {
        try {
          const { Capacitor } = await import("@capacitor/core");
          if (!Capacitor.isNativePlatform()) return;
          if (Capacitor.isPluginAvailable("Keyboard")) {
            const { Keyboard, KeyboardStyle } = await import("@capacitor/keyboard");
            await Keyboard.setStyle({ style: theme === "dark" ? KeyboardStyle.Dark : KeyboardStyle.Light });
          }
          if (Capacitor.isPluginAvailable("StatusBar")) {
            // Capacitor Style.Dark = light glyphs (for a dark background);
            // Style.Light = dark glyphs (for a light background).
            const { StatusBar, Style } = await import("@capacitor/status-bar");
            await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
          }
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
