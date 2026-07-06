import type { ReactNode, CSSProperties } from "react";
import type { Mutation } from "@/lib/supabase";
import { formatMoney, formatMoneyCompact, toDisplay, toUsdClient, type DisplayCurrency } from "@/lib/money";

export const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);
export const STARTING_POSITION_CTX = "Starting position — no purchase history captured";

export type DiaryItem =
  | { kind: "singleton"; mutation: Mutation }
  | { kind: "group"; id: string; anchor: Mutation; members: Mutation[]; groupName: string };

export type PeriodKey = "all" | "week" | "month" | "3months" | "year" | "custom";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "week", label: "1W" },
  { key: "month", label: "1M" },
  { key: "3months", label: "3M" },
  { key: "year", label: "1Y" },
  { key: "custom", label: "Custom" },
];

export const SELECT_STYLE: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  background: "var(--surface)",
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "5px 24px 5px 10px",
  fontSize: "var(--fs-body)",
  fontFamily: "var(--font-ui)",
  color: "var(--text-dim)",
  cursor: "pointer",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2354545E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  outline: "none",
};

export function unitNoun(assetType: string | null): string {
  if (assetType === "crypto") return "units";
  if (assetType === "gold") return "oz";
  return "shares";
}

export function hasContent(m: Mutation): boolean {
  return m.before_value != null || m.after_value != null || !!m.personal_context;
}

export function relativeAge(past: Date, now: Date): string {
  const months = (now.getFullYear() - past.getFullYear()) * 12 + (now.getMonth() - past.getMonth());
  const years = Math.floor(months / 12);
  if (years >= 1) return years === 1 ? "1 year ago" : `${years} years ago`;
  if (months <= 1) return "1 month ago";
  return `${months} months ago`;
}

export function displayName(m: Mutation): string {
  return m.asset?.name ?? m.asset_name ?? "";
}

export function actionVerb(action: string): string {
  if (action === "add") return "added";
  if (action === "remove") return "removed";
  return "edited";
}

export function abbrevMoney(usdValue: number, displayCurrency: DisplayCurrency): string {
  // Convert BEFORE deciding to abbreviate — the old path compacted the raw USD
  // number and pinned the display symbol on it. ≥1M in display currency reads
  // "€1,2M" (the one app-wide compact scheme); below that, the full figure.
  const display = toDisplay(usdValue, "USD", displayCurrency) ?? usdValue;
  if (Math.abs(display) >= 1_000_000) return formatMoneyCompact(usdValue, "USD", displayCurrency);
  return formatMoney(usdValue, "USD", displayCurrency);
}

function commonNamePrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i).replace(/[\s\-–—,.:;]+$/, "").trim();
}

function assetTypeLabel(assetType: string | null): string {
  const map: Record<string, string> = {
    stocks: "stock", etf: "ETF", crypto: "crypto", gold: "gold",
    cash: "cash", real_estate: "property", business: "business",
  };
  return (assetType && map[assetType]) || "";
}

export function buildDisplayItems(mutations: Mutation[], disableGrouping: boolean): DiaryItem[] {
  if (disableGrouping || mutations.length === 0) {
    return mutations.map((m) => ({ kind: "singleton" as const, mutation: m }));
  }

  const items: DiaryItem[] = [];
  let runGroup: Mutation[] = [];
  let runPrefix = "";

  function closeGroup() {
    if (runGroup.length === 0) return;
    if (runGroup.length < 3) {
      for (const m of runGroup) items.push({ kind: "singleton", mutation: m });
    } else {
      const anchor = runGroup[0];
      let groupName: string;
      if (anchor.asset_id) {
        groupName = displayName(anchor);
      } else {
        const typeLabel = assetTypeLabel(anchor.asset_type);
        groupName = runPrefix.length >= 3
          ? [runPrefix, typeLabel, "entries"].filter(Boolean).join(" ")
          : displayName(anchor);
      }
      items.push({ kind: "group", id: `group-${anchor.id}`, anchor, members: [...runGroup], groupName });
    }
    runGroup = [];
    runPrefix = "";
  }

  for (const m of mutations) {
    const day = (m.occurred_at || m.recorded_at).slice(0, 10);

    if (runGroup.length === 0) {
      runGroup = [m];
      runPrefix = m.asset_id ? "" : displayName(m);
      continue;
    }

    const anchor = runGroup[0];
    const anchorDay = (anchor.occurred_at || anchor.recorded_at).slice(0, 10);

    if (m.action !== anchor.action || day !== anchorDay) {
      closeGroup();
      runGroup = [m];
      runPrefix = m.asset_id ? "" : displayName(m);
      continue;
    }

    if (anchor.asset_id !== null && m.asset_id !== null) {
      if (anchor.asset_id === m.asset_id) {
        runGroup.push(m);
      } else {
        closeGroup();
        runGroup = [m];
        runPrefix = "";
      }
    } else if (anchor.asset_id === null && m.asset_id === null) {
      const newPrefix = commonNamePrefix(runPrefix || displayName(anchor), displayName(m));
      if (newPrefix.length >= 3) {
        runPrefix = newPrefix;
        runGroup.push(m);
      } else {
        closeGroup();
        runGroup = [m];
        runPrefix = displayName(m);
      }
    } else {
      closeGroup();
      runGroup = [m];
      runPrefix = m.asset_id ? "" : displayName(m);
    }
  }

  closeGroup();
  return items;
}

export function getMonthOptions(mutations: Mutation[]) {
  const dates = mutations
    .map((m) => m.occurred_at || m.recorded_at)
    .filter(Boolean)
    .map((d) => new Date(d!));

  const earliest = dates.length > 0
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : new Date();

  const options: { label: string; value: string }[] = [];
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  const stop = new Date(earliest.getFullYear(), earliest.getMonth(), 1);

  while (d >= stop) {
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    });
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }

  return options;
}

export function isInPeriod(m: Mutation, period: PeriodKey, customFrom: string, customTo: string): boolean {
  if (period === "all") return true;
  const dateStr = m.occurred_at || m.recorded_at;
  if (!dateStr) return true;
  // Parse the stored calendar date in LOCAL time. `new Date("2026-07-01")` is UTC
  // midnight, so the local getters below read it as June 30 for anyone west of
  // UTC — dropping a July-1 entry from the "month"/"year" filters even though its
  // own date chip says "1 Jul". Building from Y/M/D pins it to the intended day.
  const [py, pm, pd] = dateStr.split("T")[0].split("-").map(Number);
  const date = new Date(py, (pm || 1) - 1, pd || 1);
  const now = new Date();
  const monthStart = (ym: string) => {
    const [y, mo] = ym.split("-").map(Number);
    return new Date(y, (mo || 1) - 1, 1);
  };

  switch (period) {
    case "week": return date >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case "month": return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    case "3months": return date >= new Date(now.getFullYear(), now.getMonth() - 3, 1);
    case "year": return date.getFullYear() === now.getFullYear();
    case "custom": {
      let from = customFrom, to = customTo;
      if (from && to && from > to) [from, to] = [to, from];
      if (from && date < monthStart(from)) return false;
      if (to) {
        const toDate = monthStart(to);
        toDate.setMonth(toDate.getMonth() + 1);
        if (date >= toDate) return false;
      }
      return true;
    }
  }
}

export function getPeriodLabel(period: PeriodKey, customFrom: string, customTo: string): string {
  const now = new Date();
  const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", opts);
  switch (period) {
    case "week": return "last 7 days";
    case "month": return fmtDate(now, { month: "long", year: "numeric" });
    case "3months": {
      const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return `${fmtDate(from, { month: "short" })} – ${fmtDate(now, { month: "short", year: "numeric" })}`;
    }
    case "year": return String(now.getFullYear());
    case "custom": {
      let from = customFrom, to = customTo;
      if (from && to && from > to) [from, to] = [to, from];
      const f = from ? fmtDate(new Date(from + "-01"), { month: "short", year: "numeric" }) : "";
      const t = to ? fmtDate(new Date(to + "-01"), { month: "short", year: "numeric" }) : "";
      return f === t ? f : `${f} – ${t}`;
    }
    default: return "";
  }
}

export function buildGroupAggregate(members: Mutation[], displayCurrency: DisplayCurrency): ReactNode {
  const action = members[0].action;
  if (action === "remove") {
    const total = members.reduce((s, m) => s + toUsdClient(m.before_value ?? 0, m.currency || "USD"), 0);
    if (total === 0) return null;
    return (
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--negative-text)" }}>
        −{abbrevMoney(total, displayCurrency)}
      </span>
    );
  }
  if (action === "add") {
    const total = members.reduce((s, m) => s + toUsdClient(m.after_value ?? 0, m.currency || "USD"), 0);
    if (total === 0) return null;
    return (
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--positive-text)" }}>
        +{abbrevMoney(total, displayCurrency)}
      </span>
    );
  }
  const netDelta = members.reduce((s, m) => {
    if (m.before_value == null || m.after_value == null) return s;
    const cur = m.currency || "USD";
    return s + toUsdClient(m.after_value - m.before_value, cur);
  }, 0);
  if (netDelta === 0) return null;
  return (
    <span style={{ fontSize: 13, fontWeight: 500, color: netDelta >= 0 ? "var(--positive-text)" : "var(--negative-text)" }}>
      {netDelta >= 0 ? "+" : "−"}{abbrevMoney(Math.abs(netDelta), displayCurrency)}
    </span>
  );
}
