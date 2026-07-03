// English — the source of truth for the marketing page copy. Other locales
// (nl/de/fr) mirror this exact shape; `Messages` is inferred from this object.
//
// Rich text is expressed as arrays of segments:
//   "plain"            → plain text
//   { g: "…" }         → highlighted (heading accent colour)
//   { acc: "…" }       → hero underline accent
//   { b: "…" }         → bold
//   { auto: "…" }      → the "automatic" inline accent
// A heading may be several lines (rendered with <br> between them).
//
// Numbers stay nl-NL-formatted (€1.290.083, −1,3%) in every locale. Chart
// entries carry every field (empty string where a field doesn't apply) so all
// 12 share one shape.

export const en = {
  nav: {
    how: "How it works",
    why: "Why Volnar",
    pricing: "Pricing",
    signIn: "Sign in",
    getStarted: "Get started",
  },

  // Full-screen cover shown the instant a demo CTA is clicked — the server
  // prepares a fresh demo account before the app appears, which takes a moment.
  demoPreparing: "Preparing your live demo…",

  hero: {
    pill: "Private · EU-hosted · no bank sync",
    h1: [["Track what you own."], ["Remember ", { acc: "why you own it" }, "."]],
    lead: [
      "You record the ",
      { b: "why" },
      " in one sentence. When the market moves your money, Volnar records that itself.",
    ],
    seeDemo: "See the live demo",
    howItWorks: "How it works",
    store: { download: "Download on the", appStore: "App Store", soon: "Coming soon to", googlePlay: "Google Play" },
  },

  mech: {
    eyebrow: "Two ways an entry gets written",
    sub: "You speak — or the market does.",
    cap: ["Real prices. Every marker is an entry. ", { b: "Nothing else writes the market’s entries for you." }],
    netWorthAsOf: "Net worth · as of",
    badge: "▲ +71% since 2021",
    legend: { property: "Property", reserves: "Reserves", crypto: "Crypto", publicMarkets: "Public markets" },
    axisNow: "now",
    replay: "Replay",
    tag: { decision: "Decision", autoMilestone: "Automatic · Milestone", autoMarket: "Automatic · Market move" },
    askFallback: "Ask Volnar a what-if about this day",
    chat: {
      header: "From chat to journal",
      step1: "You say",
      step2: "It reads your portfolio + that day",
      step3: "Writes the entry",
    },
    market: {
      header: "From market to journal",
      auto: "automatic",
      step1: "The market moves",
      step2: "It sees the hit to your holdings",
      step3: "Logs it for you",
    },
    // Generic fill for whichever pipeline is not the active entry's source.
    genericChat: { say: "Sold 80 NVIDIA today.", read: "Largest holding, 41% · earnings, +8%", readsrc: "Earnings", wrote: "Trimmed NVIDIA · €96.000 locked" },
    genericMarket: { trig: "NVIDIA −12% in a day.", trigsrc: "Markets", detect: "Your largest position — €34.000 on paper.", logged: "Flagged · no action · you held", head: "From market to journal" },
    // The 12 chart entries. say/read/readsrc/wrote apply to "you" decisions;
    // trig/trigsrc/detect/logged/mkthead apply to "automatic" entries; the
    // unused set is "" on each entry. Geometry, up/dn and the symbol live in code.
    entries: [
      {
        date: "Jul 2021", title: "Opened the journal", imp: "€754.000 · starting point",
        ctx: "The starting line — €754.000 across a flat, a portfolio and a little crypto.",
        why: "Day one. From here on, every move gets a reason attached, so future-me sees the why, not just the what.",
        ask: "Ask: what would €754.000 be today in just an index fund?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "You opened the journal", trigsrc: "", detect: "The baseline everything is measured from", logged: "Baseline set · €754.000", mkthead: "From day one to journal",
      },
      {
        date: "Feb 2022", title: "War broke out in Ukraine", imp: "−€38.000 that week · recovered over the year",
        ctx: "Equities fell hard and energy spiked the week the invasion began.",
        why: "Property is the biggest exposure, so the hit was cushioned. Flagged automatically — no action, you sat still.",
        ask: "Ask: what if I’d sold everything that week?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "War broke out in Ukraine", trigsrc: "Markets", detect: "Equities fell sharply; energy spiked", logged: "−€38.000 that week · you held", mkthead: "",
      },
      {
        date: "Mar 2022", title: "Raised cash before the drop", imp: "avoided ≈ €40.000 of the 2022 drop",
        ctx: "The Fed signalled its first hikes; equities had grown to 64% of net worth.",
        why: "De-risking before the cycle turns. Moving to cash now so a forced sale later never has to happen.",
        ask: "Ask: what if I’d stayed fully invested instead?",
        say: "Moving to cash before the Fed starts hiking.", read: "Fed signalled rate hikes · equities 64% of net worth", readsrc: "Markets", wrote: "Raised cash · de-risked the cycle",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "Oct 2022", title: "Bought the bottom", imp: "≈ €120.000 up since",
        ctx: "Fear peaked and markets bottomed that October.",
        why: "Buying when it hurt. I can’t call the exact low, but this is close enough — the reason is conviction, not timing.",
        ask: "Ask: what if I’d waited six more months to buy?",
        say: "Buying back in — this feels like the bottom.", read: "Markets bottomed as fear peaked", readsrc: "Markets", wrote: "Bought the dip · close to the low",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "Mar 2023", title: "A US bank failed (SVB)", imp: "−€12.000 that week · fully recovered",
        ctx: "A US bank (SVB) failed; equities wobbled, then steadied within days.",
        why: "Your banks aren’t exposed and cash is spread thin. Logged, watched, left alone — recovered inside a week.",
        ask: "Ask: what if I’d pulled out when the bank failed?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "A US bank failed (SVB)", trigsrc: "Markets", detect: "Equities wobbled, then steadied in days", logged: "−€12.000 · recovered, no action", mkthead: "",
      },
      {
        date: "Jun 2023", title: "Locked the mortgage", imp: "≈ €8.400 saved in interest so far",
        ctx: "The ECB raised +25bps with mortgage rates still climbing.",
        why: "Locking the rate. Certainty over chasing a few basis points — I’d rather sleep than optimise.",
        ask: "Ask: what if I’d stayed on a variable rate?",
        say: "Locking the mortgage rate before the ECB moves.", read: "ECB raised +25bps", readsrc: "ECB", wrote: "Fixed the mortgage · certainty over basis points",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "Apr 2024", title: "NVIDIA fell ~12% in a day", imp: "−€34.000 on paper · recovered within six weeks",
        ctx: "NVIDIA fell ~12% in a single session on no real news.",
        why: "Your largest single position, €34.000 on paper. A wobble, not a thesis change — you held, and it was back within six weeks.",
        ask: "Ask: what if I’d sold NVIDIA on the drop?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "NVIDIA fell ~12% in a day", trigsrc: "Markets", detect: "Your largest position — €34.000 on paper", logged: "Flagged · no action · you held", mkthead: "",
      },
      {
        date: "Jun 2024", title: "ECB cut rates", imp: "+€3.200 · bonds",
        ctx: "The ECB cut rates for the first time in years; bonds ticked up.",
        why: "The mortgage is already fixed, so the cut only helps the bond sleeve. Noted for you, nothing to do.",
        ask: "Ask: what if I’d moved more into bonds then?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "ECB cut rates", trigsrc: "ECB", detect: "First cut in years; bonds ticked up", logged: "+€3.200 · mortgage already fixed", mkthead: "",
      },
      {
        date: "Oct 2024", title: "Rebalanced after NVIDIA run", imp: "€96.000 locked in · 41% → 28%",
        ctx: "NVIDIA earnings beat, the stock rose 8%, pushing it to 41% of the book.",
        why: "Above my 35% comfort line. Banking some gains, staying invested — trimming the risk, not the conviction.",
        ask: "Ask: what if I hadn’t trimmed NVIDIA?",
        say: "Trimming NVIDIA — it’s gotten too big.", read: "NVIDIA earnings +8% · position at 41%", readsrc: "Earnings", wrote: "Trimmed NVIDIA · €96.000 locked, 41%→28%",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "Jan 2025", title: "Net worth crossed €1.000.000", imp: "€1.000.000 · up €245.000 since 2021",
        ctx: "The NVIDIA run carried total net worth past seven figures.",
        why: "A threshold worth marking — €245.000 above where this journal began in 2021. Saved on its own.",
        ask: "Ask: at this pace, when do I reach €2.000.000?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "Net worth crossed €1.000.000", trigsrc: "", detect: "A threshold worth marking", logged: "Milestone · up €245.000 since 2021", mkthead: "From milestone to journal",
      },
      {
        date: "May 2025", title: "Trimmed Bitcoin at the record", imp: "+€34.000 realised · the core still runs",
        ctx: "Bitcoin printed a new all-time high.",
        why: "Taking the original stake off the table so the rest plays with house money. The core keeps running.",
        ask: "Ask: what if I’d held the whole Bitcoin stake?",
        say: "Taking my original Bitcoin stake off the table.", read: "Bitcoin printed a new all-time high", readsrc: "Crypto", wrote: "Trimmed Bitcoin · +€34.000 realised",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "2026", title: "Crypto sold off hard", imp: "−€33.000 on the year · core intact",
        ctx: "Bitcoin fell ~30% across the year.",
        why: "Down €33.000 on the year, but only the trimmed remainder is exposed. The core thesis is intact — you held.",
        ask: "Ask: what if I’d sold the core before the selloff?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "Bitcoin fell ~30% on the year", trigsrc: "Crypto", detect: "You held the core through it", logged: "−€33.000 on the year · core intact", mkthead: "",
      },
    ],
  },

  band: {
    eyebrow: "Why a journal",
    h2: [["A year on, you won’t remember ", { g: "why." }]],
    youHead: "Memory, one year later",
    youPre: "Sold NVIDIA because ",
    youForget: "it was 41% of everything and earnings had just popped.",
    youQ: "…why did I sell again?",
    volHead: "In Volnar",
    volNote: "Sold NVIDIA because it was 41% of everything and earnings had just popped.",
    volDate: "12 Oct 2024 · still here",
  },

  how: {
    eyebrow: "The decision journal",
    h2: [["Every moment on the chart, ", { g: "written down." }]],
    body: ["Every marker on the chart is an entry — your reason and the number, side by side. The ", { auto: "automatic" }, " ones wrote themselves."],
    tagYou: "You",
    tagAuto: "Auto",
    cap: "Twelve entries and counting — every marker on the chart has one.",
    entries: [
      { date: "Oct 2022", title: "Bought the bottom", tag: "user", why: "Buying when it hurt — the 2022 low.", impact: "+€120.000", dir: "up" },
      { date: "Jan 2025", title: "Crossed €1.000.000", tag: "auto", why: "A milestone on the NVIDIA run.", impact: "+€245.000", dir: "up" },
      { date: "Oct 2024", title: "Rebalanced after NVIDIA run", tag: "user", why: "Above my 35% comfort line.", impact: "€96.000 locked", dir: "up" },
      { date: "Apr 2024", title: "NVIDIA −12% in a day", tag: "auto", why: "Largest position. You held.", impact: "−€34.000", dir: "dn" },
      { date: "Mar 2022", title: "Raised cash before the drop", tag: "user", why: "De-risking before the cycle turned.", impact: "avoided €40.000", dir: "up" },
      { date: "Jun 2023", title: "Locked the mortgage", tag: "user", why: "Certainty over a few basis points.", impact: "€8.400 saved", dir: "up" },
      { date: "May 2025", title: "Trimmed Bitcoin at the record", tag: "user", why: "Original stake off the table.", impact: "+€34.000", dir: "up" },
      { date: "2026", title: "Crypto sold off hard", tag: "auto", why: "Core thesis intact. You held.", impact: "−€33.000", dir: "dn" },
    ],
  },

  notif: {
    eyebrow: "Notifications",
    h2: [["It tells you when something ", { g: "moves." }]],
    body: "A quiet nudge when the market touches what you hold — or you hit a milestone. The ones that matter write themselves into the journal.",
    memoryTime: "memory",
    memories: [
      ["On this day · 1 year ago", "You crossed €1.000.000", "A year on, you sit at €1.290.083."],
      ["On this day · 2 years ago", "You bought the 2022 bottom", "What you added that week is up €120.000."],
      ["On this day · 1 month ago", "You trimmed Bitcoin at its record", "+€34.000 realised — the core still runs."],
    ],
    banners: [
      { app: "ECB · attention", time: "now", t: "Rate +25 bps — affects your mortgage", s: "Yours is fixed. Logged for you." },
      { app: "NVIDIA · earnings beat", time: "8m", t: "+€8.300 on your NVIDIA position", s: "Topped estimates after the close." },
      { app: "Bitcoin · momentum", time: "1h", t: "Above its record — +€4.100", s: "Want to log a decision while it’s fresh?" },
    ],
  },

  privacy: {
    eyebrow: "Private by design",
    h2: [["No bank sync. No advice. ", { g: "On purpose." }]],
    body: "You tell it what happened. It never sells you advice. It answers to you alone.",
    chips: ["No broker connections", "No recommendations", "EU-hosted & read-only"],
  },

  whatif: {
    eyebrow: "What-if · in chat",
    h2: [["See it ", { g: "before" }, " you commit."]],
    body: "Ask in plain language. Volnar runs the numbers — deterministically — and shows the impact. Nothing changes until you decide.",
    placeholder: "Ask a what-if…",
    foot: "Simulated in chat · deterministic math · nothing moves until you decide",
    scenarios: {
      a: {
        label: "Sell flat → world index",
        q: "What if I sell the flat and buy a world index?",
        rows: [
          ["Net worth today", "Unchanged", ""],
          ["Rental income lost", "−€1.500 / mo", "dn"],
          ["Equity concentration", "32% → 71%", ""],
          ["Projected 10-yr · 6%/yr*", "≈ €734.000", "up"],
        ],
      },
      b: {
        label: "Hold everything as-is",
        q: "What if I just hold everything as it is?",
        rows: [
          ["Net worth today", "Unchanged", ""],
          ["Cash earning nothing", "−€2.100 / yr", "dn"],
          ["Equity concentration", "32% · unchanged", ""],
          ["Projected 10-yr · 6%/yr*", "≈ €690.000", "up"],
        ],
      },
    },
  },

  vitals: {
    eyebrow: "Dashboard · Vitals",
    h2: [["Not just what you own — ", { g: "how well it’s built." }]],
    body: "A live dashboard of every asset, and seven Vitals that grade the quality of your wealth — concentration, liquidity, leverage, drawdown risk, real yield, growth. Each reads green, amber or red, the moment something slips.",
    dashLabel: "Portfolio · today",
    dashBadge: "▲ +71% since 2021",
    dashRows: [
      { name: "Public markets", value: "€611.505" },
      { name: "Property", value: "€431.323" },
      { name: "Reserves", value: "€181.110" },
      { name: "Crypto", value: "€66.145" },
    ],
    dashFoot: "Vitals · 4 healthy · 2 to watch",
    bandWatch: "Watch",
    bandHealthy: "Healthy",
    cards: [
      { name: "Concentration", band: "warn", valSuffix: " · NVIDIA", read: "Above the 35% line — one position drives a lot of the book." },
      { name: "Liquidity", band: "ok", valSuffix: " in a week", read: "Over half your wealth is reachable within seven days." },
      { name: "Leverage", band: "ok", valSuffix: " LTV", read: "The mortgage is modest, and the rate is fixed." },
      { name: "Drawdown", band: "ok", valSuffix: " 2008-style", read: "A simultaneous crash would cut about a quarter — survivable." },
      { name: "Cash yield", band: "warn", valSuffix: " real", read: "Cash is quietly losing to inflation and tax." },
      { name: "Real growth", band: "ok", valSuffix: " past year", read: "Net worth is growing ahead of inflation." },
    ],
    ticker: [
      { code: "NV", name: "NVIDIA", color: "#117A52" },
      { code: "AS", name: "ASML", color: "#0B5AA6" },
      { code: "Au", name: "Gold", color: "#C9A227" },
      { code: "₿", name: "Bitcoin", color: "#E0922A" },
      { code: "€", name: "Cash", color: "#C9C3B4" },
      { code: "RE", name: "Property", color: "#3F7CA8" },
    ],
  },

  compare: {
    eyebrow: "Why Volnar, not the rest",
    h2: [["A different ", { g: "axis" }, " entirely."]],
    rows: [
      { l: "Aggregators sync your bank", r: ["Volnar ", { g: "won’t" }, " — so every change keeps your reason"] },
      { l: "AI advisors tell you what to do", r: ["Volnar ", { g: "never advises" }, " — it records what you chose"] },
      { l: "Alerts buzz once and vanish", r: ["Volnar ", { g: "keeps the market’s entries" }] },
    ],
  },

  pricing: {
    eyebrow: "Pricing",
    h2: [["One product. One price."]],
    monthly: { name: "Monthly", amount: "€9,99", per: " / mo", features: ["Full decision journal", "Automatic market journaling", "What-if simulations"] },
    annual: { name: "Annual", amount: "€99,99", per: " / yr", badge: "Save 17%", features: ["Everything in Monthly", "Journal kept for good", "iPhone & web"] },
    cta: "Start the demo",
    micro: "Indicative pricing · 14-day demo, no card required.",
  },

  close: {
    h2: [["The ", { g: "what" }, " is easy."], ["The ", { g: "why" }, " is the part worth keeping."]],
    cta: "Start your journal",
  },

  footer: {
    tagline: "A private decision journal for your wealth.",
    productHead: "Product",
    product: { liveDemo: "Live demo", how: "How it works", pricing: "Pricing" },
    companyHead: "Company",
    company: { privacy: "Privacy", terms: "Terms", support: "Support" },
    copyright: "© 2026 Volnar · NovaHub B.V.",
    disclaimer: "EU-hosted · sample portfolio · prices are real historical market data · *projections illustrative",
  },
};
