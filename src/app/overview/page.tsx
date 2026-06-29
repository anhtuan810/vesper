import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Spectral, Inter, IBM_Plex_Mono } from "next/font/google";
import { VolnarLogo } from "@/components/VolnarLogo";
import { OverviewChart } from "@/components/overview/OverviewChart";
import { OverviewHoldings } from "@/components/overview/OverviewHoldings";
import { Composer } from "@/components/overview/Composer";
import {
  NET_WORTH,
  NET_WORTH_BASIS,
  NET_WORTH_BADGE,
  RANGES,
  ACTIVE_RANGE,
  VITALS,
  LEDGER,
  DASH_FOOT,
  RAIL_LOGS,
  DOCK_LOG,
  RAIL_NOTE,
  RAIL_DISCLAIMER,
  DOCK_DISCLAIMER,
} from "@/components/overview/data";
import "./twilight-app.css";

export const metadata: Metadata = { title: "Overview" };

// Brand webfonts the Twilight design uses, loaded via next/font and exposed
// ONLY as CSS variables on this screen's wrapper (--vapp-*) — the rest of the
// app's typography is untouched. Mirrors the marketing page's scoped approach.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--vapp-sans", display: "swap" });
const spectral = Spectral({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--vapp-serif", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--vapp-mono", display: "swap" });

// Nav tabs map to the closest existing app routes; Overview is the current page.
const TABS = [
  { label: "Overview", href: "/overview", on: true },
  { label: "Journal", href: "/diary", on: false },
  { label: "Vitals", href: "/vitals", on: false },
  { label: "Holdings", href: "/", on: false },
];

// Vitals mini-charts — presentational SVG, one per VITALS row (same order).
const VITAL_SVGS: ReactNode[] = [
  <svg className="vc" viewBox="0 0 100 24" key="0" aria-hidden="true">
    <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
    <rect className="vc-warn" x="0" y="9" width="38" height="7" rx="2.5" />
    <line className="vc-thr" x1="35" y1="4.5" x2="35" y2="20.5" />
    <text className="vc-lbl" x="35" y="3" textAnchor="middle">35%</text>
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="1" aria-hidden="true">
    <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
    <rect className="vc-ok" x="0" y="9" width="54" height="7" rx="2.5" />
    <rect className="vc-okm" x="54.5" y="9" width="7" height="7" />
    <line className="vc-thr" x1="15" y1="4.5" x2="15" y2="20.5" />
    <text className="vc-lbl" x="15" y="3" textAnchor="middle">15%</text>
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="2" aria-hidden="true">
    <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
    <rect className="vc-ok" x="0" y="9" width="28" height="7" rx="2.5" />
    <line className="vc-thr" x1="50" y1="4.5" x2="50" y2="20.5" />
    <line className="vc-thr" x1="75" y1="4.5" x2="75" y2="20.5" />
    <text className="vc-lbl" x="50" y="3" textAnchor="middle">50</text>
    <text className="vc-lbl" x="75" y="3" textAnchor="middle">75</text>
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="3" aria-hidden="true">
    <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
    <rect className="vc-ok" x="0" y="9" width="77" height="7" rx="2.5" />
    <rect className="vc-bad" x="77" y="9" width="23" height="7" rx="2.5" />
    <line className="vc-thr" x1="75" y1="4.5" x2="75" y2="20.5" />
    <text className="vc-lbl" x="75" y="3" textAnchor="middle">−25%</text>
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="4" aria-hidden="true">
    <line className="vc-base" x1="0" y1="11" x2="100" y2="11" />
    <rect className="vc-ok" x="8" y="3.2" width="15" height="7.8" />
    <rect className="vc-bad" x="30" y="3.2" width="15" height="8.5" />
    <rect className="vc-bad" x="52" y="11.7" width="15" height="2.3" />
    <rect className="vc-warn" x="74" y="11" width="17" height="3" />
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="5" aria-hidden="true">
    <polyline className="vc-mut-s" points="0,18 9,17 18,17.4 27,16 36,15 45,14.4 55,12 64,11 73,9.4 82,8 91,6.4 100,5" />
    <polyline className="vc-ok-s" points="0,18 9,17.3 18,18 27,16.8 36,16 45,15.6 55,13.4 64,12.6 73,11 82,9.8 91,8.6 100,8" />
  </svg>,
];

function LoggedLine({ title, detail }: { title: string; detail: string }) {
  return (
    <>
      Logged · <b>{title}</b> · {detail}
    </>
  );
}

export default function OverviewPage() {
  return (
    <div className={`vapp ${inter.variable} ${spectral.variable} ${plexMono.variable}`} data-theme="light">
      {/* ── Nav (reuses the real VolnarLogo, not the mockup's placeholder) ── */}
      <nav className="nav">
        <div className="nav-in">
          <span className="brand">
            <VolnarLogo size={26} />
            <span className="wm">Volnar</span>
          </span>
          <div className="tabs">
            {TABS.map((t) => (
              <Link
                key={t.label}
                href={t.href}
                className={`tab${t.on ? " on" : ""}`}
                aria-current={t.on ? "page" : undefined}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <div className="nav-r">
            <span className="priv">
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Private · EU
            </span>
            <span className="av" aria-hidden="true">AT</span>
          </div>
        </div>
      </nav>

      <div className="shell">
        <main className="content scroll">
          <div className="head">
            <div>
              <span className="eyebrow">Overview</span>
              <div className="hello">Good afternoon, Anh Tuan.</div>
            </div>
            <div className="date">Saturday · 27 June 2026</div>
          </div>

          {/* ── Dashboard card ── */}
          <section className="dash">
            <div className="dash-h">
              <div>
                <span className="eyebrow">Net worth</span>
                <div className="nwnum">{NET_WORTH}</div>
                <div className="nwbasis">
                  {NET_WORTH_BASIS}{" "}
                  <span className="badge" style={{ marginLeft: 6 }}>{NET_WORTH_BADGE}</span>
                </div>
              </div>
              <div className="range" role="group" aria-label="Time range">
                {RANGES.map((r) => (
                  <button key={r} type="button" className={r === ACTIVE_RANGE ? "on" : undefined} aria-pressed={r === ACTIVE_RANGE}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <OverviewChart />
            <OverviewHoldings />

            <div className="dash-foot">
              <span className="dots" aria-hidden="true">
                <i /><i /><i /><i /><i className="w" /><i className="w" />
              </span>
              {DASH_FOOT}
            </div>
          </section>

          {/* ── Vitals ── */}
          <section className="sec">
            <div className="sec-top">
              <div>
                <span className="eyebrow">Vitals</span>
                <h2>Not just what you own — <span className="g">how well it&apos;s built.</span></h2>
              </div>
              <Link className="lk" href="/vitals">See all Vitals →</Link>
            </div>
            <div className="vrow">
              {VITALS.map((v, i) => (
                <div className={`vital ${v.band}`} key={v.name}>
                  <div className="vt-top">
                    <span className="vt-name">{v.name}</span>
                    <span className="vt-band">{v.label}</span>
                  </div>
                  <div className="vt-val">{v.val}<span>{v.unit}</span></div>
                  {VITAL_SVGS[i]}
                  <div className="vt-read">{v.read}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Decision journal ── */}
          <section className="sec">
            <div className="sec-top">
              <div>
                <span className="eyebrow">Decision journal</span>
                <h2>Every change, <span className="g">with the reason.</span></h2>
              </div>
              <Link className="lk" href="/diary">All 12 entries →</Link>
            </div>
            <div className="ledger">
              {LEDGER.map((row) => (
                <div className="led" key={row.title}>
                  <span className={`led-dot${row.dn ? " dn" : ""}`} />
                  <span className="led-date">{row.date}</span>
                  <div className="led-m">
                    <div className="led-l1">
                      <span className="led-title">{row.title}</span>
                      <span className={`led-tag${row.tag === "Auto" ? " auto" : ""}`}>{row.tag}</span>
                    </div>
                    <div className="led-why">{row.why}</div>
                  </div>
                  <span className={`led-imp${row.dn ? " dn" : ""}`}>{row.imp}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Private by design ── */}
          <section className="sec" style={{ marginBottom: 0 }}>
            <div className="trust">
              <span className="t">Private by design.</span>
              <div className="items">
                <span className="it">
                  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  EU-hosted
                </span>
                <span className="it">
                  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z" />
                    <path d="M9 9h6" />
                  </svg>
                  Append-only journal
                </span>
                <span className="it">
                  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8 12h8" />
                  </svg>
                  No broker sync
                </span>
              </div>
            </div>
          </section>
        </main>

        {/* ── Persistent chat rail (wide screens) ── */}
        <aside className="chatrail" aria-label="Volnar">
          <div className="cr-head">
            <span className="cr-title"><span className="cr-dot" />Volnar</span>
            <span className="cr-sub">Single thread</span>
          </div>
          <div className="cr-body scroll">
            <div className="cr-note">{RAIL_NOTE}</div>
            <div className="cr-loglist">
              {RAIL_LOGS.map((l) => (
                <div className="cr-log" key={l.title}>
                  <span className="d" />
                  <span><LoggedLine title={l.title} detail={l.detail} /></span>
                </div>
              ))}
            </div>
          </div>
          <div className="cr-foot">
            <Composer />
            <div className="disc">{RAIL_DISCLAIMER}</div>
          </div>
        </aside>
      </div>

      {/* ── Docked composer (narrow screens, swapped in for the rail) ── */}
      <div className="dock">
        <div className="dock-in">
          <div className="logged">
            <span className="pill"><span className="d" /><LoggedLine title={DOCK_LOG.title} detail={DOCK_LOG.detail} /></span>
          </div>
          <Composer />
          <div className="disc">{DOCK_DISCLAIMER}</div>
        </div>
      </div>
    </div>
  );
}
