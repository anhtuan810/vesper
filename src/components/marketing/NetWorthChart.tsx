"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHART_AREAS, CHART_LINE, MARKERS } from "./_chart-geometry";
import { ENTRIES, GENERIC_CHAT, GENERIC_MARKET, SYMBOL_COLORS } from "./_chart-data";

const LAST = ENTRIES.length - 1;
const AUTOPLAY_MS = 3200;

type PopPos = { left: number; top: number; dir: "up" | "down"; arrow: number };

export function NetWorthChart() {
  const [cur, setCur] = useState(LAST);
  const [touched, setTouched] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [popIndex, setPopIndex] = useState<number | null>(null);
  const [popPos, setPopPos] = useState<PopPos | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Honour prefers-reduced-motion: no autoplay (and the CSS stills the rest).
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);

  // Cycle through the entries until the visitor takes control.
  useEffect(() => {
    if (touched || reduced) return;
    const id = setInterval(() => setCur((c) => (c + 1) % ENTRIES.length), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [touched, reduced]);

  // Position the marker popover relative to the chart, flipping above/below.
  const reposition = useCallback(() => {
    if (popIndex == null) return;
    const chart = chartRef.current;
    const pop = popRef.current;
    if (!chart || !pop) return;
    const W = chart.clientWidth;
    const H = chart.clientHeight;
    const m = MARKERS[popIndex];
    const px = (m.cx / 520) * W;
    const py = (m.cy / 200) * H;
    const bw = pop.offsetWidth;
    const bh = pop.offsetHeight;
    const left = Math.max(4, Math.min(px - bw / 2, W - bw - 4));
    let top: number;
    let dir: "up" | "down";
    if (py - bh - 12 >= 0) {
      top = py - bh - 12;
      dir = "down";
    } else {
      top = py + 14;
      dir = "up";
    }
    const arrow = Math.max(8, Math.min(px - left, bw - 18));
    setPopPos({ left, top, dir, arrow });
  }, [popIndex]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  useEffect(() => {
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reposition]);

  // Any click outside a marker/stepper dismisses the popover.
  useEffect(() => {
    const close = () => setPopIndex(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  function selectEntry(i: number) {
    setTouched(true);
    setCur(i);
    setPopIndex(i);
  }

  function step(delta: number) {
    setTouched(true);
    setCur((c) => (c + delta + ENTRIES.length) % ENTRIES.length);
    setPopIndex(null);
  }

  const e = ENTRIES[cur];
  const isUser = e.tag === "user";
  const chat = isUser
    ? { say: e.say!, read: e.read!, readsrc: e.readsrc!, wrote: e.wrote!, sym: e.sym! }
    : GENERIC_CHAT;
  const market = !isUser
    ? {
        trig: e.trig!,
        trigsrc: e.trigsrc ?? null,
        detect: e.detect!,
        logged: e.logged!,
        head: e.mkthead ?? "From market to journal",
      }
    : GENERIC_MARKET;
  const tagLabel = isUser
    ? "Decision"
    : e.kind === "milestone"
      ? "Automatic · Milestone"
      : "Automatic · Market move";
  const sel = MARKERS[cur];
  const chipColor = SYMBOL_COLORS[chat.sym] ?? "#117A52";
  const pop = popIndex != null ? ENTRIES[popIndex] : null;

  return (
    <div className="mech-grid">
      {/* ── Net-worth chart ── */}
      <div className="card chart-card fu" style={{ animationDelay: ".5s" }}>
        <div className="st-head">
          <div>
            <div className="st-l">
              Net worth · as of <span className="as-of">{e.date}</span>
            </div>
            <div className="st-nw disp">{e.nw}</div>
          </div>
          <span className="st-badge">▲ +71% since 2021</span>
        </div>

        <div className="st-chart" ref={chartRef}>
          <svg viewBox="0 0 520 200">
            <g className="stack">
              {CHART_AREAS.map((a) => (
                <path key={a.fill} d={a.d} fill={a.fill} />
              ))}
              <path className="line" d={CHART_LINE} />
            </g>
            <line className="guide" x1={sel.cx} y1={sel.cy} x2={sel.cx} y2={196} />
            {MARKERS.map((m, i) => (
              <g key={i}>
                <circle
                  className="hit"
                  cx={m.cx}
                  cy={m.cy}
                  r={13}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`Entry ${i + 1}: ${ENTRIES[i].title}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    selectEntry(i);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      selectEntry(i);
                    }
                  }}
                />
                <circle className={`mk${cur === i ? " on" : ""}`} cx={m.cx} cy={m.cy} r={4} />
              </g>
            ))}
          </svg>

          <div
            ref={popRef}
            className={`gpop${popIndex != null ? " show" : ""}${popPos ? ` ${popPos.dir}` : ""}`}
            style={popPos ? { left: popPos.left, top: popPos.top } : undefined}
          >
            <span className="gpop-arr" style={popPos ? { left: popPos.arrow } : undefined} />
            <div className="gpop-d">{pop?.date ?? ""}</div>
            <div className="gpop-t disp">{pop?.title ?? ""}</div>
            <div className={`gpop-v${pop?.impc === "dn" ? " dn" : ""}`}>{pop?.imp ?? ""}</div>
          </div>
        </div>

        <div className="st-axis">
          <span>2021</span>
          <span>2022</span>
          <span>2023</span>
          <span>2024</span>
          <span>2025</span>
          <span>now</span>
        </div>

        <div className="st-legend">
          <span className="lg">
            <span className="sw" style={{ background: "#3F7CA8" }} />
            Property
          </span>
          <span className="lg">
            <span className="sw" style={{ background: "#A89968" }} />
            Reserves
          </span>
          <span className="lg">
            <span className="sw" style={{ background: "#E0922A" }} />
            Crypto
          </span>
          <span className="lg">
            <span className="sw" style={{ background: "#117A52" }} />
            Public markets
          </span>
        </div>

        <div className="st-step">
          <button
            className="stp"
            type="button"
            aria-label="Previous entry"
            onClick={(ev) => {
              ev.stopPropagation();
              step(-1);
            }}
          >
            ‹
          </button>
          <div className="stp-mid">
            <span className="stp-lbl">Replay</span>
            <span className="stp-pos">
              <b className="stp-i">{cur + 1}</b> / {ENTRIES.length}
            </span>
            <span className="stp-date">{e.date}</span>
          </div>
          <button
            className="stp"
            type="button"
            aria-label="Next entry"
            onClick={(ev) => {
              ev.stopPropagation();
              step(1);
            }}
          >
            ›
          </button>
        </div>

        <div className="cc-read">
          <div className="cr-head">
            <span className="cr-date">{e.date}</span>
            <span className={`cr-tag ${isUser ? "user" : "auto"}`}>{tagLabel}</span>
          </div>
          <div className="cr-title disp">{e.title}</div>
          <div className="cr-ctx">{e.ctx}</div>
          <div className="cr-text">{e.why}</div>
          <div className={`cr-imp${e.impc === "dn" ? " dn" : ""}`}>{e.imp}</div>
          <a className="cr-ask" href="#whatif">
            <svg className="ic">
              <use href="#i-msg" />
            </svg>
            <span className="cr-ask-t">{e.ask}</span>
          </a>
        </div>
      </div>

      {/* ── Two ways an entry gets written ── */}
      <div className="pipe-col">
        <div
          className={`card pipe-card pipe-chat fu${isUser ? "" : " dim"}`}
          style={{ animationDelay: ".58s" }}
        >
          <div className="pc-h">
            <svg className="ic">
              <use href="#i-msg" />
            </svg>
            From chat to journal
          </div>
          <div className="pwrap">
            <div className="pstep">
              <div className="pnum">
                <svg className="ic">
                  <use href="#i-msg" />
                </svg>
              </div>
              <div className="pbody">
                <div className="plbl">You say</div>
                <div className="pcard you">
                  <div className="txt">{chat.say}</div>
                </div>
              </div>
            </div>
            <div className="pstep">
              <div className="pnum">
                <svg className="ic">
                  <use href="#i-scan" />
                </svg>
              </div>
              <div className="pbody">
                <div className="plbl">It reads your portfolio + that day</div>
                <div className="pcard">
                  <div className="txt">
                    <span>{chat.read}</span>
                    {chat.readsrc ? <span className="src">{chat.readsrc}</span> : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="pstep final">
              <div className="pnum">
                <svg className="ic">
                  <use href="#i-check" />
                </svg>
              </div>
              <div className="pbody">
                <div className="plbl">Writes the entry</div>
                <div className="pc-mini">
                  <span className="pe-chip" style={{ background: chipColor }}>
                    {chat.sym || "·"}
                  </span>
                  <span>{chat.wrote}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`card pipe-card pipe-mkt fu${!isUser ? "" : " dim"}`}
          style={{ animationDelay: ".66s" }}
        >
          <div className="pc-h">
            <svg className="ic">
              <use href="#i-radar" />
            </svg>
            <span className="pc-h-mkt">{market.head}</span>
            <span className="auto">automatic</span>
          </div>
          <div className="pwrap">
            <div className="pstep">
              <div className="pnum">
                <svg className="ic">
                  <use href="#i-news" />
                </svg>
              </div>
              <div className="pbody">
                <div className="plbl">The market moves</div>
                <div className="pcard">
                  <div className="txt">
                    <span>{market.trig}</span>
                    {market.trigsrc ? <span className="src">{market.trigsrc}</span> : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="pstep">
              <div className="pnum">
                <svg className="ic">
                  <use href="#i-scan" />
                </svg>
              </div>
              <div className="pbody">
                <div className="plbl">It sees the hit to your holdings</div>
                <div className="pcard">
                  <div className="txt">{market.detect}</div>
                </div>
              </div>
            </div>
            <div className="pstep final">
              <div className="pnum">
                <svg className="ic">
                  <use href="#i-spark" />
                </svg>
              </div>
              <div className="pbody">
                <div className="plbl">Logs it for you</div>
                <div className="pc-mini auto-mini">{market.logged}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
