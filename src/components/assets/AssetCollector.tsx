"use client";

import { useState } from "react";
import type { PortfolioChange } from "@/lib/apply-changes";
import type { DisplayCurrency } from "@/lib/money";

// Reusable, scripted per-asset collector: pick type -> collect that type's fields
// one at a time -> editable confirm card -> emit a confirmed PortfolioChange for the
// parent to persist (via POST /api/assets/create). Deliberately NOT clever: a fixed
// script, no intent classification. If a reply doesn't parse for the current field
// it just asks again. Mounted in BOTH the onboarding flow and, later, in-app.

export type CollectorAssetType = "real_estate" | "brokerage" | "cash" | "crypto";

const TYPE_META: Record<CollectorAssetType, { label: string; emoji: string; dbType: string }> = {
  real_estate: { label: "Property", emoji: "🏠", dbType: "real_estate" },
  brokerage: { label: "Stocks / funds", emoji: "📈", dbType: "stocks" },
  cash: { label: "Cash / savings", emoji: "💶", dbType: "cash" },
  crypto: { label: "Crypto", emoji: "🪙", dbType: "crypto" },
};

const CURRENCIES: DisplayCurrency[] = ["EUR", "USD", "GBP"];

type FieldKind = "text" | "number" | "money" | "currency" | "choice" | "yesno" | "date";

interface FieldSpec {
  key: string;
  prompt: string;
  kind: FieldKind;
  optional?: boolean;
  placeholder?: string;
  choices?: { value: string; label: string }[];
  // Only ask this field when the predicate over the draft-so-far holds.
  when?: (draft: Draft) => boolean;
  suffix?: string; // e.g. "%"
}

type Draft = Record<string, string | number | boolean | undefined>;

// ── Per-type scripts ──────────────────────────────────────────────────────────
function fieldsFor(type: CollectorAssetType): FieldSpec[] {
  switch (type) {
    case "real_estate":
      return [
        { key: "name", prompt: "What should I call this property?", kind: "text", placeholder: "e.g. Home" },
        { key: "value", prompt: "What's it worth today? A rough current value is fine.", kind: "number", placeholder: "e.g. 450000" },
        { key: "currency", prompt: "Which currency?", kind: "currency" },
        { key: "buy_date", prompt: "When did you buy it? This helps rebuild your net-worth history (optional).", kind: "date", optional: true, placeholder: "e.g. 2019, or March 2019" },
        { key: "buy_price", prompt: "What did you pay for it?", kind: "number", optional: true, placeholder: "purchase price", when: (d) => !!d.buy_date },
        { key: "has_mortgage", prompt: "Is there a mortgage on it?", kind: "yesno" },
        { key: "mortgage_balance", prompt: "What's the outstanding balance?", kind: "number", when: (d) => d.has_mortgage === true },
        { key: "mortgage_rate", prompt: "What's the interest rate? (If it's interest-free, enter 0.)", kind: "number", suffix: "%", when: (d) => d.has_mortgage === true },
        { key: "monthly_payment", prompt: "What's the monthly payment?", kind: "number", when: (d) => d.has_mortgage === true },
        {
          key: "mortgage_type",
          prompt: "What kind of mortgage is it?",
          kind: "choice",
          choices: [
            { value: "annuity", label: "Annuity" },
            { value: "linear", label: "Linear" },
            { value: "interest_only", label: "Interest-only" },
          ],
          when: (d) => d.has_mortgage === true,
        },
      ];
    case "brokerage":
      return [
        { key: "symbol", prompt: "Which holding? Give a ticker or name.", kind: "text", placeholder: "e.g. VOO, AAPL, VWCE" },
        {
          key: "amount_mode",
          prompt: "How do you want to enter it?",
          kind: "choice",
          choices: [
            { value: "units", label: "Number of shares" },
            { value: "value", label: "Total value" },
          ],
        },
        { key: "units", prompt: "How many shares/units do you hold?", kind: "number", placeholder: "e.g. 12", when: (d) => d.amount_mode === "units" },
        { key: "value", prompt: "What's the total value?", kind: "number", placeholder: "e.g. 10000", when: (d) => d.amount_mode === "value" },
        { key: "currency", prompt: "Which currency is that amount in?", kind: "currency", when: (d) => d.amount_mode === "value" },
        { key: "buy_date", prompt: "When did you start holding it? Helps build your history (optional).", kind: "date", optional: true, placeholder: "e.g. 2021, or Q2 2021" },
        { key: "buy_price", prompt: "What price did you pay per share? (optional)", kind: "number", optional: true, placeholder: "cost per share", when: (d) => !!d.buy_date },
      ];
    case "cash":
      return [
        { key: "name", prompt: "What's this account?", kind: "text", placeholder: "e.g. Savings" },
        { key: "value", prompt: "What's the current balance?", kind: "number", placeholder: "e.g. 15000" },
        { key: "currency", prompt: "Which currency?", kind: "currency" },
      ];
    case "crypto":
      return [
        { key: "symbol", prompt: "Which coin?", kind: "text", placeholder: "e.g. BTC, ETH" },
        { key: "units", prompt: "How much do you hold?", kind: "number", placeholder: "amount of coin" },
        { key: "buy_date", prompt: "When did you acquire it? Helps build your history (optional).", kind: "date", optional: true, placeholder: "e.g. 2020" },
        { key: "buy_price", prompt: "What price did you pay per coin? (optional)", kind: "number", optional: true, placeholder: "cost per coin", when: (d) => !!d.buy_date },
      ];
    default:
      return [];
  }
}

// Turn the collected draft into the PortfolioChange the write path expects.
function draftToChange(type: CollectorAssetType, draft: Draft, cur: DisplayCurrency): PortfolioChange {
  const meta = TYPE_META[type];
  const num = (k: string): number | undefined =>
    typeof draft[k] === "number" ? (draft[k] as number) : undefined;
  const str = (k: string): string | undefined =>
    typeof draft[k] === "string" && (draft[k] as string).trim() ? (draft[k] as string).trim() : undefined;

  const base: PortfolioChange = { action: "add", name: "", type: meta.dbType };

  if (type === "real_estate") {
    base.name = str("name") ?? "Property";
    base.value = num("value");
    base.currency = str("currency") ?? cur;
    base.buy_date = str("buy_date");
    base.buy_price = num("buy_price");
    // Explicit mortgage decision — 0 means owned outright (what the gate requires).
    base.mortgage_balance = draft.has_mortgage === true ? num("mortgage_balance") ?? 0 : 0;
    if (draft.has_mortgage === true) {
      base.mortgage_rate = num("mortgage_rate");
      base.monthly_payment = num("monthly_payment");
      base.mortgage_type = str("mortgage_type");
    }
  } else if (type === "brokerage") {
    base.name = str("symbol") ?? "Holding";
    base.symbol = str("symbol");
    if (draft.amount_mode === "units") {
      base.units = num("units");
    } else {
      base.value = num("value");
      base.currency = str("currency") ?? cur;
    }
    base.buy_date = str("buy_date");
    base.buy_price = num("buy_price");
  } else if (type === "cash") {
    base.name = str("name") ?? "Cash";
    base.value = num("value");
    base.currency = str("currency") ?? cur;
  } else if (type === "crypto") {
    base.name = str("symbol") ?? "Crypto";
    base.symbol = str("symbol");
    base.units = num("units");
    base.buy_date = str("buy_date");
    base.buy_price = num("buy_price");
  }
  return base;
}

// Human-readable one-line summary for the running list / confirm card header.
export function summarizeChange(c: PortfolioChange, cur: string): string {
  const money = (v?: number, ccy?: string) =>
    typeof v === "number" ? `${(ccy ?? cur)} ${Math.round(v).toLocaleString()}` : "";
  if (c.type === "real_estate") {
    const mort = c.mortgage_balance && c.mortgage_balance > 0 ? ` · mortgage ${money(c.mortgage_balance, c.currency)}` : " · owned outright";
    return `${c.name} — ${money(c.value, c.currency)}${mort}`;
  }
  if (c.type === "cash") return `${c.name} — ${money(c.value, c.currency)}`;
  if (c.type === "crypto") return `${c.symbol ?? c.name}${typeof c.units === "number" ? ` — ${c.units}` : ""}`;
  // brokerage
  const qty = typeof c.units === "number" ? `${c.units} units` : money(c.value, c.currency);
  return `${c.symbol ?? c.name}${qty ? ` — ${qty}` : ""}`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export interface AssetCollectorProps {
  displayCurrency: DisplayCurrency;
  /** Persist the confirmed change(s). Return ok:false + error to keep the card open. */
  onConfirm: (changes: PortfolioChange[]) => Promise<{ ok: boolean; error?: string }>;
  /** Optional: notified when the user abandons an in-progress asset (nothing saved). */
  onCancel?: () => void;
  /** Fine-grained progress events for drop-off instrumentation. */
  onStep?: (event: string, props?: Record<string, string | number>) => void;
}

type Phase =
  | { name: "pickType" }
  | { name: "collect"; type: CollectorAssetType; index: number }
  | { name: "confirm"; type: CollectorAssetType };

export function AssetCollector({ displayCurrency, onConfirm, onCancel, onStep }: AssetCollectorProps) {
  const [phase, setPhase] = useState<Phase>({ name: "pickType" });
  const [draft, setDraft] = useState<Draft>({});
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickType(type: CollectorAssetType) {
    onStep?.("type_chosen", { asset_type: type });
    setDraft({});
    setError(null);
    setInput("");
    setPhase({ name: "collect", type, index: 0 });
  }

  // Abandon the in-progress asset (nothing was persisted — an asset is written only
  // on confirm) and return to the type picker so the user can start over.
  function cancelAsset() {
    if (phase.name !== "pickType") {
      onStep?.("cancelled", { asset_type: phase.type });
    }
    setDraft({});
    setInput("");
    setError(null);
    setPhase({ name: "pickType" });
    onCancel?.();
  }

  // Advance from field `index` to the next applicable field, or to the confirm card.
  function advance(type: CollectorAssetType, fromIndex: number, nextDraft: Draft) {
    const all = fieldsFor(type);
    let i = fromIndex + 1;
    while (i < all.length && all[i].when && !all[i].when!(nextDraft)) i++;
    setInput("");
    if (i >= all.length) {
      onStep?.("reached_confirm", { asset_type: type });
      setPhase({ name: "confirm", type });
    } else {
      onStep?.("field_reached", { asset_type: type, field: all[i].key });
      setPhase({ name: "collect", type, index: i });
    }
  }

  function setValue(type: CollectorAssetType, index: number, key: string, value: Draft[string]) {
    const nextDraft = { ...draft, [key]: value };
    setDraft(nextDraft);
    advance(type, index, nextDraft);
  }

  function submitTextOrNumber(field: FieldSpec, type: CollectorAssetType, index: number) {
    const raw = input.trim();
    if (!raw) {
      if (field.optional) {
        setValue(type, index, field.key, undefined);
      }
      return;
    }
    if (field.kind === "number" || field.kind === "money") {
      const n = Number(raw.replace(/[, ]/g, "").replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(n)) {
        setError("Please enter a number.");
        return;
      }
      setError(null);
      setValue(type, index, field.key, n);
    } else {
      setError(null);
      setValue(type, index, field.key, raw);
    }
  }

  function editField(type: CollectorAssetType, key: string) {
    const all = fieldsFor(type);
    const idx = all.findIndex((f) => f.key === key);
    if (idx >= 0) {
      setInput(typeof draft[key] === "string" || typeof draft[key] === "number" ? String(draft[key]) : "");
      setPhase({ name: "collect", type, index: idx });
    }
  }

  async function confirm(type: CollectorAssetType) {
    setSaving(true);
    setError(null);
    const change = draftToChange(type, draft, displayCurrency);
    const res = await onConfirm([change]);
    setSaving(false);
    if (res.ok) {
      onStep?.("confirmed", { asset_type: type });
      // Reset for a fresh asset; the parent decides whether to re-mount us.
      setDraft({});
      setPhase({ name: "pickType" });
    } else {
      // A gate/clarification error (e.g. "Is there a mortgage on it?") keeps the
      // card open so the user can correct the relevant field.
      setError(res.error ?? "Something went wrong. Please try again.");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (phase.name === "pickType") {
    return (
      <div className="oc-card">
        <Bubble>What would you like to add?</Bubble>
        <div className="oc-chips">
          {(Object.keys(TYPE_META) as CollectorAssetType[]).map((t) => (
            <button key={t} className="oc-chip oc-chip-lg" onClick={() => pickType(t)}>
              <span aria-hidden style={{ marginRight: 8 }}>{TYPE_META[t].emoji}</span>
              {TYPE_META[t].label}
            </button>
          ))}
        </div>
        <CollectorStyles />
      </div>
    );
  }

  if (phase.name === "confirm") {
    const change = draftToChange(phase.type, draft, displayCurrency);
    const rows = fieldsFor(phase.type)
      .filter((f) => !f.when || f.when(draft))
      .filter((f) => draft[f.key] !== undefined && draft[f.key] !== "");
    return (
      <div className="oc-card">
        <Bubble>Here&apos;s what I&apos;ll save — tap any line to change it.</Bubble>
        <div className="oc-confirm">
          <div className="oc-confirm-title">
            {TYPE_META[phase.type].emoji} {summarizeChange(change, displayCurrency)}
          </div>
          <div className="oc-confirm-rows">
            {rows.map((f) => (
              <button key={f.key} className="oc-confirm-row" onClick={() => editField(phase.type, f.key)}>
                <span className="oc-confirm-label">{f.prompt.replace(/\?.*$/, "").replace(/\.$/, "")}</span>
                <span className="oc-confirm-value">
                  {typeof draft[f.key] === "boolean" ? (draft[f.key] ? "Yes" : "No") : String(draft[f.key])}
                  {f.suffix ?? ""}
                </span>
              </button>
            ))}
          </div>
        </div>
        {error && <div className="oc-error">{error}</div>}
        <div className="oc-actions">
          <button className="oc-btn oc-btn-primary" disabled={saving} onClick={() => confirm(phase.type)}>
            {saving ? "Saving…" : "Confirm & save"}
          </button>
          <button className="oc-link" disabled={saving} onClick={cancelAsset}>Discard</button>
        </div>
        <CollectorStyles />
      </div>
    );
  }

  // phase.name === "collect" — resolve the current field by index against the
  // full (unfiltered) list, since indices are assigned over the full script.
  const type = phase.type;
  const allFields = fieldsFor(type);
  const current = allFields[phase.index];

  if (!current) {
    // Defensive: index past the end -> go to confirm.
    setPhase({ name: "confirm", type });
    return null;
  }

  return (
    <div className="oc-card">
      <Bubble>{current.prompt}</Bubble>

      {current.kind === "currency" && (
        <div className="oc-chips">
          {CURRENCIES.map((c) => (
            <button key={c} className="oc-chip" onClick={() => setValue(type, phase.index, current.key, c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {current.kind === "yesno" && (
        <div className="oc-chips">
          <button className="oc-chip" onClick={() => setValue(type, phase.index, current.key, true)}>Yes</button>
          <button className="oc-chip" onClick={() => setValue(type, phase.index, current.key, false)}>No</button>
        </div>
      )}

      {current.kind === "choice" && (
        <div className="oc-chips">
          {current.choices?.map((ch) => (
            <button key={ch.value} className="oc-chip" onClick={() => setValue(type, phase.index, current.key, ch.value)}>
              {ch.label}
            </button>
          ))}
        </div>
      )}

      {(current.kind === "text" || current.kind === "number" || current.kind === "money" || current.kind === "date") && (
        <div className="oc-inputrow">
          <input
            className="oc-input"
            value={input}
            inputMode={current.kind === "number" || current.kind === "money" ? "decimal" : "text"}
            placeholder={current.placeholder}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitTextOrNumber(current, type, phase.index);
              }
            }}
          />
          <button
            className="oc-btn oc-btn-primary"
            onClick={() => submitTextOrNumber(current, type, phase.index)}
            disabled={!input.trim() && !current.optional}
          >
            {current.optional && !input.trim() ? "Skip" : "Next"}
          </button>
        </div>
      )}

      {error && <div className="oc-error">{error}</div>}
      <button className="oc-link" onClick={cancelAsset}>Cancel</button>
      <CollectorStyles />
    </div>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return <div className="oc-bubble">{children}</div>;
}

// Scoped styles using the app's design tokens so the collector matches the app in
// both light and dark themes without a separate stylesheet.
function CollectorStyles() {
  return (
    <style>{`
      .oc-card { display: flex; flex-direction: column; gap: var(--space-3); }
      .oc-bubble {
        font-family: var(--font-ui); font-size: var(--fs-body); color: var(--text);
        line-height: var(--lh-body);
      }
      .oc-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
      .oc-chip {
        font-family: var(--font-ui); font-size: var(--fs-body);
        background: var(--surface); color: var(--text);
        border: 0.5px solid var(--border-strong); border-radius: var(--radius-pill);
        padding: 10px 16px; min-height: 44px; cursor: pointer;
        transition: border-color 0.15s, background 0.12s;
      }
      .oc-chip:hover { border-color: var(--accent); }
      .oc-chip-lg { flex: 1 1 44%; text-align: left; }
      .oc-inputrow { display: flex; gap: var(--space-2); align-items: stretch; }
      .oc-input {
        flex: 1; min-width: 0; font-family: var(--font-ui); font-size: var(--fs-body);
        background: var(--surface); color: var(--text);
        border: 0.5px solid var(--border-strong); border-radius: var(--radius-lg);
        padding: 12px 14px; outline: none;
      }
      .oc-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
      .oc-btn {
        font-family: var(--font-ui); font-size: var(--fs-body); font-weight: 600;
        border: none; border-radius: var(--radius-lg); padding: 12px 20px;
        cursor: pointer; min-height: 44px;
      }
      .oc-btn-primary { background: var(--accent); color: var(--on-accent, var(--bg)); }
      .oc-btn:disabled { opacity: 0.5; cursor: default; }
      .oc-actions { display: flex; align-items: center; gap: var(--space-3); }
      .oc-link {
        align-self: flex-start; background: none; border: none; cursor: pointer;
        font-family: var(--font-ui); font-size: var(--fs-meta); color: var(--text-faint);
        text-decoration: underline; text-underline-offset: 3px; padding: 4px 0;
      }
      .oc-confirm {
        background: var(--surface); border: 0.5px solid var(--border);
        border-radius: var(--radius-lg); padding: var(--space-4);
        box-shadow: var(--shadow-soft);
      }
      .oc-confirm-title {
        font-family: var(--font-display); font-style: italic; font-size: var(--fs-subhead);
        color: var(--hero); margin-bottom: var(--space-3); line-height: var(--lh-snug);
      }
      .oc-confirm-rows { display: flex; flex-direction: column; gap: 2px; }
      .oc-confirm-row {
        display: flex; justify-content: space-between; align-items: center; gap: 12px;
        background: none; border: none; border-top: 0.5px solid var(--border);
        padding: 10px 2px; cursor: pointer; text-align: left; width: 100%;
      }
      .oc-confirm-row:first-child { border-top: none; }
      .oc-confirm-label { font-family: var(--font-ui); font-size: var(--fs-caption); color: var(--text-dim); }
      .oc-confirm-value { font-family: var(--font-ui); font-size: var(--fs-meta); color: var(--text); font-weight: 500; }
      .oc-error {
        font-size: var(--fs-meta); color: var(--negative-text, var(--negative));
        background: var(--negative-soft); border-radius: var(--radius-md); padding: 8px 12px;
        line-height: var(--lh-body);
      }
    `}</style>
  );
}
