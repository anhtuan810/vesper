"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type ThemeMode = "auto" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function resolveAuto(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemeMode;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    initialTheme === "dark" ? "dark" : "light"
  );

  useEffect(() => {
    const resolved = theme === "auto" ? resolveAuto() : theme;
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);

    if (theme !== "auto") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? "dark" : "light";
      setResolvedTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    document.cookie = `volnar.theme=${mode}; path=/; max-age=31536000; samesite=lax`;
    fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: mode }),
    }).catch((err) => console.error("Failed to persist theme:", err));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
