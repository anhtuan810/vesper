"use client";

import { useRouter } from "next/navigation";
import { LockIcon } from "@/components/icons/EmptyStateIcons";
import { DISCLAIMER_TEXT } from "@/lib/claude";

// Zero-asset landing. Adding assets goes through the guided setup (one asset at a
// time), so this screen has a single job: start it. No free-form composer — the one
// clear action is the button, which opens the guided flow.
export function PortfolioEmptyState() {
  const router = useRouter();

  // `?add=1` lets an already-onboarded user (who deleted everything) re-enter the
  // guided flow on purpose; the middleware only auto-bounces completed users off
  // /onboarding when they arrive WITHOUT it.
  const start = () => router.push("/onboarding?add=1");

  return (
    <div className="pes-wrap">
      {/* Privacy reassurance */}
      <div className="pes-pill">
        <LockIcon size={14} />
        <span>Private · stays on your device</span>
      </div>

      <h1 className="pes-title">Let&apos;s set up your portfolio.</h1>

      <p className="pes-sub">
        Add what you own — property, investments, savings, crypto — and I&apos;ll walk
        you through it, one thing at a time. It only takes a minute.
      </p>

      <button className="pes-btn" onClick={start}>
        Add your first asset
      </button>

      <p className="pes-disclaimer">{DISCLAIMER_TEXT}</p>

      <style>{`
        .pes-wrap {
          max-width: 460px; margin: 0 auto;
          padding: var(--space-6) 0 var(--space-6);
          display: flex; flex-direction: column; align-items: flex-start;
          text-align: left;
        }
        .pes-pill {
          display: inline-flex; align-items: center; gap: var(--space-1);
          background: var(--accent-soft); color: var(--accent-text);
          border-radius: var(--radius-pill); padding: var(--space-1) var(--space-2);
          font-family: var(--font-ui); font-size: var(--fs-caption); font-weight: 500;
        }
        .pes-title {
          font-family: var(--font-display); font-style: italic; font-weight: 400;
          font-size: var(--fs-hero, var(--fs-title)); line-height: var(--lh-snug);
          color: var(--hero); letter-spacing: var(--tracking-title);
          margin: var(--space-4) 0 0;
        }
        .pes-sub {
          font-family: var(--font-ui); font-size: var(--fs-subhead);
          color: var(--text-dim); line-height: var(--lh-body);
          margin: var(--space-3) 0 0;
        }
        .pes-btn {
          margin: var(--space-6) 0 0; width: 100%;
          display: flex; align-items: center; justify-content: center;
          background: var(--accent); color: var(--bg);
          border: none; border-radius: var(--radius-lg);
          padding: var(--space-4) var(--space-5); min-height: 58px;
          font-family: var(--font-ui); font-size: var(--fs-subhead); font-weight: 600;
          cursor: pointer; transition: transform 0.1s, filter 0.15s;
        }
        .pes-btn:hover { filter: brightness(1.05); }
        .pes-btn:active { transform: scale(0.985); }
        .pes-disclaimer {
          font-family: var(--font-ui); font-size: var(--fs-caption);
          color: var(--text-faint); line-height: var(--lh-body);
          margin: var(--space-4) 0 0;
        }
      `}</style>
    </div>
  );
}
