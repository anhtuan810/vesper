// Beide Pläne sind dasselbe Abo — eine Liste für beide Preiskarten.
const pricingFeatures = ["Vollständiges Entscheidungsjournal", "Automatisches Markt-Journaling", "Was-wäre-wenn-Simulationen", "iPhone & Web"];

export const de = {
  nav: {
    how: "So funktioniert's",
    why: "Warum Volnar",
    pricing: "Preise",
    signIn: "Anmelden",
    getStarted: "Live-Demo",
  },

  demoPreparing: "Deine Live-Demo wird vorbereitet…",
  demoVeilMore: ["Fünf Jahre echte Marktgeschichte werden angelegt…", "Die zwölf Journal-Einträge werden geschrieben…"],
  demoMicro: "Kein Konto, keine Karte — ein vollständiges Beispielportfolio, bereit in wenigen Sekunden.",
  demoMicroShort: "Kein Konto · keine Karte",

  hero: {
    pill: "Privat · EU-gehostet · keine Bankanbindung",
    h1: [["Verfolge, was dir gehört."], ["Erinnere dich, ", { acc: "warum es dir gehört" }, "."]],
    lead: [
      "Du hältst das ",
      { b: "Warum" },
      " in einem Satz fest. Wenn der Markt dein Geld bewegt, hält Volnar das von selbst fest.",
    ],
    seeDemo: "Live-Demo ansehen",
    howItWorks: "So funktioniert's",
    store: { download: "Laden im", appStore: "App Store" },
  },

  mech: {
    eyebrow: "Zwei Wege, wie ein Eintrag entsteht",
    sub: "Du sprichst — oder der Markt tut es.",
    cap: ["Beispielportfolio, echte Marktgeschichte. Jeder Marker ist ein Eintrag — ", { b: "die automatischen schrieben sich selbst." }],
    netWorthAsOf: "Nettovermögen · Stand",
    badge: "▲ +71% seit 2021",
    legend: { property: "Immobilien", reserves: "Reserven", crypto: "Krypto", publicMarkets: "Börsenmärkte" },
    axisNow: "jetzt",
    replay: "Wiederholen",
    askDemoSuffix: "· in der Live-Demo",
    tag: { decision: "Entscheidung", autoMilestone: "Automatisch · Meilenstein", autoMarket: "Automatisch · Marktbewegung" },
    askFallback: "Frag Volnar ein Was-wäre-wenn zu diesem Tag",
    chat: {
      header: "Vom Chat zum Journal",
      step1: "Du sagst",
      step2: "Es liest dein Portfolio + diesen Tag",
      step3: "Schreibt den Eintrag",
    },
    market: {
      header: "Vom Markt zum Journal",
      auto: "automatisch",
      step1: "Der Markt bewegt sich",
      step2: "Es erkennt den Effekt auf deine Bestände",
      step3: "Hält es für dich fest",
    },
    // Generic fill for whichever pipeline is not the active entry's source.
    genericChat: { say: "Heute 80 NVIDIA verkauft.", read: "Größte Position, 41% · Quartalszahlen, +8%", readsrc: "Quartalszahlen", wrote: "NVIDIA reduziert · €96.000 gesichert" },
    genericMarket: { trig: "NVIDIA −12% an einem Tag.", trigsrc: "Märkte", detect: "Deine größte Position — €34.000 auf dem Papier.", logged: "Markiert · keine Aktion · du hast gehalten", head: "Vom Markt zum Journal" },
    // The 12 chart entries. say/read/readsrc/wrote apply to "you" decisions;
    // trig/trigsrc/detect/logged/mkthead apply to "automatic" entries; the
    // unused set is "" on each entry. Geometry, up/dn and the symbol live in code.
    entries: [
      {
        date: "Jul 2021", title: "Das Journal eröffnet", imp: "€754.000 · Ausgangspunkt",
        ctx: "Die Startlinie — €754.000 verteilt auf eine Wohnung, ein Portfolio und ein wenig Krypto.",
        why: "Tag eins. Ab hier bekommt jeder Schritt einen Grund, damit das künftige Ich das Warum sieht, nicht nur das Was.",
        ask: "Frag: Was wären €754.000 heute allein in einem Indexfonds?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "Du hast das Journal eröffnet", trigsrc: "", detect: "Die Basis, an der alles gemessen wird", logged: "Basis gesetzt · €754.000", mkthead: "Von Tag eins zum Journal",
      },
      {
        date: "Feb 2022", title: "In der Ukraine brach Krieg aus", imp: "−€38.000 in der Woche · über das Jahr erholt",
        ctx: "Aktien fielen stark und Energie schoss in der Woche des Einmarsches in die Höhe.",
        why: "Immobilien sind das größte Exposure, daher war der Schlag abgefedert. Automatisch markiert — keine Aktion, du bist ruhig geblieben.",
        ask: "Frag: Was wäre, wenn ich in der Woche alles verkauft hätte?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "In der Ukraine brach Krieg aus", trigsrc: "Märkte", detect: "Aktien fielen scharf; Energie schoss in die Höhe", logged: "−€38.000 in der Woche · du hast gehalten", mkthead: "",
      },
      {
        date: "Mär 2022", title: "Vor dem Einbruch Cash aufgebaut", imp: "≈ €40.000 des Einbruchs 2022 vermieden",
        ctx: "Die Fed signalisierte ihre ersten Zinsschritte; Aktien waren auf 64% des Nettovermögens gewachsen.",
        why: "Risiko abbauen, bevor der Zyklus dreht. Jetzt in Cash gehen, damit ein erzwungener Verkauf später nie nötig wird.",
        ask: "Frag: Was wäre, wenn ich stattdessen voll investiert geblieben wäre?",
        say: "Gehe in Cash, bevor die Fed mit Zinserhöhungen beginnt.", read: "Fed signalisierte Zinserhöhungen · Aktien 64% des Nettovermögens", readsrc: "Märkte", wrote: "Cash aufgebaut · Risiko im Zyklus reduziert",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "Okt 2022", title: "Am Tief gekauft", imp: "≈ €120.000 seitdem im Plus",
        ctx: "Die Angst erreichte ihren Höhepunkt und die Märkte bildeten in jenem Oktober ihr Tief.",
        why: "Kaufen, wenn es wehtut. Das exakte Tief kann ich nicht treffen, aber das ist nah genug — der Grund ist Überzeugung, nicht Timing.",
        ask: "Frag: Was wäre, wenn ich mit dem Kauf sechs Monate länger gewartet hätte?",
        say: "Ich steige wieder ein — das fühlt sich nach dem Tief an.", read: "Märkte bildeten ihr Tief, als die Angst kulminierte", readsrc: "Märkte", wrote: "Im Dip gekauft · nah am Tief",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "Mär 2023", title: "Eine US-Bank fiel (SVB)", imp: "−€12.000 in der Woche · vollständig erholt",
        ctx: "Eine US-Bank (SVB) fiel; Aktien wackelten, beruhigten sich dann binnen Tagen.",
        why: "Deine Banken sind nicht betroffen und das Cash ist breit gestreut. Festgehalten, beobachtet, in Ruhe gelassen — binnen einer Woche erholt.",
        ask: "Frag: Was wäre, wenn ich beim Bankzusammenbruch ausgestiegen wäre?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "Eine US-Bank fiel (SVB)", trigsrc: "Märkte", detect: "Aktien wackelten, beruhigten sich dann in Tagen", logged: "−€12.000 · erholt, keine Aktion", mkthead: "",
      },
      {
        date: "Jun 2023", title: "Die Hypothek festgeschrieben", imp: "≈ €8.400 an Zinsen bisher gespart",
        ctx: "Die EZB erhöhte +25bps, während die Hypothekenzinsen weiter stiegen.",
        why: "Den Zins festschreiben. Sicherheit statt ein paar Basispunkte zu jagen — ich schlafe lieber, als zu optimieren.",
        ask: "Frag: Was wäre, wenn ich bei einem variablen Zins geblieben wäre?",
        say: "Schreibe den Hypothekenzins fest, bevor die EZB handelt.", read: "EZB erhöhte +25bps", readsrc: "EZB", wrote: "Hypothek festgeschrieben · Sicherheit vor Basispunkten",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "Apr 2024", title: "NVIDIA fiel ~12% an einem Tag", imp: "−€34.000 auf dem Papier · binnen sechs Wochen erholt",
        ctx: "NVIDIA fiel in einer einzigen Sitzung ~12% ohne echte Nachrichten.",
        why: "Deine größte Einzelposition, €34.000 auf dem Papier. Ein Wackeln, keine These-Änderung — du hast gehalten, und binnen sechs Wochen war es zurück.",
        ask: "Frag: Was wäre, wenn ich NVIDIA beim Einbruch verkauft hätte?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "NVIDIA fiel ~12% an einem Tag", trigsrc: "Märkte", detect: "Deine größte Position — €34.000 auf dem Papier", logged: "Markiert · keine Aktion · du hast gehalten", mkthead: "",
      },
      {
        date: "Jun 2024", title: "EZB senkte die Zinsen", imp: "+€3.200 · Anleihen",
        ctx: "Die EZB senkte die Zinsen erstmals seit Jahren; Anleihen zogen an.",
        why: "Die Hypothek ist bereits festgeschrieben, also hilft die Senkung nur dem Anleihenanteil. Für dich notiert, nichts zu tun.",
        ask: "Frag: Was wäre, wenn ich damals mehr in Anleihen umgeschichtet hätte?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "EZB senkte die Zinsen", trigsrc: "EZB", detect: "Erste Senkung seit Jahren; Anleihen zogen an", logged: "+€3.200 · Hypothek bereits festgeschrieben", mkthead: "",
      },
      {
        date: "Okt 2024", title: "Nach der NVIDIA-Rallye umgeschichtet", imp: "€96.000 gesichert · 41% → 28%",
        ctx: "NVIDIA übertraf die Quartalszahlen, die Aktie stieg 8% und schob sich auf 41% des Depots.",
        why: "Über meiner Komfortlinie von 35%. Einen Teil der Gewinne sichern, investiert bleiben — das Risiko reduzieren, nicht die Überzeugung.",
        ask: "Frag: Was wäre, wenn ich NVIDIA nicht reduziert hätte?",
        say: "Reduziere NVIDIA — es ist zu groß geworden.", read: "NVIDIA-Quartalszahlen +8% · Position bei 41%", readsrc: "Quartalszahlen", wrote: "NVIDIA reduziert · €96.000 gesichert, 41%→28%",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "Jan 2025", title: "Nettovermögen überschritt €1.000.000", imp: "€1.000.000 · +€245.000 seit 2021",
        ctx: "Die NVIDIA-Rallye trug das gesamte Nettovermögen über die siebenstellige Marke.",
        why: "Eine Schwelle, die es zu markieren lohnt — €245.000 über dem Start dieses Journals 2021. Von selbst gespeichert.",
        ask: "Frag: Wann erreiche ich bei diesem Tempo €2.000.000?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "Nettovermögen überschritt €1.000.000", trigsrc: "", detect: "Eine Schwelle, die es zu markieren lohnt", logged: "Meilenstein · +€245.000 seit 2021", mkthead: "Vom Meilenstein zum Journal",
      },
      {
        date: "Mai 2025", title: "Bitcoin am Rekord reduziert", imp: "+€34.000 realisiert · der Kern läuft weiter",
        ctx: "Bitcoin markierte ein neues Allzeithoch.",
        why: "Den ursprünglichen Einsatz vom Tisch nehmen, damit der Rest mit dem Geld des Hauses spielt. Der Kern läuft weiter.",
        ask: "Frag: Was wäre, wenn ich den gesamten Bitcoin-Einsatz gehalten hätte?",
        say: "Nehme meinen ursprünglichen Bitcoin-Einsatz vom Tisch.", read: "Bitcoin markierte ein neues Allzeithoch", readsrc: "Krypto", wrote: "Bitcoin reduziert · +€34.000 realisiert",
        trig: "", trigsrc: "", detect: "", logged: "", mkthead: "",
      },
      {
        date: "2026", title: "Krypto brach stark ein", imp: "−€33.000 im Jahr · Kern intakt",
        ctx: "Bitcoin fiel über das Jahr ~30%.",
        why: "€33.000 im Jahr im Minus, aber nur der reduzierte Rest ist exponiert. Die Kernthese ist intakt — du hast gehalten.",
        ask: "Frag: Was wäre, wenn ich den Kern vor dem Einbruch verkauft hätte?",
        say: "", read: "", readsrc: "", wrote: "",
        trig: "Bitcoin fiel ~30% im Jahr", trigsrc: "Krypto", detect: "Du hast den Kern durchgehalten", logged: "−€33.000 im Jahr · Kern intakt", mkthead: "",
      },
    ],
  },

  band: {
    eyebrow: "Warum ein Journal",
    h2: [["Ein Jahr später erinnerst du dich nicht mehr ", { g: "warum." }]],
    youHead: "Erinnerung, ein Jahr später",
    youPre: "NVIDIA verkauft, weil ",
    youForget: "es 41% von allem war und die Quartalszahlen gerade hochgegangen waren.",
    youQ: "…warum habe ich nochmal verkauft?",
    volHead: "In Volnar",
    volNote: "NVIDIA verkauft, weil es 41% von allem war und die Quartalszahlen gerade hochgegangen waren.",
    volDate: "12 Okt 2024 · immer noch da",
  },

  how: {
    eyebrow: "Das Entscheidungsjournal",
    h2: [["Jeder Moment im Chart, ", { g: "festgehalten." }]],
    body: ["Jeder Marker im Chart ist ein Eintrag — dein Grund und die Zahl, nebeneinander. Die ", { auto: "automatischen" }, " haben sich selbst geschrieben."],
    tagYou: "Du",
    tagAuto: "Auto",
    cap: "Acht der zwölf Einträge — jeder Marker im Chart hat einen.",
    capCta: "Lies den Rest in der Live-Demo",
    entries: [
      { date: "Okt 2022", title: "Am Tief gekauft", tag: "user", why: "Kaufen, wenn es wehtut — das Tief 2022.", impact: "+€120.000", dir: "up" },
      { date: "Jan 2025", title: "€1.000.000 überschritten", tag: "auto", why: "Ein Meilenstein in der NVIDIA-Rallye.", impact: "+€245.000", dir: "up" },
      { date: "Okt 2024", title: "Nach der NVIDIA-Rallye umgeschichtet", tag: "user", why: "Über meiner Komfortlinie von 35%.", impact: "€96.000 gesichert", dir: "up" },
      { date: "Apr 2024", title: "NVIDIA −12% an einem Tag", tag: "auto", why: "Größte Position. Du hast gehalten.", impact: "−€34.000", dir: "dn" },
      { date: "Mär 2022", title: "Vor dem Einbruch Cash aufgebaut", tag: "user", why: "Risiko abbauen, bevor der Zyklus drehte.", impact: "€40.000 vermieden", dir: "up" },
      { date: "Jun 2023", title: "Die Hypothek festgeschrieben", tag: "user", why: "Sicherheit statt ein paar Basispunkte.", impact: "€8.400 gespart", dir: "up" },
      { date: "Mai 2025", title: "Bitcoin am Rekord reduziert", tag: "user", why: "Ursprünglicher Einsatz vom Tisch.", impact: "+€34.000", dir: "up" },
      { date: "2026", title: "Krypto brach stark ein", tag: "auto", why: "Kernthese intakt. Du hast gehalten.", impact: "−€33.000", dir: "dn" },
    ],
  },

  notif: {
    eyebrow: "Benachrichtigungen",
    h2: [["Es sagt dir, wenn sich etwas ", { g: "bewegt." }]],
    body: "Ein leiser Hinweis, wenn der Markt berührt, was du hältst — oder du einen Meilenstein erreichst. Die wichtigen schreiben sich selbst ins Journal.",
    memoryTime: "Erinnerung",
    memories: [
      ["An diesem Tag · vor 1 Jahr", "Du hast €1.000.000 überschritten", "Ein Jahr später stehst du bei €1.290.083."],
      ["An diesem Tag · vor 2 Jahren", "Du hast am Tief 2022 gekauft", "Was du in jener Woche zugekauft hast, ist €120.000 im Plus."],
      ["An diesem Tag · vor 1 Monat", "Du hast Bitcoin am Rekord reduziert", "+€34.000 realisiert — der Kern läuft weiter."],
    ],
    banners: [
      { app: "EZB · Achtung", time: "jetzt", t: "Zins +25 bps — betrifft deine Hypothek", s: "Deine ist fest. Für dich festgehalten." },
      { app: "NVIDIA · Quartalszahlen übertroffen", time: "8m", t: "+€8.300 auf deiner NVIDIA-Position", s: "Hat die Schätzungen nach Börsenschluss übertroffen." },
      { app: "Bitcoin · Momentum", time: "1h", t: "Über dem Rekord — +€4.100", s: "Eine Entscheidung festhalten, solange es frisch ist?" },
    ],
  },

  privacy: {
    eyebrow: "Privat by Design",
    h2: [["Keine Bankanbindung. Keine Ratschläge. ", { g: "Mit Absicht." }]],
    body: "Du sagst ihm, was passiert ist — ein Satz genügt, und die Einträge des Marktes schreiben sich selbst. Es verkauft dir nie Ratschläge. Es ist nur dir verpflichtet.",
    chips: ["Keine Broker-Verbindungen", "Keine Empfehlungen", "EU-gehostet"],
  },

  whatif: {
    eyebrow: "Was-wäre-wenn · im Chat",
    h2: [["Sieh es, ", { g: "bevor" }, " du dich festlegst."]],
    body: "Frag in klarer Sprache. Volnar rechnet die Zahlen durch — deterministisch — und zeigt den Effekt. Nichts ändert sich, bis du entscheidest.",
    placeholder: "Stell deine eigene Frage — in der Live-Demo",
    foot: "Im Chat simuliert · deterministische Mathematik · nichts bewegt sich, bis du entscheidest",
    scenarios: {
      a: {
        label: "Wohnung verkaufen → Weltindex",
        q: "Was wäre, wenn ich die Wohnung verkaufe und einen Weltindex kaufe?",
        rows: [
          ["Nettovermögen heute", "Unverändert", ""],
          ["Mieteinnahmen verloren", "−€1.500 / Mon", "dn"],
          ["Aktienanteil", "47% → 81%", ""],
          ["Verkauft & indexiert · 10 J. à 6%*", "≈ €772.000", "up"],
        ],
      },
      b: {
        label: "Alles unverändert halten",
        q: "Was wäre, wenn ich einfach alles so halte, wie es ist?",
        rows: [
          ["Nettovermögen heute", "Unverändert", ""],
          ["Cash verliert gegen die Inflation", "−€2.400 / Jahr", "dn"],
          ["Aktienanteil", "47% · unverändert", ""],
          ["Wohnung behalten · 10 J. à 4%*", "≈ €638.000", "up"],
        ],
      },
    },
  },

  vitals: {
    eyebrow: "Dashboard · Vitalwerte",
    h2: [["Nicht nur, was du besitzt — ", { g: "wie solide es gebaut ist." }]],
    body: "Ein Live-Dashboard jedes Vermögenswerts und sechs Vitalwerte, die die Qualität deines Vermögens bewerten — Konzentration, Liquidität, Verschuldung, Drawdown, Cash-Rendite, reales Wachstum. Jeder trägt eine Note von A bis D — ein Blick zeigt, sobald etwas ins Rutschen gerät.",
    dashLabel: "Portfolio · heute",
    dashBadge: "▲ +71% seit 2021",
    dashRows: [
      { name: "Börsenmärkte", value: "€611.505" },
      { name: "Immobilien", value: "€431.323" },
      { name: "Reserven", value: "€181.110" },
      { name: "Krypto", value: "€66.145" },
    ],
    dashFoot: "Vitalwerte · 4 gesund · 2 im Blick",
    bandWatch: "Im Blick",
    bandHealthy: "Gesund",
    cards: [
      { name: "Konzentration", band: "warn", valSuffix: " · NVIDIA", read: "Über der 35%-Linie — eine Position treibt einen großen Teil des Depots." },
      { name: "Liquidität", band: "ok", valSuffix: " in einer Woche", read: "Über die Hälfte deines Vermögens ist binnen sieben Tagen verfügbar." },
      { name: "Verschuldung", band: "ok", valSuffix: " LTV", read: "Die Hypothek ist moderat und der Zins ist fest." },
      { name: "Drawdown", band: "ok", valSuffix: " 2008-Stil", read: "Ein gleichzeitiger Crash würde etwa ein Viertel kosten — überstehbar." },
      { name: "Cash-Rendite", band: "warn", valSuffix: " real", read: "Cash verliert leise gegen Inflation und Steuern." },
      { name: "Reales Wachstum", band: "ok", valSuffix: " letztes Jahr", read: "Das Nettovermögen wächst schneller als die Inflation." },
    ],
    ticker: [
      { code: "NV", name: "NVIDIA", color: "#117A52" },
      { code: "AS", name: "ASML", color: "#0B5AA6" },
      { code: "Au", name: "Gold", color: "#C9A227" },
      { code: "₿", name: "Bitcoin", color: "#E0922A" },
      { code: "€", name: "Cash", color: "#C9C3B4" },
      { code: "RE", name: "Immobilien", color: "#3F7CA8" },
    ],
  },

  midband: {
    line: "Alles auf dieser Seite ist das Portfolio der Demo — öffne sie und klick dich durch. Wenn es passt: €9,99 im Monat, die ersten 7 Tage gratis.",
  },

  compare: {
    eyebrow: "Warum Volnar, nicht der Rest",
    h2: [["Was die anderen ", { g: "nicht behalten" }, "."]],
    rows: [
      { l: "Tabellen halten die Zahlen fest", r: ["Volnar ", { g: "behält das Warum" }, " gleich daneben"] },
      { l: "Aggregatoren synchronisieren deine Bank", r: ["Volnar ", { g: "tut das nicht" }, " — so behält jede Änderung deinen Grund"] },
      { l: "KI-Berater sagen dir, was du tun sollst", r: ["Volnar ", { g: "berät nie" }, " — es hält fest, was du gewählt hast"] },
      { l: "Alarme summen einmal und verschwinden", r: ["Volnar ", { g: "behält die Einträge des Marktes" }] },
    ],
  },

  pricing: {
    eyebrow: "Preise",
    h2: [["Ein Abo. ", { g: "Zwei Wege zu zahlen." }]],
    lead: "Probier zuerst die Demo — kein Konto, keine Karte. Wenn Volnar passt, abonniere in der App oder im Web: 7 Tage gratis, danach €9,99 im Monat oder €99,99 im Jahr. Jederzeit kündbar.",
    monthly: { name: "Monatlich", amount: "€9,99", per: " / Mon", features: pricingFeatures },
    annual: { name: "Jährlich", amount: "€99,99", per: " / Jahr", badge: "2 Monate gratis", equiv: "≈ €8,33 / Mon", features: pricingFeatures },
    cta: "Live-Demo ansehen",
    micro: "7 Tage gratis, jederzeit kündbar — im Web startet die Probezeit mit hinterlegter Karte. Die Demo selbst braucht weder Konto noch Karte.",
  },

  close: {
    h2: [["Das ", { g: "Was" }, " ist einfach."], ["Das ", { g: "Warum" }, " ist der Teil, der es wert ist, zu bleiben."]],
    cta: "Live-Demo ansehen",
  },

  footer: {
    tagline: "Ein privates Entscheidungsjournal für dein Vermögen.",
    productHead: "Produkt",
    product: { liveDemo: "Live-Demo", how: "So funktioniert's", pricing: "Preise" },
    companyHead: "Unternehmen",
    company: { privacy: "Datenschutz", terms: "AGB", support: "Support" },
    copyright: "© 2026 Volnar · NovaHub B.V.",
    disclaimer: "EU-gehostet · Beispielportfolio · Preise sind echte historische Marktdaten · *Prognosen illustrativ",
  },
};
