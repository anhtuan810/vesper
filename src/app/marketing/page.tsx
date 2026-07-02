import "./twilight.css";
import { Inter } from "next/font/google";
import { I18nProvider } from "@/components/marketing/i18n";
import { MarketingBody } from "@/components/marketing/MarketingBody";

// The one instrument family (Nocturne): Inter carries display, body, labels
// and tabular figures alike. Loaded via next/font and exposed only as a CSS
// variable on the marketing wrapper — the app's own typography is untouched.
// (The Twilight-era Spectral serif + IBM Plex Mono loaders are gone: two
// webfonts fewer on the landing page.)
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--mkt-sans", display: "swap" });

export default function MarketingPage() {
  return (
    <div
      id="tw-root"
      data-theme="light"
      className={`tw ${inter.variable}`}
    >
      {/* Icon sprite — referenced via <use href="#i-…"> across the page. */}
      <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h13M12 6l6 6-6 6" /></symbol>
        <symbol id="i-up" viewBox="0 0 24 24"><path d="M12 19V6M6 12l6-6 6 6" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l8 3v5c0 5-3.6 8-8 9-4.4-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></symbol>
        <symbol id="i-ban" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></symbol>
        <symbol id="i-msgoff" viewBox="0 0 24 24"><path d="M4 5h13M20 8v5c0 1-1 2-2 2h-6l-4 4v-4" /><path d="M4 4l16 16" /></symbol>
        <symbol id="i-msg" viewBox="0 0 24 24"><path d="M5 5h14v11H10l-4 4v-4H5z" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3.5 2" /></symbol>
        <symbol id="i-news" viewBox="0 0 24 24"><path d="M16 5H4v13a1 1 0 0 0 1 1h11" /><path d="M16 8h3a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2" /><path d="M7 9h6M7 12.5h6M7 16h4" /></symbol>
        <symbol id="i-scan" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M16 16l4 4" /></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></symbol>
        <symbol id="i-radar" viewBox="0 0 24 24"><path d="M19.8 8A9 9 0 1 0 21 12" /><path d="M12 12l5-3" /><circle cx="12" cy="12" r="1.6" /></symbol>
      </svg>

      <I18nProvider>
        <MarketingBody />
      </I18nProvider>
    </div>
  );
}
