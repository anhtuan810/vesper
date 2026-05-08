"use client";

import { useMemo } from "react";
import { projectMortgage, formatTimeRemaining, formatPayoffDate } from "@/lib/mortgage";
import { fmtAmount } from "@/lib/utils";
import { InlineEdit } from "@/components/asset-detail/InlineEdit";
import type { RealEstateAsset } from "@/lib/supabase";

const TYPE_SELECT_STYLE: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  background: "var(--surface-elev)",
  backgroundColor: "var(--surface-elev)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  padding: "4px 24px 4px 8px",
  fontSize: 14,
  fontFamily: "var(--mono)",
  fontWeight: 500,
  color: "var(--text)",
  cursor: "pointer",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2354545E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 6px center",
  outline: "none",
  minHeight: 32,
  width: "100%",
};

interface Props {
  asset: RealEstateAsset;
  onUpdate?: (field: string, value: unknown) => Promise<string | null>;
}

function buildPayoffPath(
  curve: { date: Date; balance: number }[],
  todayIdx: number,
  W: number,
  H: number,
): { line: string; area: string; todayX: number; todayY: number } {
  if (curve.length < 2) return { line: "", area: "", todayX: 0, todayY: 0 };

  const pad = 4;
  const maxBalance = curve[0].balance;
  const toX = (i: number) => (i / (curve.length - 1)) * W;
  const toY = (b: number) => H - pad - (b / maxBalance) * (H - pad * 2);

  const pts = curve.map((p, i) => ({ x: toX(i), y: toY(p.balance) }));

  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(1);
    const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(1);
    line += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx} ${my}`;
  }
  line += ` L ${pts[pts.length - 1].x.toFixed(1)} ${(H).toFixed(1)}`;

  const area = line + ` L 0 ${H} Z`;
  let strokeLine = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(1);
    const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(1);
    strokeLine += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx} ${my}`;
  }
  strokeLine += ` L ${pts[pts.length - 1].x.toFixed(1)} ${(H).toFixed(1)}`;

  const ti = Math.min(todayIdx, pts.length - 1);
  return { line: strokeLine, area, todayX: pts[ti].x, todayY: pts[ti].y };
}

export function MortgageBlock({ asset, onUpdate }: Props) {
  const {
    mortgage_balance: balance,
    mortgage_rate: rate,
    monthly_payment: payment,
    mortgage_type: type,
    mortgage_start_date: startStr,
    mortgage_end_date: endStr,
    currency,
  } = asset;

  const hasMortgage = balance != null && balance > 0;
  const hasProjection = hasMortgage && rate != null && payment != null && type != null && startStr != null;

  const projection = useMemo(() => {
    if (!hasProjection) return null;
    return projectMortgage(
      balance!,
      rate!,
      payment!,
      type!,
      new Date(startStr!),
      new Date(),
      endStr ? new Date(endStr) : undefined,
    );
  }, [hasProjection, balance, rate, payment, type, startStr, endStr]);

  const { curve, todayIdx } = useMemo(() => {
    if (!projection) return { curve: [] as { date: Date; balance: number }[], todayIdx: 0 };
    const c = projection.balanceCurve;
    const today = new Date();
    let idx = 0;
    let minDiff = Infinity;
    c.forEach((p, i) => {
      const diff = Math.abs(p.date.getTime() - today.getTime());
      if (diff < minDiff) { minDiff = diff; idx = i; }
    });
    return { curve: c, todayIdx: idx };
  }, [projection]);

  if (!hasMortgage) return null;

  const W = 280;
  const H = 70;
  const gradId = `payoff_${asset.id}`;
  const startDate = startStr ? new Date(startStr) : null;
  const { line, area, todayX, todayY } = buildPayoffPath(curve, todayIdx, W, H);
  const startYear = startDate ? startDate.getFullYear().toString() : "";
  const endYear = projection?.payoffDate ? projection.payoffDate.getFullYear().toString() : "";

  const typeLabel = type === "annuity" ? "Annuity"
    : type === "linear" ? "Linear"
    : type === "interest_only" ? "Interest only"
    : type ?? "—";

  const CELL = { padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 };
  const LABEL_STYLE = { fontSize: 9, letterSpacing: "0.16em" as const, marginBottom: 8 };

  return (
    <>
      {/* 2×2 stat grid */}
      <div className="grid grid-cols-2 gap-2 px-4">

        {/* Balance */}
        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Balance</div>
          {onUpdate ? (
            <InlineEdit
              display={<span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{balance != null ? fmtAmount(balance, currency) : "—"}</span>}
              rawValue={balance != null ? String(balance) : ""}
              placeholder="e.g. 250000"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 14, fontWeight: 500 }}
              onSave={async (raw) => {
                if (raw.trim() === "") return "";
                const n = parseFloat(raw);
                if (isNaN(n) || n < 0) return "Must be a non-negative number";
                return onUpdate("mortgage_balance", n);
              }}
            />
          ) : (
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {balance != null ? fmtAmount(balance, currency) : "—"}
            </div>
          )}
        </div>

        {/* Rate */}
        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Rate</div>
          {onUpdate ? (
            <InlineEdit
              display={<span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{rate != null ? `${rate.toFixed(2)}%` : "—"}</span>}
              rawValue={rate != null ? String(rate) : ""}
              placeholder="e.g. 3.5"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 14, fontWeight: 500 }}
              onSave={async (raw) => {
                if (raw.trim() === "") return "";
                const n = parseFloat(raw);
                if (isNaN(n) || n < 0) return "Must be a non-negative number";
                return onUpdate("mortgage_rate", n);
              }}
            />
          ) : (
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {rate != null ? `${rate.toFixed(2)}%` : "—"}
            </div>
          )}
        </div>

        {/* Monthly payment */}
        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Monthly</div>
          {onUpdate ? (
            <InlineEdit
              display={<span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{payment != null ? fmtAmount(payment, currency) : "—"}</span>}
              rawValue={payment != null ? String(payment) : ""}
              placeholder="e.g. 1200"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 14, fontWeight: 500 }}
              onSave={async (raw) => {
                if (raw.trim() === "") return "";
                const n = parseFloat(raw);
                if (isNaN(n) || n < 0) return "Must be a non-negative number";
                return onUpdate("monthly_payment", n);
              }}
            />
          ) : (
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {payment != null ? fmtAmount(payment, currency) : "—"}
            </div>
          )}
        </div>

        {/* Type */}
        <div style={CELL}>
          <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Type</div>
          {onUpdate ? (
            <select
              value={type ?? ""}
              onChange={(e) => onUpdate("mortgage_type", e.target.value || null)}
              style={TYPE_SELECT_STYLE}
            >
              <option value="">—</option>
              <option value="annuity">Annuity</option>
              <option value="linear">Linear</option>
              <option value="interest_only">Interest only</option>
            </select>
          ) : (
            <div className="font-serif" style={{ fontSize: 16, fontWeight: 400, color: "var(--text)" }}>{typeLabel}</div>
          )}
        </div>
      </div>

      {/* Date fields — only shown in edit mode */}
      {onUpdate && (
        <div className="grid grid-cols-2 gap-2 px-4" style={{ marginTop: 8 }}>
          <div style={CELL}>
            <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>Start date</div>
            <InlineEdit
              display={<span className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{startStr ?? "—"}</span>}
              rawValue={startStr ?? ""}
              placeholder="YYYY-MM-DD"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 13, fontWeight: 500 }}
              onSave={async (raw) => {
                const t = raw.trim();
                if (t === "") return onUpdate("mortgage_start_date", null);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "Use YYYY-MM-DD";
                return onUpdate("mortgage_start_date", t);
              }}
            />
          </div>
          <div style={CELL}>
            <div className="font-mono uppercase text-faint" style={LABEL_STYLE}>End date</div>
            <InlineEdit
              display={<span className="font-mono" style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{endStr ?? "—"}</span>}
              rawValue={endStr ?? ""}
              placeholder="YYYY-MM-DD"
              affordance
              displayStyle={{ minHeight: 32, width: "100%" }}
              inputStyle={{ fontSize: 13, fontWeight: 500 }}
              onSave={async (raw) => {
                const t = raw.trim();
                if (t === "") return onUpdate("mortgage_end_date", null);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "Use YYYY-MM-DD";
                return onUpdate("mortgage_end_date", t);
              }}
            />
          </div>
        </div>
      )}

      {/* Payoff chart */}
      {projection && curve.length >= 2 && (
        <div
          style={{
            margin: "16px 16px 0",
            padding: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div className="font-mono uppercase text-faint" style={{ fontSize: 9, letterSpacing: "0.16em" }}>
              Payoff projection
            </div>
            {projection.payoffDate && (
              <div className="font-mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.04em" }}>
                ~ {formatPayoffDate(projection.payoffDate).toUpperCase()}
              </div>
            )}
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block", margin: "6px 0" }}>
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#D4A574" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#D4A574" stopOpacity={0} />
              </linearGradient>
            </defs>
            <line x1={0} y1={H * 0.3} x2={W} y2={H * 0.3} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 3" />
            <line x1={0} y1={H * 0.65} x2={W} y2={H * 0.65} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 3" />
            <path d={area} fill={`url(#${gradId})`} />
            <path d={line} fill="none" stroke="#D4A574" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            {todayX > 0 && (
              <>
                <line x1={todayX} y1={0} x2={todayX} y2={H} stroke="rgba(212,165,116,0.3)" strokeDasharray="2 2" strokeWidth={0.8} />
                <circle cx={todayX} cy={todayY} r={6} fill="#D4A574" opacity={0.25} />
                <circle cx={todayX} cy={todayY} r={3} fill="#D4A574" />
                <text x={todayX} y={8} fontFamily="var(--mono)" fontSize={7} fill="#D4A574" textAnchor="middle" letterSpacing={0.5}>TODAY</text>
              </>
            )}
            <circle cx={W} cy={H} r={2.5} fill="var(--text-faint)" />
            {startYear && <text x={2} y={H - 2} fontFamily="var(--mono)" fontSize={7} fill="var(--text-faint)" letterSpacing={0.5}>{startYear}</text>}
            {endYear && <text x={W - 2} y={H - 2} fontFamily="var(--mono)" fontSize={7} fill="var(--text-faint)" textAnchor="end" letterSpacing={0.5}>{endYear}</text>}
          </svg>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 18px", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            {[
              { label: "Paid to date", value: fmtAmount(projection.principalPaid, currency) },
              { label: "Interest paid", value: fmtAmount(projection.totalInterestPaid, currency) },
              { label: "Time remaining", value: formatTimeRemaining(projection.remainingMonths) },
              { label: "Mortgage-free", value: formatPayoffDate(projection.payoffDate), accent: projection.payoffDate != null },
            ].map(({ label, value, accent }) => (
              <div key={label}>
                <div className="font-mono uppercase text-faint" style={{ fontSize: 9, letterSpacing: "0.14em", marginBottom: 4 }}>{label}</div>
                <div className="font-mono" style={{ fontSize: 12, color: accent ? "var(--accent)" : "var(--text)" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
