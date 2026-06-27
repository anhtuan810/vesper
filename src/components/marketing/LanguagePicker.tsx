"use client";

import { useEffect, useState } from "react";
import { LANGS, useI18n } from "./i18n";

// Switches the page language live (via the i18n context) — no reload, so the
// theme and scroll position are preserved. Language names stay as endonyms.
export function LanguagePicker() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);

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
        <span className="lang-cur">{lang}</span>
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
            aria-selected={lang === code}
            className={lang === code ? "on" : undefined}
            onClick={(ev) => {
              ev.stopPropagation();
              setLang(code);
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
