import "./marketing.css";
import Link from "next/link";
import { VolnarLogo } from "@/components/VolnarLogo";
import { RevealOnScroll } from "@/components/landing/RevealOnScroll";
import { Hero } from "@/components/sections/Hero";
import { Diary } from "@/components/sections/Diary";
import { MarketEvents } from "@/components/sections/MarketEvents";
import { ChatInput } from "@/components/sections/ChatInput";
import { Scenario } from "@/components/sections/Scenario";
import { AssetOverview } from "@/components/sections/AssetOverview";
import { QnA } from "@/components/sections/QnA";
import { PullQuote } from "@/components/sections/PullQuote";
import { Privacy } from "@/components/sections/Privacy";

export default function MarketingPage() {
  return (
    <div className="min-h-dvh bg-bg flex flex-col overflow-x-hidden" style={{ position: "relative" }}>

      {/* Paper grain overlay — scoped to this page */}
      <div className="mkt-grain" aria-hidden="true" />

      {/* IntersectionObserver for .reveal + .alert-chip-anim */}
      <RevealOnScroll />

      {/* Topbar */}
      <div className="max-w-[1200px] mx-auto w-full" style={{ padding: "0 var(--wrap-pad)" }}>
        <header className="flex items-center justify-between py-[22px]">
          <Link href="/" className="inline-flex items-center gap-2 no-underline">
            <VolnarLogo size={28} />
            <span
              className="font-serif font-medium text-hero tracking-[-0.01em]"
              style={{ fontSize: 22, fontVariationSettings: "'opsz' 24" }}
            >
              Volnar
            </span>
          </Link>
          <a
            href="https://app.volnar.nl"
            className="text-sm text-fg inline-flex items-center transition-colors hover:bg-surface"
            style={{ padding: "10px 16px", minHeight: 44, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", textDecoration: "none" }}
          >
            Sign in
          </a>
        </header>
      </div>

      {/* ── Sections in v15 order ── */}
      <Hero />
      <Diary />
      <MarketEvents />
      <ChatInput />
      <Scenario />
      <AssetOverview />
      <QnA />
      <PullQuote />
      <Privacy />

      {/* Footer */}
      <footer
        className="flex justify-center items-center gap-4 text-faint"
        style={{
          padding: "24px var(--wrap-pad) calc(28px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid var(--border)",
          fontSize: 13,
        }}
      >
        <span className="font-serif text-dim" style={{ fontSize: 15 }}>Volnar</span>
        <Link
          href="/privacy"
          className="text-dim no-underline transition-colors hover:text-fg"
        >
          Privacy
        </Link>
        <Link
          href="/terms"
          className="text-dim no-underline transition-colors hover:text-fg"
        >
          Terms
        </Link>
      </footer>

    </div>
  );
}
