import "./twilight.css";
import Link from "next/link";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { VolnarLogo } from "@/components/VolnarLogo";
import { ThemeToggle } from "@/components/marketing/ThemeToggle";
import { LanguagePicker } from "@/components/marketing/LanguagePicker";
import { NetWorthChart } from "@/components/marketing/NetWorthChart";
import { LedgerRow, type LedgerEntry } from "@/components/marketing/LedgerRow";
import { WhatIf } from "@/components/marketing/WhatIf";
import { MemoryBanner } from "@/components/marketing/MemoryBanner";

// Webfonts the Twilight design uses, loaded via next/font and exposed only as
// CSS variables on the marketing wrapper — the app's own typography is untouched.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--mkt-sans", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], variable: "--mkt-serif", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--mkt-mono", display: "swap" });

// Existing destinations — the app lives on app.volnar.nl; volnar.nl is marketing.
const LOGIN_URL = "https://app.volnar.nl/login";
const DEMO_URL = "https://app.volnar.nl/demo";
const APP_STORE_URL = "https://apps.apple.com/nl/app/volnar/id6779533642?l=en-GB";

function Ic({ id }: { id: string }) {
  return (
    <svg className="ic">
      <use href={`#${id}`} />
    </svg>
  );
}

// The decision-journal ledger — static showcase entries copied from the mockup.
const LEDGER: LedgerEntry[] = [
  { date: "Oct 2022", title: "Bought the bottom", tag: "user", why: "Buying when it hurt — the 2022 low.", impact: "+€120.000", dir: "up" },
  { date: "Jan 2025", title: "Crossed €1.000.000", tag: "auto", why: "A milestone on the NVIDIA run.", impact: "+€245.000", dir: "up" },
  { date: "Oct 2024", title: "Rebalanced after NVIDIA run", tag: "user", why: "Above my 35% comfort line.", impact: "€96.000 locked", dir: "up" },
  { date: "Apr 2024", title: "NVIDIA −12% in a day", tag: "auto", why: "Largest position. You held.", impact: "−€34.000", dir: "dn" },
  { date: "Mar 2022", title: "Raised cash before the drop", tag: "user", why: "De-risking before the cycle turned.", impact: "avoided €40.000", dir: "up" },
  { date: "Jun 2023", title: "Locked the mortgage", tag: "user", why: "Certainty over a few basis points.", impact: "€8.400 saved", dir: "up" },
  { date: "May 2025", title: "Trimmed Bitcoin at the record", tag: "user", why: "Original stake off the table.", impact: "+€34.000", dir: "up" },
  { date: "2026", title: "Crypto sold off hard", tag: "auto", why: "Core thesis intact. You held.", impact: "−€33.000", dir: "dn" },
];

// Asset chips for the marquee (rendered twice for a seamless loop).
const TICKER: { code: string; name: string; color: string }[] = [
  { code: "NV", name: "NVIDIA", color: "#117A52" },
  { code: "AS", name: "ASML", color: "#0B5AA6" },
  { code: "Au", name: "Gold", color: "#C9A227" },
  { code: "₿", name: "Bitcoin", color: "#E0922A" },
  { code: "€", name: "Cash", color: "#C9C3B4" },
  { code: "RE", name: "Property", color: "#3F7CA8" },
];

export default function MarketingPage() {
  return (
    <div
      id="tw-root"
      data-theme="light"
      className={`tw ${inter.variable} ${fraunces.variable} ${plexMono.variable}`}
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

      {/* ── Nav ── */}
      <nav className="nav">
        <div className="inner">
          <span className="brand">
            <VolnarLogo size={22} />
            <span className="wm disp">Volnar</span>
          </span>
          <span className="nlinks">
            <a href="#how">How it works</a>
            <a href="#why">Why Volnar</a>
            <a href="#pricing">Pricing</a>
            <ThemeToggle />
            <LanguagePicker />
            <a className="nav-signin" href={LOGIN_URL}>Sign in</a>
            <a className="btn demo" href={DEMO_URL}>Get started</a>
          </span>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="hero">
        <div className="wrap">
          <div className="hcopy">
            <span className="pill fu" style={{ animationDelay: ".05s" }}>
              <span className="d" />
              Private · EU-hosted · no bank sync
            </span>
            <h1 className="disp fu" style={{ animationDelay: ".12s" }}>
              Track what you own.
              <br />
              Remember{" "}
              <span className="acc">
                why you own it
                <svg viewBox="0 0 200 12" preserveAspectRatio="none">
                  <path d="M4 8C55 2 150 2 196 6" />
                </svg>
              </span>
              .
            </h1>
            <p className="lead fu" style={{ animationDelay: ".22s" }}>
              You record the <b>why</b> in one sentence. When the market moves your money, Volnar
              records that itself.
            </p>
            <div className="cta fu" style={{ animationDelay: ".3s" }}>
              <a className="btn lg" href={DEMO_URL}>
                See the live demo <Ic id="i-arrow" />
              </a>
              <a className="btn lg ghost" href="#how">
                How it works
              </a>
            </div>
            <div className="stores fu hero-stores" style={{ animationDelay: ".37s" }}>
              <a className="store" href={APP_STORE_URL} target="_blank" rel="noopener">
                <svg className="store-ic" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.978 4.46z" />
                </svg>
                <span className="store-t">
                  <small>Download on the</small>
                  <b>App Store</b>
                </span>
              </a>
              <span className="store soon">
                <svg className="store-ic" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.6 2.1c-.3.16-.5.46-.5.86v18.08c0 .4.2.7.5.86l10.2-9.9zm12.2 7.78l2.86-2.78-9.9-5.6c-.3-.17-.62-.16-.86-.02zm0 4.24l-7.9 8.4c.24.14.56.15.86-.02l9.9-5.6zm5.06-2.66l-2.5-1.42-3.06 2.97 3.06 2.97 2.5-1.42c.6-.34.6-1.34 0-1.68z" />
                </svg>
                <span className="store-t">
                  <small>Coming soon to</small>
                  <b>Google Play</b>
                </span>
              </span>
            </div>
          </div>

          <div className="mech">
            <div className="mech-head fu" style={{ animationDelay: ".42s" }}>
              <span className="mech-eyebrow">Two ways an entry gets written</span>
              <span className="mech-sub">You speak — or the market does.</span>
            </div>
            <NetWorthChart />
            <p className="mech-cap fu" style={{ animationDelay: ".72s" }}>
              Real prices. Every marker is an entry.{" "}
              <b>Nothing else writes the market&apos;s entries for you.</b>
            </p>
          </div>
        </div>
      </header>

      {/* ── Why a journal ── */}
      <section className="band-soft">
        <div className="wrap sec" style={{ padding: "56px 0" }}>
          <span className="eyebrow reveal">Why a journal</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            A year on, you won&apos;t remember <span className="g">why.</span>
          </h2>
          <div className="mem">
            <div className="mem-card you reveal" style={{ transitionDelay: ".05s" }}>
              <div className="mem-h">
                <Ic id="i-clock" />
                Memory, one year later
              </div>
              <div className="mem-note">
                Sold NVIDIA because{" "}
                <span className="forgetting">it was 41% of everything and earnings had just popped.</span>
              </div>
              <div className="mem-q">…why did I sell again?</div>
            </div>
            <div className="mem-card vol reveal" style={{ transitionDelay: ".13s" }}>
              <div className="mem-h">
                <Ic id="i-shield" />
                In Volnar
              </div>
              <div className="mem-note">
                Sold NVIDIA because it was 41% of everything and earnings had just popped.
              </div>
              <div className="mem-date">
                <Ic id="i-check" />
                12 Oct 2024 · still here
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The decision journal (ledger) ── */}
      <section id="how" className="sec">
        <div className="wrap">
          <span className="eyebrow reveal">The decision journal</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            Every moment on the chart, <span className="g">written down.</span>
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".1s" }}>
            Every marker on the chart is an entry — your reason and the number, side by side. The{" "}
            <span style={{ color: "var(--auto)", fontWeight: 600 }}>automatic</span> ones wrote
            themselves.
          </p>
          <div className="ledger reveal" style={{ transitionDelay: ".1s" }}>
            {LEDGER.map((entry, i) => (
              <LedgerRow key={i} entry={entry} />
            ))}
          </div>
          <div className="led-cap reveal">
            Twelve entries and counting — every marker on the chart has one.
          </div>
        </div>
      </section>

      {/* ── Notifications ── */}
      <section className="sec">
        <div className="wrap">
          <span className="eyebrow reveal">Notifications</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            It tells you when something <span className="g">moves.</span>
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".1s" }}>
            A quiet nudge when the market touches what you hold — or you hit a milestone. The ones
            that matter write themselves into the journal.
          </p>
          <div
            className="noti-stack reveal"
            style={{ maxWidth: 560, marginTop: 24, transitionDelay: ".14s" }}
          >
            <MemoryBanner />
            <div className="nb">
              <div className="nb-ic">
                <Ic id="i-news" />
              </div>
              <div className="nb-b">
                <div className="nb-top">
                  <span className="nb-app">ECB · attention</span>
                  <span className="nb-time">now</span>
                </div>
                <div className="nb-t">Rate +25 bps — affects your mortgage</div>
                <div className="nb-s">Yours is fixed. Logged for you.</div>
              </div>
            </div>
            <div className="nb">
              <div className="nb-ic">
                <Ic id="i-up" />
              </div>
              <div className="nb-b">
                <div className="nb-top">
                  <span className="nb-app">NVIDIA · earnings beat</span>
                  <span className="nb-time">8m</span>
                </div>
                <div className="nb-t">+€8.300 on your NVIDIA position</div>
                <div className="nb-s">Topped estimates after the close.</div>
              </div>
            </div>
            <div className="nb">
              <div className="nb-ic">
                <Ic id="i-spark" />
              </div>
              <div className="nb-b">
                <div className="nb-top">
                  <span className="nb-app">Bitcoin · momentum</span>
                  <span className="nb-time">1h</span>
                </div>
                <div className="nb-t">Above its record — +€4.100</div>
                <div className="nb-s">Want to log a decision while it&apos;s fresh?</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Private by design ── */}
      <section id="why" className="dark">
        <div className="wrap sec">
          <span className="eyebrow reveal">Private by design</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            No bank sync. No advice. <span className="g">On purpose.</span>
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".1s" }}>
            You tell it what happened. It never sells you advice. It answers to you alone.
          </p>
          <div className="chips">
            <span className="dchip reveal" style={{ transitionDelay: ".05s" }}>
              <Ic id="i-ban" />
              No broker connections
            </span>
            <span className="dchip reveal" style={{ transitionDelay: ".11s" }}>
              <Ic id="i-msgoff" />
              No recommendations
            </span>
            <span className="dchip reveal" style={{ transitionDelay: ".17s" }}>
              <Ic id="i-shield" />
              EU-hosted &amp; read-only
            </span>
          </div>
        </div>
      </section>

      {/* ── What-if ── */}
      <section id="whatif" className="sec">
        <div className="wrap split">
          <div>
            <span className="eyebrow reveal">What-if · in chat</span>
            <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
              See it <span className="g">before</span> you commit.
            </h2>
            <p className="body reveal" style={{ transitionDelay: ".1s" }}>
              Ask in plain language. Volnar runs the numbers — deterministically — and shows the
              impact. Nothing changes until you decide.
            </p>
          </div>
          <WhatIf />
        </div>
      </section>

      {/* ── Dashboard · Vitals ── */}
      <section className="sec">
        <div className="wrap">
          <span className="eyebrow reveal">Dashboard · Vitals</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            Not just what you own — <span className="g">how well it&apos;s built.</span>
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".1s" }}>
            A live dashboard of every asset, and seven Vitals that grade the quality of your wealth —
            concentration, liquidity, leverage, drawdown risk, real yield, growth. Each reads green,
            amber or red, the moment something slips.
          </p>
          <div className="dv-grid">
            <div className="dash reveal" style={{ transitionDelay: ".08s" }}>
              <div className="dash-h">
                <span className="dash-l">Portfolio · today</span>
                <span className="dash-badge">▲ +71% since 2021</span>
              </div>
              <div className="dash-nw">€1.290.083</div>
              <div className="dash-rows">
                <div className="dr">
                  <span className="dr-n">Public markets</span>
                  <span className="dr-bar"><span style={{ width: "47%", background: "#117A52" }} /></span>
                  <span className="dr-v">€611.505</span>
                </div>
                <div className="dr">
                  <span className="dr-n">Property</span>
                  <span className="dr-bar"><span style={{ width: "33%", background: "#3F7CA8" }} /></span>
                  <span className="dr-v">€431.323</span>
                </div>
                <div className="dr">
                  <span className="dr-n">Reserves</span>
                  <span className="dr-bar"><span style={{ width: "14%", background: "#A89968" }} /></span>
                  <span className="dr-v">€181.110</span>
                </div>
                <div className="dr">
                  <span className="dr-n">Crypto</span>
                  <span className="dr-bar"><span style={{ width: "5%", background: "#E0922A" }} /></span>
                  <span className="dr-v">€66.145</span>
                </div>
              </div>
              <div className="dash-foot">
                <span className="dash-dots">
                  <i className="ok" />
                  <i className="ok" />
                  <i className="ok" />
                  <i className="ok" />
                  <i className="warn" />
                  <i className="warn" />
                </span>
                Vitals · 4 healthy · 2 to watch
              </div>
            </div>

            <div className="vitals reveal" style={{ transitionDelay: ".12s" }}>
              <div className="vital warn">
                <div className="vital-top">
                  <span className="vital-name">Concentration</span>
                  <span className="vital-band">Watch</span>
                </div>
                <div className="vital-val">38%<span> · NVIDIA</span></div>
                <svg className="vc" viewBox="0 0 100 24">
                  <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
                  <rect className="vc-warn" x="0" y="9" width="38" height="7" rx="2.5" />
                  <line className="vc-thr" x1="35" y1="4.5" x2="35" y2="20.5" />
                  <text className="vc-lbl" x="35" y="3" textAnchor="middle">35%</text>
                </svg>
                <div className="vital-read">Above the 35% line — one position drives a lot of the book.</div>
              </div>

              <div className="vital ok">
                <div className="vital-top">
                  <span className="vital-name">Liquidity</span>
                  <span className="vital-band">Healthy</span>
                </div>
                <div className="vital-val">54%<span> in a week</span></div>
                <svg className="vc" viewBox="0 0 100 24">
                  <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
                  <rect className="vc-ok" x="0" y="9" width="54" height="7" rx="2.5" />
                  <rect className="vc-okm" x="54.5" y="9" width="7" height="7" />
                  <line className="vc-thr" x1="15" y1="4.5" x2="15" y2="20.5" />
                  <text className="vc-lbl" x="15" y="3" textAnchor="middle">15%</text>
                </svg>
                <div className="vital-read">Over half your wealth is reachable within seven days.</div>
              </div>

              <div className="vital ok">
                <div className="vital-top">
                  <span className="vital-name">Leverage</span>
                  <span className="vital-band">Healthy</span>
                </div>
                <div className="vital-val">28%<span> LTV</span></div>
                <svg className="vc" viewBox="0 0 100 24">
                  <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
                  <rect className="vc-ok" x="0" y="9" width="28" height="7" rx="2.5" />
                  <line className="vc-thr" x1="50" y1="4.5" x2="50" y2="20.5" />
                  <line className="vc-thr" x1="75" y1="4.5" x2="75" y2="20.5" />
                  <text className="vc-lbl" x="50" y="3" textAnchor="middle">50</text>
                  <text className="vc-lbl" x="75" y="3" textAnchor="middle">75</text>
                </svg>
                <div className="vital-read">The mortgage is modest, and the rate is fixed.</div>
              </div>

              <div className="vital ok">
                <div className="vital-top">
                  <span className="vital-name">Drawdown</span>
                  <span className="vital-band">Healthy</span>
                </div>
                <div className="vital-val">−23%<span> 2008-style</span></div>
                <svg className="vc" viewBox="0 0 100 24">
                  <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
                  <rect className="vc-ok" x="0" y="9" width="77" height="7" rx="2.5" />
                  <rect className="vc-bad" x="77" y="9" width="23" height="7" rx="2.5" />
                  <line className="vc-thr" x1="75" y1="4.5" x2="75" y2="20.5" />
                  <text className="vc-lbl" x="75" y="3" textAnchor="middle">−25%</text>
                </svg>
                <div className="vital-read">A simultaneous crash would cut about a quarter — survivable.</div>
              </div>

              <div className="vital warn">
                <div className="vital-top">
                  <span className="vital-name">Cash yield</span>
                  <span className="vital-band">Watch</span>
                </div>
                <div className="vital-val">−1,3%<span> real</span></div>
                <svg className="vc" viewBox="0 0 100 24">
                  <line className="vc-base" x1="0" y1="11" x2="100" y2="11" />
                  <rect className="vc-ok" x="8" y="3.2" width="15" height="7.8" />
                  <rect className="vc-bad" x="30" y="3.2" width="15" height="8.5" />
                  <rect className="vc-bad" x="52" y="11.7" width="15" height="2.3" />
                  <rect className="vc-warn" x="74" y="11" width="17" height="3" />
                </svg>
                <div className="vital-read">Cash is quietly losing to inflation and tax.</div>
              </div>

              <div className="vital ok">
                <div className="vital-top">
                  <span className="vital-name">Real growth</span>
                  <span className="vital-band">Healthy</span>
                </div>
                <div className="vital-val">+8,3%<span> past year</span></div>
                <svg className="vc" viewBox="0 0 100 24">
                  <polyline className="vc-mut-s" points="0,18 9,17 18,17.4 27,16 36,15 45,14.4 55,12 64,11 73,9.4 82,8 91,6.4 100,5" />
                  <polyline className="vc-ok-s" points="0,18 9,17.3 18,18 27,16.8 36,16 45,15.6 55,13.4 64,12.6 73,11 82,9.8 91,8.6 100,8" />
                </svg>
                <div className="vital-read">Net worth is growing ahead of inflation.</div>
              </div>
            </div>
          </div>

          <div className="marq reveal" style={{ transitionDelay: ".05s" }}>
            <div className="track">
              {[...TICKER, ...TICKER].map((t, i) => (
                <span className="atk" key={i}>
                  <span className="c" style={{ background: t.color }}>{t.code}</span>
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Volnar, not the rest ── */}
      <section className="sec">
        <div className="wrap">
          <span className="eyebrow reveal">Why Volnar, not the rest</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            A different <span className="g">axis</span> entirely.
          </h2>
          <div className="vs">
            <div className="vsrow reveal" style={{ transitionDelay: ".05s" }}>
              <div className="vsl">Aggregators sync your bank</div>
              <div className="arrw"><Ic id="i-arrow" /></div>
              <div className="vsr">
                Volnar <span className="g">won&apos;t</span> — so every change keeps your reason
              </div>
            </div>
            <div className="vsrow reveal" style={{ transitionDelay: ".1s" }}>
              <div className="vsl">AI advisors tell you what to do</div>
              <div className="arrw"><Ic id="i-arrow" /></div>
              <div className="vsr">
                Volnar <span className="g">never advises</span> — it records what you chose
              </div>
            </div>
            <div className="vsrow reveal" style={{ transitionDelay: ".15s" }}>
              <div className="vsl">Alerts buzz once and vanish</div>
              <div className="arrw"><Ic id="i-arrow" /></div>
              <div className="vsr">
                Volnar <span className="g">keeps the market&apos;s entries</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="sec">
        <div className="wrap" style={{ textAlign: "center" }}>
          <span className="eyebrow reveal">Pricing</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            One product. One price.
          </h2>
          <div className="prices">
            <div className="price reveal" style={{ transitionDelay: ".05s" }}>
              <div className="pname">Monthly</div>
              <div className="pamt disp">€9,99<span> / mo</span></div>
              <ul className="flist">
                <li><Ic id="i-check" />Full decision journal</li>
                <li><Ic id="i-check" />Automatic market journaling</li>
                <li><Ic id="i-check" />What-if simulations</li>
              </ul>
              <a className="btn" href={DEMO_URL} style={{ width: "100%", justifyContent: "center" }}>
                Start the demo
              </a>
            </div>
            <div className="price feat reveal" style={{ transitionDelay: ".1s" }}>
              <span className="badge">Save 17%</span>
              <div className="pname">Annual</div>
              <div className="pamt disp">€99,99<span> / yr</span></div>
              <ul className="flist">
                <li><Ic id="i-check" />Everything in Monthly</li>
                <li><Ic id="i-check" />Journal kept for good</li>
                <li><Ic id="i-check" />iPhone &amp; web</li>
              </ul>
              <a className="btn" href={DEMO_URL} style={{ width: "100%", justifyContent: "center" }}>
                Start the demo
              </a>
            </div>
          </div>
          <div className="pmicro">Indicative pricing · 14-day demo, no card required.</div>
        </div>
      </section>

      {/* ── Closing ── */}
      <section className="dark">
        <div className="wrap close">
          <h2 className="disp reveal">
            The <span className="g">what</span> is easy.
            <br />
            The <span className="g">why</span> is the part worth keeping.
          </h2>
          <div className="cta reveal" style={{ transitionDelay: ".08s" }}>
            <a className="btn lg" href={DEMO_URL}>
              Start your journal <Ic id="i-arrow" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="foot">
        <div className="wrap">
          <div className="top">
            <div>
              <span className="brand">
                <VolnarLogo size={23} />
                <span className="wm disp" style={{ fontSize: 18 }}>Volnar</span>
              </span>
              <div className="tl">A private decision journal for your wealth.</div>
            </div>
            <div className="col">
              <h5>Product</h5>
              <a href={DEMO_URL}>Live demo</a>
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className="col">
              <h5>Company</h5>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/support">Support</Link>
            </div>
          </div>
          <div className="bot">
            <span>© 2026 Volnar · NovaHub B.V.</span>
            <span>
              EU-hosted · sample portfolio · prices are real historical market data · *projections
              illustrative
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
