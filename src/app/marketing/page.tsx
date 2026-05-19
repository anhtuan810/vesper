import Link from "next/link";
import { VolnarLogo } from "@/components/VolnarLogo";
import { Hero } from "@/components/sections/Hero";
import { ChatInput } from "@/components/sections/ChatInput";
import { AssetOverview } from "@/components/sections/AssetOverview";
import { QnA } from "@/components/sections/QnA";
import { MarketEvents } from "@/components/sections/MarketEvents";
import { Diary } from "@/components/sections/Diary";
import { WhatItIsnt } from "@/components/sections/WhatItIsnt";
import { Privacy } from "@/components/sections/Privacy";

export default function MarketingPage() {
  return (
    <div className="min-h-dvh bg-bg flex flex-col overflow-x-hidden">

      {/* ── Topbar ── */}
      <div className="max-w-[1200px] mx-auto w-full" style={{ padding: "0 var(--wrap-pad)" }}>
        <header className="flex items-center justify-between py-[22px]">
          <Link href="/" className="inline-flex items-center gap-2 no-underline">
            <VolnarLogo size={28} />
            <span
              className="font-serif font-medium text-[22px] text-hero tracking-[-0.01em]"
              style={{ fontVariationSettings: "'opsz' 24" }}
            >
              Volnar
            </span>
          </Link>
          <a
            href="https://app.volnar.nl"
            className="text-sm text-fg inline-flex items-center px-4 py-[10px] min-h-[44px] border border-border-strong rounded-md hover:bg-surface transition-colors"
          >
            Sign in
          </a>
        </header>
      </div>

      {/* ── Sections ── */}
      <Hero />
      <ChatInput />
      <AssetOverview />
      <QnA />
      <MarketEvents />
      <Diary />
      <WhatItIsnt />
      <Privacy />

    </div>
  );
}
