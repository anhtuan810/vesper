"use client";

import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from "react";
import { en } from "./en";
import { nl } from "./nl";
import { de } from "./de";
import { fr } from "./fr";

export type Lang = "EN" | "NL" | "DE" | "FR";

// The English dictionary defines the shape every locale must satisfy.
export type Messages = typeof en;

export const LANGS: ReadonlyArray<readonly [Lang, string]> = [
  ["EN", "English"],
  ["NL", "Nederlands"],
  ["DE", "Deutsch"],
  ["FR", "Français"],
];

const MESSAGES: Record<Lang, Messages> = { EN: en, NL: nl, DE: de, FR: fr };

// ── Rich-text rendering ──────────────────────────────────────────────────────
// Dictionary values for emphasised copy are arrays of segments; a heading is an
// array of such lines (joined with <br>).
type Seg = string | { g: string } | { acc: string } | { b: string } | { auto: string };

function renderSeg(s: Seg, i: number): ReactNode {
  if (typeof s === "string") return <Fragment key={i}>{s}</Fragment>;
  if ("g" in s) return <span key={i} className="g">{s.g}</span>;
  if ("acc" in s)
    return (
      <span key={i} className="acc">
        {s.acc}
        <svg viewBox="0 0 200 12" preserveAspectRatio="none">
          <path d="M4 8C55 2 150 2 196 6" />
        </svg>
      </span>
    );
  if ("b" in s) return <b key={i}>{s.b}</b>;
  return (
    <span key={i} style={{ color: "var(--auto)", fontWeight: 600 }}>
      {s.auto}
    </span>
  );
}

/** Render one line of rich text. */
export function Line({ line }: { line: readonly Seg[] }) {
  return <>{line.map((s, i) => renderSeg(s, i))}</>;
}

/** Render a heading made of one or more lines (joined with <br>). */
export function Heading({ lines }: { lines: readonly (readonly Seg[])[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.map((s, j) => renderSeg(s, j))}
        </Fragment>
      ))}
    </>
  );
}

// ── Context ──────────────────────────────────────────────────────────────────
type I18nValue = { lang: Lang; setLang: (l: Lang) => void; m: Messages };
const I18nContext = createContext<I18nValue>({ lang: "EN", setLang: () => {}, m: en });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("EN");
  // Keep the document language in sync with the chosen locale so screen readers
  // pronounce the translated copy correctly. The root layout renders lang="en" for
  // SSR (the default), and this updates it live when the picker switches language.
  useEffect(() => {
    document.documentElement.lang = lang.toLowerCase();
  }, [lang]);
  return <I18nContext.Provider value={{ lang, setLang, m: MESSAGES[lang] }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
