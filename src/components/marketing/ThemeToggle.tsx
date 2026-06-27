"use client";

import { useState } from "react";

// Flips data-theme on the marketing wrapper only (id="tw-root"). Light is the
// default initial paint; this never touches the app's own <html data-theme>.
export function ThemeToggle() {
  const [mode, setMode] = useState<"light" | "dark">("light");

  function set(next: "light" | "dark") {
    setMode(next);
    document.getElementById("tw-root")?.setAttribute("data-theme", next);
  }

  return (
    <div className="themesw" role="group" aria-label="Color theme">
      <button
        className="tsw"
        type="button"
        aria-label="Light theme"
        aria-pressed={mode === "light"}
        onClick={() => set("light")}
      >
        <svg viewBox="0 0 24 24" className="ic">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.6V5M12 19v2.4M4.4 4.4 6 6M18 18l1.6 1.6M2.6 12H5M19 12h2.4M4.4 19.6 6 18M18 6l1.6-1.6" />
        </svg>
      </button>
      <button
        className="tsw"
        type="button"
        aria-label="Dark theme"
        aria-pressed={mode === "dark"}
        onClick={() => set("dark")}
      >
        <svg viewBox="0 0 24 24" className="ic">
          <path d="M20.5 14.8A8 8 0 1 1 9.2 3.5a6.4 6.4 0 0 0 11.3 11.3Z" />
        </svg>
      </button>
    </div>
  );
}
