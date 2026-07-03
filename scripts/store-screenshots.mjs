// App Store screenshots (warmed-Nocturne dark UI). Renders five 1290x2796
// PNGs (645x1398 CSS @2x) into assets/store/ plus a review contact sheet:
//   node scripts/store-screenshots.mjs
// Fonts are read from a prior `npm run build:native` (out/); if a font upgrade
// changes the hashed filenames below, re-derive them from the built CSS.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const SCRATCH = path.resolve(import.meta.dirname, "../assets/store");
const MEDIA = path.resolve(import.meta.dirname, "../out/_next/static/media");

// ── Fonts (exact files the app ships) ────────────────────────────────────────
const b64 = (f) => fs.readFileSync(path.join(MEDIA, f)).toString("base64");
const face = (fam, style, weight, file) =>
  `@font-face{font-family:"${fam}";font-style:${style};font-weight:${weight};src:url(data:font/woff2;base64,${b64(file)}) format("woff2")}`;
const FONTS = [
  face("Inter", "normal", "100 900", "83afe278b6a6bb3c-s.p.0q-301v4kxxnr.woff2"),
  face("Spectral", "normal", "400", "98f992443ccb276f-s.p.0jd0f37ymqamw.woff2"),
  face("Spectral", "normal", "500", "23d3c9ac01cd973c-s.p.02r7r_3v3gydk.woff2"),
  face("Spectral", "italic", "400", "c77846bcb3371a93-s.p.0e02f3~6sn7w-.woff2"),
  face("Spectral", "italic", "500", "ef598559186306ee-s.p.0fdh6gfw.fu66.woff2"),
].join("\n");

// ── Nocturne tokens (globals.css dark block) ─────────────────────────────────
const T = {
  bg: "#131109", surface: "#1B1810", elev: "#232015",
  border: "rgba(255,248,230,.08)", borderS: "rgba(255,248,230,.15)",
  text: "#EDE7DA", dim: "#A79F8C", faint: "#7C755F", hero: "#FBF7EC",
  brass: "#CBA75E", brassSoft: "rgba(203,167,94,.14)", brassText: "#DCBE82",
  pos: "#5FB58A", posSoft: "rgba(95,181,138,.15)", posText: "#7FC7A2",
  amber: "#C99A4D",
  markets: "#6FAE8B", reserves: "#A9A382", property: "#6E8FB0", crypto: "#D6A14E",
  stage: "#0D0A05",
};

// ── Small shared pieces ──────────────────────────────────────────────────────
const VMARK = (s) => `
  <svg width="${s}" height="${s}" viewBox="0 0 60 60" style="display:block">
    <polygon points="4,8 16,8 30,46 44,8 56,8 33,54 27,54" fill="${T.hero}"/>
    <polygon points="18,10 42,10 30,42" fill="${T.brass}"/>
  </svg>`;

const STATUSBAR = (time) => `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:17px 26px 0">
    <div style="font:600 14px Inter;color:${T.text};letter-spacing:.01em">${time}</div>
    <div style="display:flex;gap:6px;align-items:center">
      <svg width="17" height="11" viewBox="0 0 17 11" fill="${T.text}">
        <rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/>
        <rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1" opacity=".35"/>
      </svg>
      <svg width="15" height="11" viewBox="0 0 15 11" fill="${T.text}">
        <path d="M7.5 9.8 5.2 7.4a3.4 3.4 0 0 1 4.6 0Zm4-4.1a7 7 0 0 0-8 0L2 4.1a9.4 9.4 0 0 1 11 0Z"/>
      </svg>
      <svg width="23" height="11" viewBox="0 0 23 11">
        <rect x=".5" y=".5" width="19" height="10" rx="3" fill="none" stroke="${T.text}" opacity=".4"/>
        <rect x="2" y="2" width="12" height="7" rx="1.6" fill="${T.text}"/>
        <path d="M21 3.5v4a2.2 2.2 0 0 0 0-4Z" fill="${T.text}" opacity=".4"/>
      </svg>
    </div>
  </div>`;

const APPBAR = `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 22px 0">
    <div style="display:flex;align-items:center;gap:7px">${VMARK(17)}
      <span style="font:600 15.5px Inter;color:${T.hero};letter-spacing:-.04em">Volnar</span></div>
    <span style="font:400 12.5px Inter;color:${T.dim}">Alex</span>
  </div>`;

const ICONS = {
  portfolio: `<circle cx="11" cy="11" r="8.2"/><path d="M11 6.5V11l3 2.2"/>`,
  vitals: `<path d="M2.5 11h4l2-5 3.5 10 2.5-7 1.5 2h3.5"/>`,
  chat: `<path d="M18.5 10.5a7.5 7.5 0 1 1-3-6" /><path d="M11 18.5c2 1.6 4.4 2 6.5 1.6-.7-1.1-.9-2.2-.8-3.2"/>`,
  diary: `<path d="M11 5.5C9 3.8 6 3.6 3.5 4.4v12.2C6 15.8 9 16 11 17.7c2-1.7 5-1.9 7.5-1.1V4.4C16 3.6 13 3.8 11 5.5Zm0 0v12.2"/>`,
  profile: `<circle cx="11" cy="7.5" r="3.6"/><path d="M4 18.5c1.2-3.2 3.9-4.8 7-4.8s5.8 1.6 7 4.8"/>`,
};
const BOTTOMNAV = (active) => `
  <div style="position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent, ${T.bg} 26%);padding:16px 10px 8px">
    <div style="display:flex;justify-content:space-around;align-items:center">
      ${["portfolio", "vitals", "chat", "diary", "profile"].map((k) => {
        const on = k === active;
        const col = on ? T.brass : T.faint;
        const ring = k === "chat"
          ? `width:40px;height:40px;border:1.4px solid ${on ? T.brass : T.borderS};border-radius:999px;display:flex;align-items:center;justify-content:center;margin-top:-8px;background:${T.bg}`
          : "";
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="${ring}">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>
          </div>
          <span style="font:${on ? 500 : 400} 10px Inter;color:${col};text-transform:capitalize">${k}</span>
        </div>`;
      }).join("")}
    </div>
    <div style="width:120px;height:4px;border-radius:99px;background:${T.borderS};margin:10px auto 0"></div>
  </div>`;

// A floating UI fragment (the "life" around the phone).
const FLOAT = (style, inner) => `
  <div style="position:absolute;z-index:5;background:${T.elev};border:1px solid ${T.borderS};
              border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.3);
              ${style}">${inner}</div>`;

// ── Stage: headline + tilted phone + glow ────────────────────────────────────
function stage({ index, accentFirst, plain, accent, tail, sub, tilt, screen, floats }) {
  const headline = accentFirst
    ? `<em style="font-style:italic;color:${T.brass}">${accent}</em>${plain}`
    : `${plain}<em style="font-style:italic;color:${T.brass}">${accent}</em>${tail || "."}`;
  return `
  <div class="stage">
    <div class="glow"></div>
    <div class="ghost">${VMARK(560)}</div>
    <div style="position:relative;z-index:2;padding:54px 50px 0">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:9px">${VMARK(21)}
          <span style="font:600 16px Inter;color:${T.hero};letter-spacing:-.04em">Volnar</span></div>
        <span style="font:500 11.5px Inter;color:${T.brass};letter-spacing:.22em">${index}</span>
      </div>
      <h1 style="margin:44px 0 0;font:400 54px/1.12 Spectral;color:${T.hero};letter-spacing:-.02em">${headline}</h1>
      <p style="margin:18px 0 0;font:400 16.5px/1.5 Inter;color:${T.dim};max-width:490px">${sub}</p>
    </div>
    <div style="position:absolute;z-index:3;left:50%;top:352px;width:396px;height:1002px;
                transform:translateX(-50%) rotate(${tilt}deg);transform-origin:50% 20%">
      <div style="position:absolute;inset:0;border-radius:60px;background:#020202;
                  box-shadow:0 0 0 1.5px rgba(255,248,230,.14), 0 50px 120px rgba(0,0,0,.7), 0 0 90px rgba(203,167,94,.14)">
        <div style="position:absolute;inset:10px;border-radius:51px;background:${T.bg};overflow:hidden">
          <div style="position:absolute;top:13px;left:50%;transform:translateX(-50%);width:96px;height:28px;border-radius:99px;background:#000;z-index:9"></div>
          ${screen}
        </div>
      </div>
    </div>
    ${floats || ""}
  </div>`;
}

const PAGE = (bodies) => `
  <style>
    ${FONTS}
    * { margin:0; box-sizing:border-box; -webkit-font-smoothing:antialiased; }
    .stage { width:645px; height:1398px; position:relative; overflow:hidden; background:${T.stage}; }
    .glow { position:absolute; inset:0; z-index:1; background:
      radial-gradient(circle 540px at 50% 690px, rgba(203,167,94,.20), transparent 70%),
      radial-gradient(circle 700px at 88% 4%, rgba(203,167,94,.07), transparent 65%); }
    .ghost { position:absolute; z-index:1; right:-190px; top:920px; opacity:.05; transform:rotate(9deg); }
    .eyebrow { font:500 10px Inter; letter-spacing:.12em; text-transform:uppercase; color:${T.faint}; }
    .tnum { font-feature-settings:"tnum"; }
  </style>
  ${bodies}`;

// ═════════════════════════════ SCREEN 1 · PORTFOLIO ══════════════════════════
const areaChart = `
  <svg width="100%" height="168" viewBox="0 0 352 168" preserveAspectRatio="none" style="display:block">
    ${[0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="352" y1="${168 * f}" y2="${168 * f}" stroke="${T.border}" stroke-width="1"/>`).join("")}
    <path d="M0 168 L0 118 C50 114 90 120 140 110 C200 98 240 104 290 88 C315 81 336 76 352 72 L352 168 Z" fill="${T.property}" opacity=".55"/>
    <path d="M0 118 C50 114 90 120 140 110 C200 98 240 104 290 88 C315 81 336 76 352 72 L352 46 C320 52 290 58 250 64 C200 72 150 70 100 80 C60 87 30 86 0 92 Z" fill="${T.markets}" opacity=".8"/>
    <path d="M0 92 C30 86 60 87 100 80 C150 70 200 72 250 64 C290 58 320 52 352 46 L352 32 C310 39 270 44 230 50 C180 57 130 58 90 66 C55 72 25 74 0 78 Z" fill="${T.reserves}" opacity=".75"/>
    <path d="M0 78 C25 74 55 72 90 66 C130 58 180 57 230 50 C270 44 310 39 352 32 L352 22 C310 30 270 34 230 40 C180 47 130 49 90 56 C55 62 25 65 0 69 Z" fill="${T.crypto}" opacity=".8"/>
    <line x1="262" x2="262" y1="30" y2="168" stroke="${T.borderS}" stroke-width="1" stroke-dasharray="3 3"/>
    <circle cx="262" cy="58" r="4.5" fill="${T.brass}" stroke="${T.bg}" stroke-width="2"/>
    <text x="326" y="52" font-family="Inter" font-size="9" fill="${T.faint}">€400K</text>
    <text x="326" y="112" font-family="Inter" font-size="9" fill="${T.faint}">€200K</text>
  </svg>`;

const rangePills = `
  <div style="display:flex;gap:6px;padding:12px 22px 0">
    ${["1D", "1W", "1M", "3M", "1Y", "3Y", "All"].map((r) => `
      <span style="font:500 11px Inter;padding:5px 11px;border-radius:99px;
        ${r === "3M" ? `background:${T.elev};color:${T.text};border:1px solid ${T.borderS}` : `color:${T.faint};border:1px solid transparent`}">${r}</span>`).join("")}
  </div>`;

const HOUSE = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="${T.dim}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5 7 2l5 4.5M3.5 5.8V12h7V5.8"/></svg>`;
const holdingRow = (icon, name, subl, val, subr, pos) => `
  <div style="display:flex;align-items:center;gap:11px;padding:8px 0">
    <div style="width:30px;height:30px;border-radius:8px;background:${T.elev};border:1px solid ${T.border};
                display:flex;align-items:center;justify-content:center;font:600 8.5px Inter;color:${T.dim}">${icon === "⌂" ? HOUSE : icon}</div>
    <div style="flex:1;min-width:0">
      <div style="font:500 13px Inter;color:${T.text}">${name}</div>
      <div style="font:400 11px Inter;color:${T.faint};margin-top:1px">${subl}</div>
    </div>
    <div style="text-align:right">
      <div class="tnum" style="font:500 13px Inter;color:${T.text}">${val}</div>
      <div class="tnum" style="font:400 11px Inter;color:${pos ? T.posText : T.faint};margin-top:1px">${subr}</div>
    </div>
  </div>`;

const classBar = (name, color, frac, val) => `
  <div style="display:flex;align-items:center;gap:12px;padding:11px 0 3px">
    <span style="font:600 12.5px Inter;color:${T.text};width:104px">${name}</span>
    <div style="flex:1;height:4px;border-radius:99px;background:${T.elev}">
      <div style="width:${frac}%;height:4px;border-radius:99px;background:${color}"></div></div>
    <span class="tnum" style="font:500 12.5px Inter;color:${T.text}">${val}</span>
  </div>`;

const screen1 = `
  ${STATUSBAR("9:41")} ${APPBAR}
  <div style="padding:20px 22px 0">
    <div class="eyebrow">Net worth <span style="color:${T.faint};opacity:.6">· Liquid</span></div>
    <div class="tnum" style="font:600 37px Inter;color:${T.hero};letter-spacing:-.02em;margin-top:6px">€367.800</div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:9px">
      <span class="tnum" style="font:500 12px Inter;color:${T.posText};background:${T.posSoft};padding:4px 10px;border-radius:99px">▲ €6.629 (1,84%)</span>
      <span style="font:400 11.5px Inter;color:${T.faint}">1 Jun 2026</span>
    </div>
  </div>
  <div style="margin-top:18px;padding:0 22px">${areaChart}</div>
  ${rangePills}
  <div style="margin:14px 22px 0;padding:12px 14px;background:${T.surface};border:1px solid ${T.border};border-radius:14px">
    <div style="font:italic 400 12.5px/1.45 Spectral;color:${T.text}">Assuming ~5%/yr, you could reach about <b style="font-weight:600">€658K by 2036</b>.
      <span style="color:${T.brassText};font-style:italic"> See what moves it →</span></div>
  </div>
  <div style="padding:18px 22px 0">
    <div class="eyebrow">Holdings · 12 positions</div>
    ${classBar("Property", T.property, 68, "€250.000")}
    ${holdingRow("⌂", "Apartment — Amsterdam", "NL · 36% owned", "€190.000", "equity", false)}
    ${holdingRow("⌂", "Rental — Rotterdam", "NL · 24% owned", "€60.000", "equity", false)}
    ${classBar("Public markets", T.markets, 24, "€88.297")}
    ${holdingRow("IWDA", "iShares Core MSCI World", "Amsterdam · 320 shares", "€39.942", "+0,16%", true)}
    ${holdingRow("NVDA", "NVIDIA", "Nasdaq · 26 shares", "€14.380", "+1,02%", true)}
  </div>
  ${BOTTOMNAV("portfolio")}`;

const floats1 = FLOAT(
  `right:26px;top:610px;transform:rotate(3deg);padding:12px 16px`,
  `<div class="eyebrow" style="color:${T.brassText}">Projection</div>
   <div class="tnum" style="font:600 19px Inter;color:${T.hero};margin-top:4px">€658K <span style="font:400 12px Inter;color:${T.dim}">by 2036</span></div>
   <svg width="120" height="30" viewBox="0 0 120 30" style="margin-top:6px">
     <path d="M0 26 C30 24 55 18 80 12 S110 4 120 2" fill="none" stroke="${T.brass}" stroke-width="2" stroke-linecap="round"/>
     <circle cx="120" cy="2" r="3" fill="${T.brass}"/></svg>`,
) + FLOAT(
  `left:22px;top:1210px;transform:rotate(-4deg);padding:10px 14px;border-radius:99px`,
  `<span class="tnum" style="font:500 13px Inter;color:${T.posText}">▲ 1,84% this week</span>`,
);

// ═════════════════════════════ SCREEN 2 · CHAT ═══════════════════════════════
const hl = (t) => `<span style="background:${T.brassSoft};color:${T.brassText};border-radius:5px;padding:1px 5px;font-weight:500">${t}</span>`;
const screen2 = `
  ${STATUSBAR("9:41")} ${APPBAR}
  <div style="padding:26px 22px 0;display:flex;flex-direction:column;gap:16px">
    <div style="align-self:flex-end;max-width:78%;background:${T.elev};border:1px solid ${T.border};
                border-radius:18px 18px 4px 18px;padding:11px 15px;font:400 13.5px/1.45 Inter;color:${T.text}">
      How diversified am I?</div>
    <div style="font:400 13.5px/1.62 Inter;color:${T.text};display:flex;flex-direction:column;gap:13px">
      <div>Your portfolio is relatively concentrated, Alex, despite holding across several asset classes.</div>
      <div>${hl("Real estate dominates at 68%")} of net worth — two Dutch properties, both leveraged. Both sit in the Netherlands, so you carry asset-class and country risk in one allocation.</div>
      <div>${hl("Liquid public markets are slim at about 13%")} — the ${hl("MSCI World ETF")} at ${hl("8%")} is your broadest holding, and the tech sleeve clusters heavily in US technology.</div>
      <div>${hl("Crypto at 2%")} adds diversification on paper but is too small to move portfolio outcomes.</div>
      <div>${hl("Cash at 7%")} and ${hl("pension at 9%")} round things out — they damp volatility, but also long-run compounding.</div>
    </div>
  </div>
  <div style="position:absolute;left:16px;right:16px;bottom:96px">
    <div style="display:flex;align-items:center;gap:10px;background:${T.surface};border:1px solid ${T.borderS};
                border-radius:99px;padding:12px 8px 12px 18px">
      <span style="flex:1;font:400 13px Inter;color:${T.faint}">Ask anything about your portfolio…</span>
      <div style="width:30px;height:30px;border-radius:99px;background:${T.brass};display:flex;align-items:center;justify-content:center">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#11131A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6.5 11V2M2.5 6 6.5 2l4 4"/></svg></div>
    </div>
    <div style="text-align:center;font:400 9.5px Inter;color:${T.faint};margin-top:8px">
      Informational only. Volnar tracks and explains your portfolio; it does not provide financial advice.</div>
  </div>
  ${BOTTOMNAV("chat")}`;

const bubbleFloat = (style, q) => FLOAT(
  style + `;border-radius:99px;padding:11px 17px`,
  `<span style="font:400 13.5px Inter;color:${T.text}">${q}</span>`,
);
const floats2 =
  bubbleFloat(`left:18px;top:565px;transform:rotate(-4deg)`, `What if I sell <b style="color:${T.brassText}">NVIDIA</b>?`) +
  bubbleFloat(`right:26px;top:1128px;transform:rotate(3deg)`, `Can I retire at <b style="color:${T.brassText}">55</b>?`);

// ═════════════════════════════ SCREEN 3 · VITALS ═════════════════════════════
const GRADE = { A: T.pos, B: T.brass, C: T.amber, D: "#D08763" };
const vitalCard = (grade, name, metric, unit, note, barHtml) => `
  <div style="display:flex;gap:12px;background:${T.surface};border:1px solid ${T.border};border-radius:14px;padding:13px 14px;margin-top:10px">
    <div style="width:34px;height:34px;border-radius:9px;background:${GRADE[grade]}1f;border:1px solid ${GRADE[grade]}55;
                display:flex;align-items:center;justify-content:center;font:500 17px Spectral;color:${GRADE[grade]}">${grade}</div>
    <div style="flex:1">
      <div class="eyebrow">${name}</div>
      <div style="margin-top:4px"><span class="tnum" style="font:600 21px Inter;color:${T.hero}">${metric}</span>
        <span style="font:400 11.5px Inter;color:${T.dim}"> ${unit}</span></div>
      ${barHtml || ""}
      <div style="font:400 11px/1.45 Inter;color:${T.dim};margin-top:7px">${note}</div>
    </div>
  </div>`;

const segBar = (segs) => `
  <div style="display:flex;gap:3px;margin-top:9px">
    ${segs.map(([w, c]) => `<div style="height:5px;border-radius:99px;background:${c};width:${w}%"></div>`).join("")}
  </div>`;

const screen3 = `
  ${STATUSBAR("9:41")} ${APPBAR}
  <div style="padding:18px 22px 0">
    <div style="font:400 26px Spectral;color:${T.hero};letter-spacing:-.018em">Vitals</div>
    <div style="margin-top:12px;background:#1A150C;border:1px solid ${T.border};border-radius:16px;padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="eyebrow" style="color:#E3C077">Pulse · 20 June</span>
        <span style="font:400 10.5px Inter;color:${T.faint}">4 vitals · 0 shifted</span></div>
      <svg width="100%" height="26" viewBox="0 0 320 26" preserveAspectRatio="none" style="margin-top:8px">
        <path d="M0 15 H96 l8-9 10 16 8-13 6 6 H186 l7-5 9 9 7-4 H320" fill="none" stroke="#E3C077" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/></svg>
      <div style="font:italic 400 12.5px/1.5 Spectral;color:#F1E9D6;margin-top:8px">
        Your portfolio carries <b style="font-weight:600">29,5% concentration</b> in a single pension holding, with 68% of investable assets locked beyond six months.</div>
    </div>
    <div class="eyebrow" style="margin-top:16px">Active vitals · 4</div>
    ${vitalCard("B", "Concentration", "29,5%", "of investable assets", "Top position within the balanced range — threshold ≤ 35%.",
      segBar([[29.5, GRADE.B], [26, T.elev], [22.5, T.elev], [9, T.elev]]))}
    ${vitalCard("A", "Liquidity posture", "22,3%", "deployable within 1 week", "Above the 15% buffer target — 7% cash, 15% market.",
      segBar([[7, GRADE.A], [15, "#3d6b52"], [58, T.elev], [9, "#3a352a"]]))}
    ${vitalCard("C", "Cash drag", "€26.000", "eroding at 1,3%/yr", "The emergency fund is losing real yield against inflation.")}
    ${vitalCard("B", "FX exposure", "64%", "non-EUR assets", "US-dollar tilt from the tech sleeve — hedged only by the index fund.")}
  </div>
  ${BOTTOMNAV("vitals")}`;

const floats3 = FLOAT(
  `right:24px;top:592px;transform:rotate(3.5deg);padding:14px 18px;text-align:center`,
  `<div style="font:500 34px Spectral;color:${T.pos};line-height:1">A</div>
   <div class="eyebrow" style="margin-top:6px;color:${T.dim}">Liquidity</div>`,
) + FLOAT(
  `left:20px;top:1240px;transform:rotate(-3deg);padding:10px 14px;border-radius:99px`,
  `<span style="font:500 12.5px Inter;color:${T.text}">Graded <b style="color:${T.brassText}">A–D</b>, every day</span>`,
);

// ═════════════════════════════ SCREEN 4 · DIARY ══════════════════════════════
const entry = (icon, name, delta, date, note) => `
  <div style="padding:11px 0;border-bottom:1px solid ${T.border}">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:28px;height:28px;border-radius:8px;background:${T.elev};border:1px solid ${T.border};
                  display:flex;align-items:center;justify-content:center;font:600 8px Inter;color:${T.dim}">${icon === "⌂" ? HOUSE : icon}</div>
      <span style="flex:1;font:500 13px Inter;color:${T.text}">${name}</span>
      <span class="tnum" style="font:500 12px Inter;color:${T.brassText}">${delta}</span>
      <span style="font:400 10.5px Inter;color:${T.faint}">${date}</span>
    </div>
    <div style="font:italic 400 12.5px/1.5 Spectral;color:${T.dim};margin:7px 0 0 38px">${note}</div>
  </div>`;
const swing = (label, pct, up, date) => `
  <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-top:8px;border-radius:10px;
              background:${T.brassSoft};border:1px solid rgba(203,167,94,.18)">
    <span style="font:400 11px Inter;color:${T.brassText}">~</span>
    <span class="tnum" style="flex:1;font:400 12px Inter;color:${up ? T.posText : "#E0A488"}">${label} ${pct}</span>
    <span style="font:400 10.5px Inter;color:${T.faint}">${date}</span>
  </div>`;

const screen4 = `
  ${STATUSBAR("9:41")} ${APPBAR}
  <div style="padding:18px 22px 0">
    <div style="font:400 26px Spectral;color:${T.hero};letter-spacing:-.018em">Diary</div>
    <div style="display:flex;align-items:center;gap:9px;margin-top:12px;background:${T.surface};
                border:1px solid ${T.border};border-radius:99px;padding:10px 16px">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="${T.faint}" stroke-width="1.5">
        <circle cx="5.5" cy="5.5" r="4"/><path d="m8.5 8.5 3 3"/></svg>
      <span style="font:400 12.5px Inter;color:${T.faint}">Search asml, april, removed…</span>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px">
      ${["All", "1W", "1M", "3M", "1Y", "Custom"].map((r, i) => `
        <span style="font:500 11px Inter;padding:5px 12px;border-radius:99px;
          ${i === 0 ? `background:${T.elev};color:${T.text};border:1px solid ${T.borderS}` : `color:${T.faint};border:1px solid ${T.border}`}">${r}</span>`).join("")}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:18px">
      <span style="font:500 15px Spectral;color:${T.text}">February</span>
      <span style="font:400 10.5px Inter;color:${T.faint}">1 entry</span></div>
    ${entry("NVDA", "NVIDIA", "+10 shares", "18 Feb", "Added a little more NVIDIA. Letting a winner run, but only inside a sleeve I have sized to sleep through.")}
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px">
      <span style="font:500 15px Spectral;color:${T.text}">October 2025</span>
      <span style="font:400 10.5px Inter;color:${T.faint}">1 entry</span></div>
    ${entry("IWDA", "iShares Core MSCI World", "+120 shares", "14 Oct", "Kept the monthly index plan running. The most reliable thing I do is buy a little every month and ignore the noise.")}
    ${swing("Nasdaq", "+2,2%", true, "13 Oct")}
    ${swing("Nasdaq", "−3,6%", false, "10 Oct")}
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px">
      <span style="font:500 15px Spectral;color:${T.text}">August 2025</span>
      <span style="font:400 10.5px Inter;color:${T.faint}">1 entry</span></div>
    ${entry("⌂", "Apartment — Amsterdam", "+€25.000", "12 Aug", "One-off overpayment on the home mortgage. A guaranteed 1,9% saved beat leaving the cash idle.")}
  </div>
  ${BOTTOMNAV("diary")}`;

const floats4 = FLOAT(
  `right:22px;top:600px;transform:rotate(3deg);padding:13px 16px`,
  `<div class="eyebrow" style="color:${T.brassText}">Portfolio on this day →</div>
   <svg width="150" height="36" viewBox="0 0 150 36" style="margin-top:8px">
     <path d="M0 28 C25 26 45 20 70 18 S120 10 150 6" fill="none" stroke="${T.dim}" stroke-width="1.6"/>
     <circle cx="38" cy="22.5" r="3" fill="${T.brass}"/>
     <circle cx="96" cy="12.5" r="3" fill="${T.brass}"/>
     <circle cx="96" cy="12.5" r="6.5" fill="none" stroke="${T.brass}" stroke-width="1.2" opacity=".6"/>
     <circle cx="132" cy="8" r="3" fill="${T.brass}"/></svg>
   <div style="font:400 10.5px Inter;color:${T.dim};margin-top:6px">Tap a decision · rewind the chart</div>`,
);

// ═════════════════════════════ SCREEN 5 · PAYOFF ═════════════════════════════
const statRow = (k, v, sub) => `
  <div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px solid ${T.border}">
    <span style="font:400 12.5px Inter;color:${T.dim}">${k}</span>
    <span style="text-align:right"><span class="tnum" style="font:500 14px Spectral;color:${T.text}">${v}</span>
      ${sub ? `<span style="display:block;font:400 10px Inter;color:${T.faint};margin-top:1px">${sub}</span>` : ""}</span>
  </div>`;

const screen5 = `
  ${STATUSBAR("9:41")} ${APPBAR}
  <div style="padding:16px 22px 0">
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="${T.dim}" stroke-width="1.6" stroke-linecap="round"><path d="M9.5 2.5 5 7.5l4.5 5"/></svg>
    <div style="font:400 23px Spectral;color:${T.hero};letter-spacing:-.018em;margin-top:10px">Apartment — Amsterdam</div>
    <div style="font:400 11.5px Inter;color:${T.faint};margin-top:3px">Eerste Helmersstraat 95, 1054 DZ Amsterdam</div>
    <div class="eyebrow" style="margin-top:16px">Equity</div>
    <div class="tnum" style="font:600 30px Inter;color:${T.hero};letter-spacing:-.02em;margin-top:4px">€190.000</div>
    <div style="font:400 11.5px Inter;color:${T.dim};margin-top:3px">of €525.000 value · 88 m² · owned since Jun 2021 · 5 yrs</div>
    <div style="height:6px;border-radius:99px;background:${T.elev};margin-top:10px">
      <div style="width:36%;height:6px;border-radius:99px;background:${T.brass}"></div></div>
    <div style="margin-top:14px;padding:12px 14px;background:${T.surface};border:1px solid ${T.border};border-radius:14px">
      <div style="font:italic 400 12.5px/1.5 Spectral;color:${T.text}">Add €100 a month and you're mortgage-free by <b style="font-weight:600">2049, 2 years sooner</b>.
        <span style="color:${T.brassText}"> See what else shortens it →</span></div></div>
    <div class="eyebrow" style="margin-top:16px">Mortgage</div>
    ${statRow("Balance", "€335.000")}
    ${statRow("Rate", "1,90%")}
    ${statRow("Payment", "€1.390", "per month")}
    ${statRow("Type", "Annuity")}
    ${statRow("Mortgage-free", "Jun 2051", "25 years to go")}
    <div class="eyebrow" style="margin-top:16px">Payoff projection</div>
    <svg width="100%" height="126" viewBox="0 0 352 126" preserveAspectRatio="none" style="margin-top:8px">
      <line x1="0" x2="352" y1="120" y2="120" stroke="${T.border}"/>
      <path d="M0 20 C80 30 170 54 260 86 S330 112 352 119 L352 126 L0 126 Z" fill="${T.property}" opacity=".16"/>
      <path d="M0 20 C80 30 170 54 260 86 S330 112 352 119" fill="none" stroke="${T.property}" stroke-width="2"/>
      <path d="M56 27 C130 35 200 50 268 72 S326 94 338 99" fill="none" stroke="${T.brass}" stroke-width="1.8" stroke-dasharray="5 4"/>
      <circle cx="56" cy="27" r="4" fill="${T.brass}" stroke="${T.bg}" stroke-width="2"/>
      <text x="48" y="14" font-family="Inter" font-size="9" fill="${T.faint}">TODAY</text>
      <text x="298" y="86" font-family="Inter" font-size="9" fill="${T.brassText}">−2 yrs</text>
    </svg>
  </div>
  ${BOTTOMNAV("portfolio")}`;

const floats5 = FLOAT(
  `right:28px;top:596px;transform:rotate(3deg);padding:12px 16px`,
  `<div class="eyebrow" style="color:${T.brassText}">Scenario</div>
   <div style="font:500 15px Spectral;color:${T.hero};margin-top:4px">+€100 <span style="font:italic 400 13px Spectral;color:${T.dim}">/month</span></div>
   <div class="tnum" style="font:400 11px Inter;color:${T.posText};margin-top:3px">▲ mortgage-free 2 yrs sooner</div>`,
) + FLOAT(
  `left:22px;top:1225px;transform:rotate(-3.5deg);padding:10px 14px;border-radius:99px`,
  `<span style="font:500 12.5px Inter;color:${T.text}">Pensions · mortgages · <b style="color:${T.brassText}">projections</b></span>`,
);

// ═════════════════════════════ RENDER ════════════════════════════════════════
const SHOTS = [
  { file: "01-wealth", index: "01 · OVERVIEW", plain: "All your wealth,<br>made ", accent: "clear", sub: "Property, markets, pension, crypto and cash — brought into one clear, live number.", tilt: -3, screen: screen1, floats: floats1 },
  { file: "02-ask", index: "02 · ASK", plain: "Ask it ", accent: "anything", sub: "A private banker's answer, from your own numbers — not generic advice.", tilt: 3.5, screen: screen2, floats: floats2 },
  { file: "03-vitals", index: "03 · VITALS", plain: "Your ", accent: "vital signs", sub: "Concentration, liquidity, cash drag and FX — graded A to D, watched daily.", tilt: -2.5, screen: screen3, floats: floats3 },
  { file: "04-diary", index: "04 · DIARY", plain: "Remember ", accent: "every move", sub: "Every decision in your own words, pinned to the chart on the day you made it.", tilt: 2.5, screen: screen4, floats: floats4 },
  { file: "05-payoff", index: "05 · THE LONG GAME", plain: "Down to the ", accent: "payoff", sub: "Mortgages and pensions modelled to their last month — and what shortens them.", tilt: -3, screen: screen5, floats: floats5 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 645, height: 1398 }, deviceScaleFactor: 2 });
for (const s of SHOTS) {
  await page.setContent(PAGE(stage(s)), { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SCRATCH, `${s.file}.png`) });
  console.log("rendered", s.file);
}

// Contact sheet for review.
const tiles = SHOTS.map((s) => {
  const b = fs.readFileSync(path.join(SCRATCH, `${s.file}.png`)).toString("base64");
  return `<img src="data:image/png;base64,${b}" style="width:300px;border-radius:10px">`;
}).join("");
await page.setViewportSize({ width: 1600, height: 720 });
const sheet = await browser.newPage({ viewport: { width: 1600, height: 700 }, deviceScaleFactor: 1 });
await sheet.setContent(`<body style="margin:0;background:#26282e;display:flex;gap:10px;align-items:center;justify-content:center;height:700px">${tiles}</body>`);
await sheet.screenshot({ path: path.join(SCRATCH, "_contact-sheet.png") });
await browser.close();
console.log("done");
