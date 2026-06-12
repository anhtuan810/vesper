import "./marketing.css";
import Link from "next/link";
import { VolnarLogo } from "@/components/VolnarLogo";
import { RevealOnScroll } from "@/components/landing/RevealOnScroll";
import { Hero } from "@/components/sections/Hero";
import { Ticker } from "@/components/sections/Ticker";
import { Diary } from "@/components/sections/Diary";
import { MarketEvents } from "@/components/sections/MarketEvents";
import { ChatInput } from "@/components/sections/ChatInput";
import { Scenario } from "@/components/sections/Scenario";
import { AssetOverview } from "@/components/sections/AssetOverview";
import { QnA } from "@/components/sections/QnA";
import { PullQuote } from "@/components/sections/PullQuote";
import { Privacy } from "@/components/sections/Privacy";
import { ClosingCta } from "@/components/sections/ClosingCta";

export default function MarketingPage() {
  return (
    <div className="min-h-dvh bg-bg flex flex-col overflow-x-hidden" style={{ position: "relative" }}>

      {/* Paper grain overlay — scoped to this page */}
      <div className="mkt-grain" aria-hidden="true" />

      {/* IntersectionObserver for .reveal + .alert-chip-anim */}
      <RevealOnScroll />

      {/* Topbar — sticky, frosted like the app's nav */}
      <header className="mkt-topbar">
        <div className="mkt-topbar-inner">
          <Link href="/" className="inline-flex items-center gap-2 no-underline">
            <VolnarLogo size={26} />
            <span
              className="font-serif font-medium text-hero tracking-[-0.01em]"
              style={{ fontSize: 21, fontVariationSettings: "'opsz' 24" }}
            >
              Volnar
            </span>
          </Link>
          <nav className="mkt-nav" aria-label="Sections">
            <a href="#diary">Diary</a>
            <a href="#signals">Signals</a>
            <a href="#scenarios">Scenarios</a>
            <a href="#coverage">Coverage</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="flex items-center gap-2 ml-auto min-[880px]:ml-0">
            <a
              href="https://app.volnar.nl"
              className="text-sm text-dim transition-colors hover:text-fg max-[480px]:hidden"
              style={{ padding: "10px 12px", textDecoration: "none" }}
            >
              Sign in
            </a>
            <a href="https://app.volnar.nl" className="mkt-btn mkt-btn-primary" style={{ minHeight: 38, padding: "8px 16px" }}>
              Get started
            </a>
          </div>
        </div>
      </header>

      {/* ── Sections ── */}
      <Hero />
      <Ticker />
      <Diary />
      <MarketEvents />
      <ChatInput />
      <Scenario />
      <AssetOverview />
      <QnA />
      <PullQuote />
      <Privacy />
      <ClosingCta />

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-[1200px] mx-auto w-full" style={{ padding: "clamp(32px,5vw,52px) var(--wrap-pad) calc(24px + env(safe-area-inset-bottom, 0px))" }}>
          <div className="grid gap-10 min-[720px]:grid-cols-[1fr_auto_auto] min-[720px]:gap-16">
            <div>
              <div className="inline-flex items-center gap-2">
                <VolnarLogo size={24} />
                <span className="font-serif font-medium text-hero tracking-[-0.01em]" style={{ fontSize: 19, fontVariationSettings: "'opsz' 20" }}>
                  Volnar
                </span>
              </div>
              <p className="font-serif italic text-dim mt-2" style={{ fontSize: 14, maxWidth: 320, lineHeight: 1.5 }}>
                Wealth. Watched over.
              </p>
            </div>
            <div>
              <div className="font-mono uppercase text-faint mb-3" style={{ fontSize: 10, letterSpacing: "0.18em" }}>
                Product
              </div>
              <div className="flex flex-col gap-2 text-[13.5px]">
                <a href="https://app.volnar.nl" className="text-dim no-underline transition-colors hover:text-fg">Sign in</a>
                <a href="https://app.volnar.nl/demo" className="text-dim no-underline transition-colors hover:text-fg">Live demo</a>
              </div>
            </div>
            <div>
              <div className="font-mono uppercase text-faint mb-3" style={{ fontSize: 10, letterSpacing: "0.18em" }}>
                Legal
              </div>
              <div className="flex flex-col gap-2 text-[13.5px]">
                <Link href="/privacy" className="text-dim no-underline transition-colors hover:text-fg">Privacy</Link>
                <Link href="/terms" className="text-dim no-underline transition-colors hover:text-fg">Terms</Link>
              </div>
            </div>
          </div>
          <div
            className="flex items-center justify-between gap-4 flex-wrap border-t border-border text-faint"
            style={{ marginTop: "clamp(28px,4vw,40px)", paddingTop: 20, fontSize: 12.5 }}
          >
            <span>© 2026 Volnar · NovaHub B.V.</span>
            <span className="font-serif italic">EU-hosted · self-funded · read-only by design</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
