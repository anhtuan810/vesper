"use client";

import { useEffect, useState } from "react";

const LANGS: ReadonlyArray<readonly [string, string]> = [
  ["EN", "English"],
  ["NL", "Nederlands"],
  ["DE", "Deutsch"],
  ["FR", "Français"],
];

// Visual-only language picker, matching the mockup: it swaps the shown code but
// performs no real i18n (the page ships a single static locale).
export function LanguagePicker() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("EN");

  useEffect(() => {
    if (!open) return;
    const onClick = () => setOpen(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`lang${open ? " open" : ""}`}>
      <button
        className="lang-btn"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(ev) => {
          ev.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <svg className="ic" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
        </svg>
        <span className="lang-cur">{cur}</span>
        <svg className="lang-car" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="lang-menu" role="listbox">
        {LANGS.map(([code, name]) => (
          <button
            key={code}
            type="button"
            role="option"
            aria-selected={cur === code}
            className={cur === code ? "on" : undefined}
            onClick={(ev) => {
              ev.stopPropagation();
              setCur(code);
              setOpen(false);
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
