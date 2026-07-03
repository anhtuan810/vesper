"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { VolnarLogo } from "@/components/VolnarLogo";
import { ThemeToggle } from "./ThemeToggle";
import { LanguagePicker } from "./LanguagePicker";
import { NetWorthChart } from "./NetWorthChart";
import { LedgerRow } from "./LedgerRow";
import { WhatIf } from "./WhatIf";
import { MemoryBanner } from "./MemoryBanner";
import { Heading, Line, useI18n } from "./i18n";

// Existing destinations — the app lives on app.volnar.nl; volnar.nl is marketing.
const LOGIN_URL = "https://app.volnar.nl/login";
const DEMO_URL = "https://app.volnar.nl/demo";
const APP_STORE_URL = "https://apps.apple.com/nl/app/volnar/id6779533642?l=en-GB";

// Every place on the page a demo click can come from — the analytics
// dimension. A union so a typo'd placement fails the build, not the funnel.
type DemoPlacement =
  | "nav"
  | "hero"
  | "chart_ask"
  | "ledger_cap"
  | "whatif_input"
  | "midband"
  | "pricing_monthly"
  | "pricing_annual"
  | "close"
  | "sticky"
  | "footer";

// The spread a demo CTA carries (href + tracked veil-raising onClick) —
// produced by MarketingBody's demoCta factory, consumed by NetWorthChart and
// WhatIf for their in-mock launchers.
export type DemoCta = { href: string; onClick: (e: React.MouseEvent) => void };

function Ic({ id }: { id: string }) {
  return (
    <svg className="ic">
      <use href={`#${id}`} />
    </svg>
  );
}

// Static (locale-independent) pieces of the Vitals section.
const PRIVACY_ICONS = ["i-ban", "i-msgoff", "i-shield"];
const DASH_BARS = [
  { w: "47%", c: "var(--cat-markets)" },
  { w: "33%", c: "var(--cat-property)" },
  { w: "14%", c: "var(--cat-reserves)" },
  { w: "5%", c: "var(--cat-crypto)" },
];
const VITAL_VALUES = ["38%", "54%", "28%", "−23%", "−1,3%", "+8,3%"];
// A–D letter per mock card, matching what src/lib/vitals/grade.ts would return
// for these exact values (concentration 38% → C, liquidity 54% vs 15% buffer →
// A, leverage 28% LTV → A, drawdown −23% → B, cash yield negative → C, real
// growth +8,3% → A) — the mock must never show a grade the app wouldn't.
const VITAL_GRADES = ["C", "A", "A", "B", "C", "A"];
const VITAL_SVGS: ReactNode[] = [
  <svg className="vc" viewBox="0 0 100 24" key="0">
    <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
    <rect className="vc-warn" x="0" y="9" width="38" height="7" rx="2.5" />
    <line className="vc-thr" x1="35" y1="4.5" x2="35" y2="20.5" />
    <text className="vc-lbl" x="35" y="3" textAnchor="middle">35%</text>
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="1">
    <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
    <rect className="vc-ok" x="0" y="9" width="54" height="7" rx="2.5" />
    <rect className="vc-okm" x="54.5" y="9" width="7" height="7" />
    <line className="vc-thr" x1="15" y1="4.5" x2="15" y2="20.5" />
    <text className="vc-lbl" x="15" y="3" textAnchor="middle">15%</text>
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="2">
    <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
    <rect className="vc-ok" x="0" y="9" width="28" height="7" rx="2.5" />
    <line className="vc-thr" x1="50" y1="4.5" x2="50" y2="20.5" />
    <line className="vc-thr" x1="75" y1="4.5" x2="75" y2="20.5" />
    <text className="vc-lbl" x="50" y="3" textAnchor="middle">50</text>
    <text className="vc-lbl" x="75" y="3" textAnchor="middle">75</text>
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="3">
    <rect className="vc-sec" x="0" y="9" width="100" height="7" rx="2.5" />
    <rect className="vc-ok" x="0" y="9" width="77" height="7" rx="2.5" />
    <rect className="vc-bad" x="77" y="9" width="23" height="7" rx="2.5" />
    <line className="vc-thr" x1="75" y1="4.5" x2="75" y2="20.5" />
    <text className="vc-lbl" x="75" y="3" textAnchor="middle">−25%</text>
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="4">
    <line className="vc-base" x1="0" y1="11" x2="100" y2="11" />
    <rect className="vc-ok" x="8" y="3.2" width="15" height="7.8" />
    <rect className="vc-bad" x="30" y="3.2" width="15" height="8.5" />
    <rect className="vc-bad" x="52" y="11.7" width="15" height="2.3" />
    <rect className="vc-warn" x="74" y="11" width="17" height="3" />
  </svg>,
  <svg className="vc" viewBox="0 0 100 24" key="5">
    <polyline className="vc-mut-s" points="0,18 9,17 18,17.4 27,16 36,15 45,14.4 55,12 64,11 73,9.4 82,8 91,6.4 100,5" />
    <polyline className="vc-ok-s" points="0,18 9,17.3 18,18 27,16.8 36,16 45,15.6 55,13.4 64,12.6 73,11 82,9.8 91,8.6 100,8" />
  </svg>,
];

export function MarketingBody() {
  const { m } = useI18n();

  // Entering the demo is a full navigation to app.volnar.nl/demo, where the
  // server signs in and reseeds a whole demo account before anything renders —
  // several seconds during which a plain link would leave this page frozen.
  // Paint a "preparing" veil the instant any demo CTA is clicked; it stays up
  // until the browser swaps documents.
  const [launchingDemo, setLaunchingDemo] = useState(false);
  useEffect(() => {
    // Coming BACK from the demo restores this page from the back/forward cache
    // exactly as it was left — veil up — so drop it on bfcache restores.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setLaunchingDemo(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  // Factory spread onto every demo CTA, tagged with where on the page the click
  // came from — the page's one KPI. track() fires for every demo click
  // (modified ones included: a cmd+click is still demo intent); the veil only
  // rises for plain clicks, where this document is about to be swapped out.
  // No preventDefault — the navigation proceeds; the veil only covers the wait.
  // Known undercount: a click in the first seconds, before the insights script
  // has loaded, queues the event in-memory and the queue dies with the page.
  const demoCta = (placement: DemoPlacement): DemoCta => ({
    href: DEMO_URL,
    onClick: (e: React.MouseEvent) => {
      if (launchingDemo) {
        // A second activation while the veil is already up (double-tap, Enter
        // twice): no second event, no second navigation, no rhythm reset.
        e.preventDefault();
        return;
      }
      track("demo_cta_click", { placement });
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      setVeilStep(0);
      setLaunchingDemo(true);
    },
  });

  // While the veil is up, walk it through the substance lines (what the server
  // is genuinely doing) — played once, holding on the last. veilStep resets in
  // the click handler, so a second entry after a bfcache restore replays cleanly.
  // Reduced-motion users keep the static first line — the rest of the page
  // disables all motion under that preference, and this walk is motion too.
  const veilMsgs = [m.demoPreparing, ...m.demoVeilMore];
  const veilCount = veilMsgs.length;
  const [veilStep, setVeilStep] = useState(0);
  useEffect(() => {
    if (!launchingDemo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = Array.from({ length: veilCount - 1 }, (_, i) =>
      setTimeout(() => setVeilStep(i + 1), 1700 * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, [launchingDemo, veilCount]);

  // Mobile sticky demo bar: visible only between the hero scrolling out and the
  // closing section scrolling in (each has its own observer), so it never
  // doubles the hero CTA or covers the closing one.
  const heroRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [heroPast, setHeroPast] = useState(false);
  const [closeNear, setCloseNear] = useState(false);
  useEffect(() => {
    const hero = heroRef.current;
    const close = closeRef.current;
    if (!hero || !close) return;
    // Coalesced deliveries put the CURRENT state in the last entry — the first
    // can be stale after a fast flick-scroll crosses a boundary twice.
    const heroObs = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      setHeroPast(!e.isIntersecting && e.boundingClientRect.top < 0);
    });
    // "Near" covers both the close section on screen AND everything past it
    // (the footer) — the bar must not float over either.
    const closeObs = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      setCloseNear(e.isIntersecting || e.boundingClientRect.top < 0);
    });
    heroObs.observe(hero);
    closeObs.observe(close);
    return () => {
      heroObs.disconnect();
      closeObs.disconnect();
    };
  }, []);
  const showSticky = heroPast && !closeNear && !launchingDemo;
  // If the bar hides while its link holds keyboard focus, focus would sit on
  // an aria-hidden, off-screen control — release it.
  useEffect(() => {
    if (showSticky) return;
    const bar = stickyRef.current;
    if (bar && bar.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [showSticky]);

  return (
    <>
      {launchingDemo && (
        <div className="demo-veil" role="status" aria-live="polite">
          <VolnarLogo size={48} />
          <div className="demo-veil-msg">{veilMsgs[veilStep]}</div>
          <div className="demo-veil-dots" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>
      )}

      {/* ── Mobile sticky demo bar ── */}
      <div ref={stickyRef} className={`mcta${showSticky ? " show" : ""}`} aria-hidden={!showSticky}>
        <a className="btn" {...demoCta("sticky")} tabIndex={showSticky ? 0 : -1}>
          {m.hero.seeDemo} <Ic id="i-arrow" />
        </a>
        <span className="mcta-micro">{m.demoMicroShort}</span>
      </div>

      {/* ── Nav ── */}
      <nav className="nav">
        <div className="inner">
          <span className="brand">
            <VolnarLogo size={22} />
            <span className="wm disp">Volnar</span>
          </span>
          <span className="nlinks">
            <a href="#how">{m.nav.how}</a>
            <a href="#why">{m.nav.why}</a>
            <a href="#pricing">{m.nav.pricing}</a>
            <ThemeToggle />
            <LanguagePicker />
            <a className="nav-signin" href={LOGIN_URL}>{m.nav.signIn}</a>
            <a className="btn demo" {...demoCta("nav")}>{m.nav.getStarted}</a>
          </span>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="hero" ref={heroRef}>
        <div className="wrap">
          <div className="hcopy">
            <span className="pill fu" style={{ animationDelay: ".05s" }}>
              <span className="d" />
              {m.hero.pill}
            </span>
            <h1 className="disp fu" style={{ animationDelay: ".12s" }}>
              <Heading lines={m.hero.h1} />
            </h1>
            <p className="lead fu" style={{ animationDelay: ".22s" }}>
              <Line line={m.hero.lead} />
            </p>
            <div className="cta fu" style={{ animationDelay: ".3s" }}>
              <a className="btn lg" {...demoCta("hero")}>
                {m.hero.seeDemo} <Ic id="i-arrow" />
              </a>
              <a className="btn lg ghost" href="#how">
                {m.hero.howItWorks}
              </a>
            </div>
            <p className="cta-micro fu" style={{ animationDelay: ".34s" }}>{m.demoMicro}</p>
            <div className="stores fu hero-stores" style={{ animationDelay: ".37s" }}>
              <a className="store" href={APP_STORE_URL} target="_blank" rel="noopener">
                <svg className="store-ic" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.978 4.46z" />
                </svg>
                <span className="store-t">
                  <small>{m.hero.store.download}</small>
                  <b>{m.hero.store.appStore}</b>
                </span>
              </a>
            </div>
          </div>

          <div className="mech">
            <div className="mech-head fu" style={{ animationDelay: ".42s" }}>
              <span className="mech-eyebrow">{m.mech.eyebrow}</span>
              <span className="mech-sub">{m.mech.sub}</span>
            </div>
            <NetWorthChart demoCta={demoCta("chart_ask")} />
            <p className="mech-cap fu" style={{ animationDelay: ".72s" }}>
              <Line line={m.mech.cap} />
            </p>
          </div>
        </div>
      </header>

      {/* ── Why a journal ── */}
      <section className="band-soft">
        {/* "wrap" only, vertical padding inline. The old "wrap sec" combo let
            .sec's `padding:72px 0` shorthand (declared after .wrap) zero out
            .wrap's 28px horizontal padding — this one section then sat flush
            against the screen edge on phones. */}
        <div className="wrap" style={{ paddingTop: "clamp(40px, 8vw, 56px)", paddingBottom: "clamp(40px, 8vw, 56px)" }}>
          <span className="eyebrow reveal">{m.band.eyebrow}</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            <Heading lines={m.band.h2} />
          </h2>
          <div className="mem">
            <div className="mem-card you reveal" style={{ transitionDelay: ".05s" }}>
              <div className="mem-h">
                <Ic id="i-clock" />
                {m.band.youHead}
              </div>
              <div className="mem-note">
                {m.band.youPre}
                <span className="forgetting">{m.band.youForget}</span>
              </div>
              <div className="mem-q">{m.band.youQ}</div>
            </div>
            <div className="mem-card vol reveal" style={{ transitionDelay: ".13s" }}>
              <div className="mem-h">
                <Ic id="i-shield" />
                {m.band.volHead}
              </div>
              <div className="mem-note">{m.band.volNote}</div>
              <div className="mem-date">
                <Ic id="i-check" />
                {m.band.volDate}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The decision journal (ledger) ── */}
      <section id="how" className="sec">
        <div className="wrap">
          <span className="eyebrow reveal">{m.how.eyebrow}</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            <Heading lines={m.how.h2} />
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".1s" }}>
            <Line line={m.how.body} />
          </p>
          <div className="ledger reveal" style={{ transitionDelay: ".1s" }}>
            {m.how.entries.map((entry, i) => (
              <LedgerRow key={i} entry={entry} tagLabel={entry.tag === "user" ? m.how.tagYou : m.how.tagAuto} defaultOpen={i === 0} />
            ))}
          </div>
          <div className="led-cap reveal">
            {m.how.cap} <a className="led-cap-cta" {...demoCta("ledger_cap")}>{m.how.capCta}</a>
          </div>
        </div>
      </section>

      {/* ── Notifications ── */}
      <section className="sec">
        <div className="wrap">
          <span className="eyebrow reveal">{m.notif.eyebrow}</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            <Heading lines={m.notif.h2} />
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".1s" }}>
            {m.notif.body}
          </p>
          <div className="noti-stack reveal" style={{ maxWidth: 560, marginTop: 24, transitionDelay: ".14s" }}>
            <MemoryBanner />
            {m.notif.banners.map((b, i) => (
              <div className="nb" key={i}>
                <div className="nb-ic">
                  <Ic id={i === 0 ? "i-news" : i === 1 ? "i-up" : "i-spark"} />
                </div>
                <div className="nb-b">
                  <div className="nb-top">
                    <span className="nb-app">{b.app}</span>
                    <span className="nb-time">{b.time}</span>
                  </div>
                  <div className="nb-t">{b.t}</div>
                  <div className="nb-s">{b.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Private by design ── */}
      <section id="why" className="dark">
        <div className="wrap sec">
          <span className="eyebrow reveal">{m.privacy.eyebrow}</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            <Heading lines={m.privacy.h2} />
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".1s" }}>
            {m.privacy.body}
          </p>
          <div className="chips">
            {m.privacy.chips.map((chip, i) => (
              <span className="dchip reveal" style={{ transitionDelay: `${0.05 + i * 0.06}s` }} key={i}>
                <Ic id={PRIVACY_ICONS[i]} />
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── What-if ── */}
      <section id="whatif" className="sec">
        <div className="wrap split">
          <div>
            <span className="eyebrow reveal">{m.whatif.eyebrow}</span>
            <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
              <Heading lines={m.whatif.h2} />
            </h2>
            <p className="body reveal" style={{ transitionDelay: ".1s" }}>
              {m.whatif.body}
            </p>
          </div>
          <WhatIf demoCta={demoCta("whatif_input")} />
        </div>
      </section>

      {/* ── Dashboard · Vitals ── */}
      <section className="sec">
        <div className="wrap">
          <span className="eyebrow reveal">{m.vitals.eyebrow}</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            <Heading lines={m.vitals.h2} />
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".1s" }}>
            {m.vitals.body}
          </p>
          <div className="dv-grid">
            <div className="dash reveal" style={{ transitionDelay: ".08s" }}>
              <div className="dash-h">
                <span className="dash-l">{m.vitals.dashLabel}</span>
                <span className="dash-badge">{m.vitals.dashBadge}</span>
              </div>
              <div className="dash-nw">€1.290.083</div>
              <div className="dash-rows">
                {m.vitals.dashRows.map((row, i) => (
                  <div className="dr" key={i}>
                    <span className="dr-n">{row.name}</span>
                    <span className="dr-bar">
                      <span style={{ width: DASH_BARS[i].w, background: DASH_BARS[i].c }} />
                    </span>
                    <span className="dr-v">{row.value}</span>
                  </div>
                ))}
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
                {m.vitals.dashFoot}
              </div>
            </div>

            <div className="vitals reveal" style={{ transitionDelay: ".12s" }}>
              {m.vitals.cards.map((card, i) => (
                <div className={`vital ${card.band}`} key={i}>
                  <div className="vital-top">
                    <span className="vgrade">{VITAL_GRADES[i]}</span>
                    <span className="vital-name">{card.name}</span>
                    <span className="vital-band">{card.band === "warn" ? m.vitals.bandWatch : m.vitals.bandHealthy}</span>
                  </div>
                  <div className="vital-val">
                    {VITAL_VALUES[i]}
                    <span>{card.valSuffix}</span>
                  </div>
                  {VITAL_SVGS[i]}
                  <div className="vital-read">{card.read}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="marq reveal" style={{ transitionDelay: ".05s" }}>
            <div className="track">
              {[...m.vitals.ticker, ...m.vitals.ticker].map((t, i) => (
                <span className="atk" key={i}>
                  <span className="c" style={{ background: t.color }}>{t.code}</span>
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Demo band — the one CTA between the hero and pricing ── */}
      <section className="band-soft">
        <div className="wrap demo-band" style={{ paddingTop: "clamp(36px, 7vw, 48px)", paddingBottom: "clamp(36px, 7vw, 48px)" }}>
          <p className="body reveal">{m.midband.line}</p>
          <div className="cta reveal" style={{ transitionDelay: ".06s" }}>
            <a className="btn lg" {...demoCta("midband")}>
              {m.hero.seeDemo} <Ic id="i-arrow" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Why Volnar, not the rest ── */}
      <section className="sec">
        <div className="wrap">
          <span className="eyebrow reveal">{m.compare.eyebrow}</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            <Heading lines={m.compare.h2} />
          </h2>
          <div className="vs">
            {m.compare.rows.map((row, i) => (
              <div className="vsrow reveal" style={{ transitionDelay: `${0.05 + i * 0.05}s` }} key={i}>
                <div className="vsl">{row.l}</div>
                <div className="arrw"><Ic id="i-arrow" /></div>
                <div className="vsr">
                  <Line line={row.r} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="sec">
        <div className="wrap" style={{ textAlign: "center" }}>
          <span className="eyebrow reveal">{m.pricing.eyebrow}</span>
          <h2 className="disp reveal" style={{ transitionDelay: ".05s" }}>
            <Heading lines={m.pricing.h2} />
          </h2>
          <p className="body reveal" style={{ transitionDelay: ".08s", marginLeft: "auto", marginRight: "auto" }}>
            {m.pricing.lead}
          </p>
          <div className="prices">
            <div className="price reveal" style={{ transitionDelay: ".05s" }}>
              <div className="pname">{m.pricing.monthly.name}</div>
              <div className="pamt disp">{m.pricing.monthly.amount}<span>{m.pricing.monthly.per}</span></div>
              <ul className="flist">
                {m.pricing.monthly.features.map((f, i) => (
                  <li key={i}><Ic id="i-check" />{f}</li>
                ))}
              </ul>
              <a className="btn" {...demoCta("pricing_monthly")} style={{ width: "100%", justifyContent: "center" }}>
                {m.pricing.cta}
              </a>
            </div>
            <div className="price feat reveal" style={{ transitionDelay: ".1s" }}>
              <span className="badge">{m.pricing.annual.badge}</span>
              <div className="pname">{m.pricing.annual.name}</div>
              <div className="pamt disp">{m.pricing.annual.amount}<span>{m.pricing.annual.per}</span></div>
              <div className="pequiv">{m.pricing.annual.equiv}</div>
              <ul className="flist">
                {m.pricing.annual.features.map((f, i) => (
                  <li key={i}><Ic id="i-check" />{f}</li>
                ))}
              </ul>
              <a className="btn" {...demoCta("pricing_annual")} style={{ width: "100%", justifyContent: "center" }}>
                {m.pricing.cta}
              </a>
            </div>
          </div>
          <div className="pmicro">{m.pricing.micro}</div>
        </div>
      </section>

      {/* ── Closing ── */}
      <section className="dark" ref={closeRef}>
        <div className="wrap close">
          <h2 className="disp reveal">
            <Heading lines={m.close.h2} />
          </h2>
          <div className="cta reveal" style={{ transitionDelay: ".08s" }}>
            <a className="btn lg" {...demoCta("close")}>
              {m.close.cta} <Ic id="i-arrow" />
            </a>
          </div>
          <p className="cta-micro reveal" style={{ transitionDelay: ".12s" }}>{m.demoMicro}</p>
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
              <div className="tl">{m.footer.tagline}</div>
            </div>
            <div className="col">
              <h5>{m.footer.productHead}</h5>
              <a {...demoCta("footer")}>{m.footer.product.liveDemo}</a>
              <a href="#how">{m.footer.product.how}</a>
              <a href="#pricing">{m.footer.product.pricing}</a>
            </div>
            <div className="col">
              <h5>{m.footer.companyHead}</h5>
              <Link href="/privacy">{m.footer.company.privacy}</Link>
              <Link href="/terms">{m.footer.company.terms}</Link>
              <Link href="/support">{m.footer.company.support}</Link>
            </div>
          </div>
          <div className="bot">
            <span>{m.footer.copyright}</span>
            <span>{m.footer.disclaimer}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
