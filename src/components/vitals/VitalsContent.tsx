"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PulseBanner, PulseTrace, toSafeHtml, usePulseTraceOnce } from "@/components/vitals/PulseBanner";
import { requestExplore } from "@/lib/scenario/explore";
import { FoldRow } from "@/components/FoldRow";
import { SIGNAL_TEXT_STYLE, SignalRow, SignalIconChip, SignalDropBox } from "@/components/SwipeExpandCarousel";
import { VitalCard } from "@/components/vitals/VitalCard";
import type { VitalCardProps } from "@/components/vitals/VitalCard";
import { LibraryExpander } from "@/components/vitals/LibraryExpander";
import type { DormantVital } from "@/components/vitals/LibraryExpander";
import { ordinalSuffix } from "@/lib/utils";
import { formatMoneyCompact, isSupportedCurrency, type DisplayCurrency } from "@/lib/money";
import { ConcentrationBars } from "@/components/vitals/charts/ConcentrationBars";
import { RealAssetBullet } from "@/components/vitals/charts/RealAssetBullet";
import { LiquidityStack } from "@/components/vitals/charts/LiquidityStack";
import { LeverageTrend } from "@/components/vitals/charts/LeverageTrend";
import { DrawdownBars } from "@/components/vitals/charts/DrawdownBars";
import { CashWaterfall } from "@/components/vitals/charts/CashWaterfall";
import { RealGrowthDualLine } from "@/components/vitals/charts/RealGrowthDualLine";
import { useVitals } from "@/lib/hooks";
import type { VitalResult } from "@/lib/vitals/index";
import type { VitalScope } from "@/lib/vitals/types";
import type { ConcentrationValue } from "@/lib/vitals/concentration";
import type { RealAssetWeightValue } from "@/lib/vitals/realAssetWeight";
import type { LiquidityPostureValue } from "@/lib/vitals/liquidityPosture";
import type { LeverageValue } from "@/lib/vitals/leverage";
import type { DrawdownValue } from "@/lib/vitals/drawdown";
import type { CashRealYieldValue } from "@/lib/vitals/cashRealYield";
import type { RealGrowthValue } from "@/lib/vitals/realGrowth";

// ── Property lens ───────────────────────────────────────────────────────────
const LENS_DEFAULT_PROPERTY_PCT = 50;

function scopeVisible(scope: VitalScope, showProperty: boolean): boolean {
  if (showProperty) return true;
  return scope !== 'house';
}

// ── Order vitals render in this fixed sequence ──────────────────────────────
const VITAL_ORDER = [
  "concentration",
  "realAssetWeight",
  "liquidityPosture",
  "leverage",
  "drawdown",
  "cashRealYield",
  "realGrowth",
] as const;

// ── Human-readable labels and library metadata ──────────────────────────────
const VITAL_LABELS: Record<string, string> = {
  concentration: "Concentration",
  realAssetWeight: "Real-asset weight",
  liquidityPosture: "Liquidity posture",
  leverage: "Leverage",
  drawdown: "Drawdown vulnerability",
  cashRealYield: "Cash & real yield",
  realGrowth: "Real growth",
};

// Foldable-row copy (mobile): a short name and a plain-language line saying
// what the vital measures — so a first-time user never has to decode
// "Drawdown vulnerability" cold. The folded row is the whole story for a
// healthy vital; the chart and explanation live one tap deep.
const FOLD_META: Record<string, { title: string; question: string }> = {
  concentration:    { title: "Concentration",     question: "how much rides on your biggest holding" },
  realAssetWeight:  { title: "Real-asset weight", question: "how much of your wealth sits in property" },
  liquidityPosture: { title: "Liquidity",         question: "how fast you could reach your money" },
  leverage:         { title: "Leverage",          question: "how much of the house the bank still owns" },
  drawdown:         { title: "Drawdown",          question: "what a bad year could take" },
  cashRealYield:    { title: "Cash & real yield", question: "is your cash keeping its buying power" },
  realGrowth:       { title: "Real growth",       question: "did you grow after inflation" },
};

// The folded status word — the band's verdict in one plain word. Green vitals
// get a per-vital word; amber/red share the two attention words. Deterministic:
// everything derives from the band (and, for concentration under the property
// lens, the same investable-band logic the card copy uses).
type FoldStatus = { label: string; tone: "ok" | "warn" };

const GREEN_WORD: Record<string, string> = {
  concentration: "balanced",
  realAssetWeight: "in range",
  liquidityPosture: "above buffer",
  leverage: "healthy",
  drawdown: "manageable",
};

function foldStatus(key: string, vital: VitalResult, showProperty: boolean): FoldStatus {
  let band = vital.band;
  if (key === "concentration") {
    const v = vital.value as ConcentrationValue;
    if (showProperty && v.topPositionIsRealEstate && v.investableTopPositionPct != null) {
      const p = v.investableTopPositionPct;
      band = p > 50 ? "red" : p > 35 ? "amber" : "green";
    }
  }
  if (band === "red") return { label: "needs attention", tone: "warn" };
  if (band === "amber") return { label: "worth a look", tone: "warn" };
  if (key === "liquidityPosture" && (vital.value as LiquidityPostureValue).insufficient) {
    return { label: "—", tone: "ok" };
  }
  if (key === "cashRealYield") {
    const v = vital.value as CashRealYieldValue;
    return { label: v.realYieldPct < 0 ? "small drag" : "keeping up", tone: "ok" };
  }
  if (key === "realGrowth") {
    const v = vital.value as RealGrowthValue;
    return { label: v.real12moPct >= 0 ? "ahead" : "behind", tone: "ok" };
  }
  return { label: GREEN_WORD[key] ?? "in range", tone: "ok" };
}

const VITAL_SURFACES_WHEN: Record<string, string> = {
  concentration: "Surfaces when you hold 2 or more assets.",
  realAssetWeight: "Surfaces when you hold at least one property.",
  liquidityPosture: "Always active — shows your full liquidity spectrum.",
  leverage: "Surfaces when you have a mortgage on a property.",
  drawdown: "Surfaces when your net worth is positive.",
  cashRealYield: "Surfaces when cash exceeds 5% of your net worth.",
  realGrowth: "Surfaces after 12+ months of snapshot history.",
};

// ── Formatting helpers ──────────────────────────────────────────────────────

// nl-NL number grammar (comma decimals) everywhere, matching the rest of the app.
function fmtPct(v: number, forceSign = false): string {
  const sign = v < 0 ? "−" : forceSign && v > 0 ? "+" : "";
  return sign + Math.abs(v).toFixed(1).replace(".", ",") + "%";
}

// Vitals values are EUR-normalized — convert to the display currency (correct
// symbol included) before abbreviating, rather than pinning "$" on a EUR figure.
function fmtCurrency(eur: number, dc: string): string {
  return formatMoneyCompact(eur, "EUR", isSupportedCurrency(dc) ? dc : "EUR");
}

function fmtDate(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type HeroClass = "positive" | "negative" | "default";

function bandToHeroClass(band: string): HeroClass {
  if (band === "red") return "negative";
  if (band === "green") return "positive";
  return "default";
}

// ── Suggestion builders (per vital) ────────────────────────────────────────

type SuggestionConfig = Pick<
  NonNullable<VitalCardProps["suggestion"]>,
  "variant" | "label" | "body"
>;

function concentrationSuggestion(
  v: ConcentrationValue,
  band: string
): SuggestionConfig {
  if (band === "red") {
    return {
      variant: "alert",
      label: "Worth knowing",
      body: (
        <>
          <strong>{v.topPositionName}</strong> exceeds 50% of your portfolio. A
          single position at this scale amplifies volatility on both the upside
          and downside.
        </>
      ),
    };
  }
  if (band === "amber") {
    return {
      variant: "warn",
      label: "Worth considering",
      body: (
        <>
          <strong>{v.topPositionName}</strong> is {v.topPositionPct.toFixed(0)}%
          of your portfolio — approaching the 35% balanced threshold.
        </>
      ),
    };
  }
  return {
    variant: "context",
    label: "Context",
    body: (
      <>
        Your top position is {v.topPositionPct.toFixed(0)}% of the portfolio —
        within the balanced range.
      </>
    ),
  };
}

function investableConcentrationSuggestion(
  v: ConcentrationValue,
  band: string
): SuggestionConfig {
  const name = v.investableTopPositionName ?? v.topPositionName;
  const pct = v.investableTopPositionPct ?? v.topPositionPct;
  if (band === "red") {
    return {
      variant: "alert",
      label: "Worth knowing",
      body: (
        <>
          <strong>{name}</strong> exceeds 50% of your investable book. A single
          position at this scale amplifies volatility on both the upside and
          downside.
        </>
      ),
    };
  }
  if (band === "amber") {
    return {
      variant: "warn",
      label: "Worth considering",
      body: (
        <>
          <strong>{name}</strong> is {pct.toFixed(0)}% of your investable book
          — approaching the 35% balanced threshold.
        </>
      ),
    };
  }
  return {
    variant: "context",
    label: "Context",
    body: (
      <>
        Your top investable position is {pct.toFixed(0)}% of the investable
        book — within the balanced range.
      </>
    ),
  };
}

function realAssetSuggestion(
  v: RealAssetWeightValue,
  band: string
): SuggestionConfig {
  if (band === "amber") {
    if (v.propertyEquityPct > 75) {
      return {
        variant: "warn",
        label: "Worth considering",
        body: (
          <>
            Property equity is{" "}
            <strong>{v.propertyEquityPct.toFixed(0)}%</strong> of your net
            worth — above the balanced range. High illiquid concentration
            amplifies housing-market risk.
          </>
        ),
      };
    }
    return {
      variant: "warn",
      label: "Worth considering",
      body: (
        <>
          Property equity is <strong>{v.propertyEquityPct.toFixed(0)}%</strong>{" "}
          of your net worth — below EU norms. Consider whether your real-asset
          exposure matches your long-term goals.
        </>
      ),
    };
  }
  return {
    variant: "context",
    label: "Context",
    body: (
      <>
        Your real-asset weight of{" "}
        <strong>{v.propertyEquityPct.toFixed(0)}%</strong> is within the
        balanced range, near the EU homeowner median.
      </>
    ),
  };
}

function liquiditySuggestion(
  v: LiquidityPostureValue,
  band: string,
  displayCurrency: string
): SuggestionConfig {
  // Name pensions when they drive the locked tier, so "X% locked" is interpretable:
  // retirement money by design, not an ambiguous illiquid flag. Deterministic — the
  // euro figure is the EUR-normalized sum from the vital, never invented. When there
  // are no capital pensions the clause is null and the copy is unchanged.
  const pensionSum = fmtCurrency(v.lockedPensionEur, displayCurrency);
  const pensionDominatesLocked =
    v.lockedPensionEur > 0 && v.lockedEur > 0 && v.lockedPensionEur / v.lockedEur >= 0.5;
  const pensionClause =
    v.lockedPensionEur <= 0 ? null : pensionDominatesLocked ? (
      <>
        {" "}Most of what&apos;s locked is your pensions — about{" "}
        <strong>{pensionSum}</strong>, untouchable until retirement. That&apos;s by
        design, not a flag; the rest of your portfolio stays flexible.
      </>
    ) : (
      <>
        {" "}What&apos;s locked includes about <strong>{pensionSum}</strong> in
        pensions, set aside until retirement.
      </>
    );

  if (band === "red") {
    return {
      variant: "alert",
      label: "Worth knowing",
      body: (
        <>
          Only <strong>{v.deployable1wPct.toFixed(0)}%</strong> of your net
          worth is accessible within a week — below the{" "}
          {v.liquidBufferPct}% buffer target. An unexpected expense could force
          selling illiquid assets at a loss.{pensionClause}
        </>
      ),
    };
  }
  return {
    variant: "context",
    label: "Worth knowing",
    body: (
      <>
        <strong>{v.deployable1wPct.toFixed(0)}%</strong> of your net worth is
        accessible within a week — above the {v.liquidBufferPct}% buffer
        target.{pensionClause}
      </>
    ),
  };
}

function leverageSuggestion(v: LeverageValue, band: string): SuggestionConfig {
  if (band === "red") {
    return {
      variant: "alert",
      label: "Worth knowing",
      body: (
        <>
          Your LTV of <strong>{v.ltvPct.toFixed(0)}%</strong> is in the
          high-risk zone. Debt service makes up a large share of your financial
          obligations at this level.
        </>
      ),
    };
  }
  if (band === "amber") {
    return {
      variant: "warn",
      label: "Worth considering",
      body: (
        <>
          LTV of <strong>{v.ltvPct.toFixed(0)}%</strong> is moderate. The NL
          average is 52% — you&apos;re{" "}
          {v.ltvPct > 52 ? "above" : "below"} that benchmark.
        </>
      ),
    };
  }
  return {
    variant: "context",
    label: "Context",
    body: (
      <>
        LTV of <strong>{v.ltvPct.toFixed(0)}%</strong> is in the healthy range.
        The NL average is 52%.
      </>
    ),
  };
}

function drawdownSuggestion(
  v: DrawdownValue,
  band: string
): SuggestionConfig {
  if (band === "red") {
    return {
      variant: "alert",
      label: "Worth knowing",
      body: (
        <>
          A simultaneous market shock could reduce your net worth by{" "}
          <strong>{v.shockPctOfNw.toFixed(0)}%</strong> — a significant
          drawdown that may require lifestyle adjustments.
        </>
      ),
    };
  }
  if (band === "amber") {
    return {
      variant: "warn",
      label: "Worth considering",
      body: (
        <>
          A simultaneous shock would reduce your net worth by{" "}
          <strong>{v.shockPctOfNw.toFixed(0)}%</strong>. Worth maintaining
          liquid reserves for this scenario.
        </>
      ),
    };
  }
  return {
    variant: "context",
    label: "Context",
    body: (
      <>
        Your drawdown exposure of{" "}
        <strong>{v.shockPctOfNw.toFixed(0)}%</strong> under a combined shock is
        within a manageable range.
      </>
    ),
  };
}

function cashYieldSuggestion(
  v: CashRealYieldValue,
  band: string
): SuggestionConfig {
  if (band === "red") {
    return {
      variant: "alert",
      label: "Worth considering",
      body: (
        <>
          Cash is losing{" "}
          <strong>{Math.abs(v.realYieldPct).toFixed(1).replace(".", ",")}%</strong> of real
          purchasing power per year. At {v.cashPctOfNw.toFixed(0)}% of net
          worth, that&apos;s meaningful erosion.
        </>
      ),
    };
  }
  if (band === "amber") {
    return {
      variant: "warn",
      label: "Worth knowing",
      body: (
        <>
          Real yield is slightly negative at{" "}
          <strong>{fmtPct(v.realYieldPct)}</strong>. Inflation and taxes
          currently outpace your savings rate.
        </>
      ),
    };
  }
  return {
    variant: "context",
    label: "Context",
    body: (
      <>
        Cash is maintaining real purchasing power at{" "}
        <strong>{fmtPct(v.realYieldPct, true)}</strong> real yield.
      </>
    ),
  };
}

function realGrowthSuggestion(
  v: RealGrowthValue,
  band: string
): SuggestionConfig {
  if (band === "red") {
    return {
      variant: "alert",
      label: "Worth knowing",
      body: (
        <>
          Your portfolio lost{" "}
          <strong>{Math.abs(v.real12moPct).toFixed(1).replace(".", ",")}%</strong> of real
          purchasing power over 12 months. Inflation drag of{" "}
          {v.inflationDragPct.toFixed(1).replace(".", ",")}% is a significant headwind.
        </>
      ),
    };
  }
  if (band === "amber") {
    return {
      variant: "warn",
      label: "Worth considering",
      body: (
        <>
          Real growth is slightly negative at{" "}
          <strong>{fmtPct(v.real12moPct)}</strong>. Inflation is currently
          eating into nominal returns.
        </>
      ),
    };
  }
  return {
    variant: "context",
    label: "Context",
    body: (
      <>
        Your portfolio grew{" "}
        <strong>{fmtPct(v.real12moPct, true)}</strong> in real terms over 12
        months.
      </>
    ),
  };
}

// ── Per-vital card builders ─────────────────────────────────────────────────

type CardConfig = {
  props: Omit<VitalCardProps, "children">;
  chart: React.ReactNode;
};

function buildConcentrationCard(
  vital: VitalResult,
  positions: Array<{ name: string; type: string; pct: number; symbol?: string }>,
  showProperty: boolean
): CardConfig {
  const v = vital.value as ConcentrationValue;
  const chart = <ConcentrationBars positions={positions} />;

  if (showProperty) {
    // Checked path: hero = gross top position
    if (v.topPositionIsRealEstate && v.investableTopPositionPct != null) {
      const invPct = v.investableTopPositionPct;
      const invBand = invPct > 50 ? "red" : invPct > 35 ? "amber" : "green";
      const invWord =
        invBand === "green"
          ? "balanced"
          : invBand === "amber"
          ? "approaching threshold"
          : "concentrated";
      return {
        props: {
          eyebrow: "Concentration",
          heroNumber: fmtPct(v.topPositionPct),
          heroNumberClass: "default",
          subLine: `your home · investable concentration ${invPct.toFixed(0)}% · ${invWord}`,
          rightStat: { label: "Top 3", value: fmtPct(v.top3Pct) },
          benchLine: "balanced threshold ≤ 35% top position",
          suggestion: {
            variant: "context",
            label: "Context",
            body: (
              <>
                Your home anchors the portfolio as a structural position.
                Investable concentration is{" "}
                <strong>{invPct.toFixed(0)}%</strong> — {invWord}.
              </>
            ),
          },
        },
        chart,
      };
    }
    // NULL GUARD or non-RE top: gross hero, standard subLine
    if (v.investableTopPositionPct == null) {
      return {
        props: {
          eyebrow: "Concentration",
          heroNumber: fmtPct(v.topPositionPct),
          heroNumberClass: "default",
          subLine: "your home",
          rightStat: { label: "Top 3", value: fmtPct(v.top3Pct) },
          benchLine: "balanced threshold ≤ 35% top position",
          suggestion: {
            variant: "context",
            label: "Context",
            body: (
              <>
                Your portfolio is anchored by your home — a structural
                position, not a rebalanceable allocation.
              </>
            ),
          },
        },
        chart,
      };
    }
    return {
      props: {
        eyebrow: "Concentration",
        heroNumber: fmtPct(v.topPositionPct),
        heroNumberClass: bandToHeroClass(vital.band),
        subLine: "by gross value",
        rightStat: { label: "Top 3", value: fmtPct(v.top3Pct) },
        benchLine: "balanced threshold ≤ 35% top position",
        suggestion: concentrationSuggestion(v, vital.band),
      },
      chart,
    };
  }

  // Unchecked path: hero = investable
  // NULL GUARD: no investable positions (property-only — toggle should not be shown)
  if (v.investableTopPositionPct == null) {
    return {
      props: {
        eyebrow: "Concentration",
        heroNumber: fmtPct(v.topPositionPct),
        heroNumberClass: "default",
        subLine: "your home",
        rightStat: { label: "Top 3", value: fmtPct(v.top3Pct) },
        benchLine: "balanced threshold ≤ 35% top position",
        suggestion: {
          variant: "context",
          label: "Context",
          body: (
            <>
              Your portfolio is anchored by your home — a structural position,
              not a rebalanceable allocation.
            </>
          ),
        },
      },
      chart,
    };
  }

  return {
    props: {
      eyebrow: "Concentration",
      heroNumber: fmtPct(v.investableTopPositionPct),
      heroNumberClass: bandToHeroClass(vital.band),
      subLine: "of investable assets",
      rightStat: {
        label: "Top 3",
        value: fmtPct(v.investableTop3Pct ?? v.top3Pct),
      },
      benchLine: "balanced threshold ≤ 35% top position",
      suggestion: investableConcentrationSuggestion(v, vital.band),
    },
    chart,
  };
}

function buildRealAssetCard(vital: VitalResult): CardConfig {
  const v = vital.value as RealAssetWeightValue;
  return {
    props: {
      eyebrow: "Real-asset weight",
      heroNumber: fmtPct(v.propertyEquityPct),
      heroNumberClass: vital.band === "green" ? "positive" : "default",
      subLine: "equity / net worth",
      rightStat: { label: "EU rank", value: `${v.percentileEU}${ordinalSuffix(v.percentileEU)}` },
      benchLine: "EU homeowner median ~63% real-asset weight",
      suggestion: realAssetSuggestion(v, vital.band),
    },
    chart: <RealAssetBullet data={v} />,
  };
}

function buildLiquidityCard(vital: VitalResult, displayCurrency: string): CardConfig {
  const v = vital.value as LiquidityPostureValue;

  // Empty/thin portfolio: nothing to assess. Show a neutral hero ("—") and a calm
  // prompt instead of a 0% reading and the red "could force selling" alarm.
  if (v.insufficient) {
    return {
      props: {
        eyebrow: "Liquidity posture",
        heroNumber: "—",
        heroNumberClass: "default",
        subLine: "within 1 week",
        rightStat: {
          label: "Buffer target",
          value: `${v.liquidBufferPct.toFixed(0)}%`,
        },
        benchLine: `target: ≥ ${v.liquidBufferPct}% deployable within 1 week`,
        suggestion: {
          variant: "context",
          label: "Worth knowing",
          body: <>Add assets to see your liquidity posture.</>,
        },
      },
      chart: <LiquidityStack data={v} />,
    };
  }

  return {
    props: {
      eyebrow: "Liquidity posture",
      heroNumber: fmtPct(v.deployable1wPct),
      heroNumberClass: bandToHeroClass(vital.band),
      subLine: "within 1 week",
      rightStat: {
        label: "Buffer target",
        value: `${v.liquidBufferPct.toFixed(0)}%`,
      },
      benchLine: `target: ≥ ${v.liquidBufferPct}% deployable within 1 week`,
      suggestion: liquiditySuggestion(v, vital.band, displayCurrency),
    },
    chart: <LiquidityStack data={v} />,
  };
}

function buildLeverageCard(vital: VitalResult): CardConfig {
  const v = vital.value as LeverageValue;
  return {
    props: {
      eyebrow: "Leverage",
      heroNumber: fmtPct(v.ltvPct),
      heroNumberClass: bandToHeroClass(vital.band),
      subLine: "loan-to-value",
      rightStat: {
        label: "Rate",
        value: `${v.mortgageRate.toFixed(2).replace(".", ",")}%`,
      },
      benchLine: "NL average LTV: 52%",
      suggestion: leverageSuggestion(v, vital.band),
    },
    chart: <LeverageTrend data={v} />,
  };
}

function buildDrawdownCard(
  vital: VitalResult,
  displayCurrency: DisplayCurrency
): CardConfig {
  const v = vital.value as DrawdownValue;
  return {
    props: {
      eyebrow: "Drawdown vulnerability",
      heroNumber: fmtPct(v.shockPctOfNw),
      heroNumberClass: bandToHeroClass(vital.band),
      subLine: "combined shock",
      rightStat: {
        label: "Post-shock NW",
        value: fmtCurrency(v.postShockNwEur, displayCurrency),
      },
      benchLine: "equities −30%, crypto −50%, housing −15%",
      suggestion: drawdownSuggestion(v, vital.band),
    },
    chart: <DrawdownBars data={v} displayCurrency={displayCurrency} />,
  };
}

function buildCashYieldCard(vital: VitalResult): CardConfig {
  const v = vital.value as CashRealYieldValue;
  return {
    props: {
      eyebrow: "Cash & real yield",
      heroNumber: fmtPct(v.realYieldPct, true),
      heroNumberClass: v.realYieldPct < 0 ? "negative" : "positive",
      subLine: "real annual yield",
      rightStat: {
        label: "Cash share",
        value: `${v.cashPctOfNw.toFixed(0)}%`,
      },
      benchLine: `savings ${v.savingsRatePct.toFixed(1).replace(".", ",")}% − inflation ${v.inflationDragPct.toFixed(1).replace(".", ",")}% − tax ${v.box3TaxPct.toFixed(1).replace(".", ",")}%`,
      suggestion: cashYieldSuggestion(v, vital.band),
    },
    chart: <CashWaterfall data={v} />,
  };
}

function buildRealGrowthCard(vital: VitalResult): CardConfig {
  const v = vital.value as RealGrowthValue;
  return {
    props: {
      eyebrow: "Real growth",
      heroNumber: fmtPct(v.real12moPct, true),
      heroNumberClass: v.real12moPct < 0 ? "negative" : "positive",
      subLine: "real 12-month",
      rightStat: {
        label: "Nominal",
        value: fmtPct(v.nominal12moPct, true),
      },
      benchLine: `inflation drag: ${v.inflationDragPct.toFixed(1).replace(".", ",")}% per year`,
      suggestion: realGrowthSuggestion(v, vital.band),
    },
    chart: <RealGrowthDualLine data={v} />,
  };
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div
      style={{
        background: "var(--surface-elev)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        height: 180,
        marginBottom: "var(--space-row)",
        opacity: 0.45,
      }}
    />
  );
}

function SkeletonStripLine() {
  return (
    <div
      style={{
        background: "var(--surface-elev)",
        borderRadius: "var(--radius-md)",
        height: 12,
        marginBottom: 8,
        opacity: 0.4,
      }}
    />
  );
}

// Slim placeholder occupying the PulseBanner slot while the Pulse sentence is
// still loading on its separate channel — same horizontal footprint and bottom
// margin as PulseBanner so the cards below don't jump when the sentence lands.
function PulseBannerSkeleton() {
  return (
    <div
      style={{
        margin: "0 0 10px",
        background: "var(--surface-elev)",
        borderRadius: "var(--radius-lg)",
        height: 36,
        opacity: 0.4,
      }}
    />
  );
}

// ── Body content ──────────────────────────────────────────────────────────

interface VitalsContentProps {
  /** Presentational layout. "stack" is today's mobile column; "grid" arrives in Prompt 2. */
  layout?: "stack" | "grid";
  /** Where the Library expander sits relative to the cards. */
  libraryPosition?: "top" | "bottom";
  /** Render the big "Vitals" title. Off when a host panel supplies its own header. */
  showHeader?: boolean;
  /** Render the property lens toggle inline (above the Pulse) even when the
   *  built-in header is off — used by the desktop Vitals page, which supplies its
   *  own Twilight header but still needs the include/exclude-Property control. */
  renderToggleInline?: boolean;
  /** Optional signals node. When present (mobile), it's folded into the Pulse card
   *  as sibling rows beneath the narrative pulse — the mobile Vitals page passes
   *  the relocated Portfolio summary card (projection / worth knowing / markets).
   *  Desktop omits it, so the Pulse renders as its standalone banner. */
  topSlot?: React.ReactNode;
}

export function VitalsContent({
  layout = "stack",
  libraryPosition = "bottom",
  showHeader = true,
  renderToggleInline = false,
  topSlot,
}: VitalsContentProps = {}) {
  const router = useRouter();
  const { data, isLoading, error } = useVitals();

  // ── Property lens state ───────────────────────────────────────────────────
  const [showProperty, setShowProperty] = useState<boolean>(true);

  // ── Fold state (mobile stack) ─────────────────────────────────────────────
  // Per-device open/closed overrides. A vital with no override defaults from
  // its band: amber/red arrive unfolded, green rests folded — so an all-folded
  // page literally means all is well. Loaded after mount (SSR-safe).
  const FOLDS_KEY = "volnar:vitals-open";
  const [foldOverrides, setFoldOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FOLDS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setFoldOverrides(JSON.parse(raw));
    } catch {}
  }, []);
  function persistFolds(next: Record<string, boolean>) {
    try { sessionStorage.setItem(FOLDS_KEY, JSON.stringify(next)); } catch {}
  }
  function setFold(key: string, open: boolean) {
    setFoldOverrides((prev) => {
      const next = { ...prev, [key]: open };
      persistFolds(next);
      return next;
    });
  }
  function setAllFolds(keys: string[], open: boolean) {
    setFoldOverrides((prev) => {
      const next = { ...prev, ...Object.fromEntries(keys.map((k) => [k, open])) };
      persistFolds(next);
      return next;
    });
  }
  // Seeds the chat with this vital as context — same mechanism the Library uses.
  function askAboutVital(key: string) {
    try { sessionStorage.setItem("vitals.seed.vital", key); } catch {}
    router.push(`/chat?seed=insight&key=vital-${key}`);
  }

  // The plate's doorway — "Pressure-test this →" opens the what-if explorer
  // (same hand-off the projection row uses via PortfolioSummaryCardLoader).
  function pressureTest() {
    if (!requestExplore(false)) router.push("/chat");
  }

  // Heartbeat trace: draws once per session, rests on revisits.
  const traceAnimate = usePulseTraceOnce();

  // The Pulse row's expand state (collapsed = one clipped line).
  const [pulseOpen, setPulseOpen] = useState(false);

  // Freshness: a quiet "new" on the dateline, only when today's sentence
  // differs from the one this device last saw. The comparison key is the
  // sentence itself — no schema, no extra fetch.
  const pulseSentence = data
    ? (showProperty ? data.pulse : (data.pulseLiquid ?? data.pulse)) ?? null
    : null;
  const [pulseIsNew, setPulseIsNew] = useState(false);
  useEffect(() => {
    if (!pulseSentence) return;
    try {
      const prev = localStorage.getItem("volnar:pulse-seen");
      if (prev !== pulseSentence) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPulseIsNew(true);
        localStorage.setItem("volnar:pulse-seen", pulseSentence);
      }
    } catch {}
  }, [pulseSentence]);

  const hasMixed = useMemo(() => {
    if (!data?.assets?.length) return false;
    return (
      data.assets.some((a) => a.type === "real_estate") &&
      data.assets.some((a) => a.type !== "real_estate")
    );
  }, [data?.assets]);

  useEffect(() => {
    if (!data?.assets?.length) return;
    const stored = sessionStorage.getItem("volnar:vitals-show-property");
    if (stored !== null) {
      setShowProperty(stored === "true");
    } else {
      const gross = data.assets.reduce((s, a) => s + a.eurValue, 0) || 1;
      const propertyGross = data.assets
        .filter((a) => a.type === "real_estate")
        .reduce((s, a) => s + a.eurValue, 0);
      setShowProperty(
        (propertyGross / gross) * 100 >= LENS_DEFAULT_PROPERTY_PCT
      );
    }
  }, [data?.assets]);

  function toggleShowProperty() {
    const next = !showProperty;
    setShowProperty(next);
    sessionStorage.setItem("volnar:vitals-show-property", String(next));
  }

  // ── Bar positions ──────────────────────────────────────────────────────────
  // All positions (gross) — used when Property is on
  const allConcentrationPositions = useMemo(() => {
    if (!data?.assets?.length) return [];
    const gross = data.assets.reduce((s, a) => s + a.eurValue, 0) || 1;
    return [...data.assets]
      .map((a) => ({
        name: a.name,
        type: a.type,
        symbol: a.symbol,
        pct: (a.eurValue / gross) * 100,
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [data?.assets]);

  // Investable-only positions renormalized to 100 — used when Property is off
  const investableConcentrationPositions = useMemo(() => {
    if (!data?.assets?.length) return [];
    const investable = data.assets.filter((a) => a.type !== "real_estate");
    const investableGross = investable.reduce((s, a) => s + a.eurValue, 0) || 1;
    return [...investable]
      .map((a) => ({
        name: a.name,
        type: a.type,
        symbol: a.symbol,
        pct: (a.eurValue / investableGross) * 100,
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [data?.assets]);

  // Shared lens toggle — included/excluded property. Shown in the built-in header
  // and (when requested) inline above the Pulse for hosts that supply their own
  // header. Renders only for mixed portfolios, where a property lens is meaningful.
  const propertyToggle = hasMixed ? (
    <button
      aria-pressed={showProperty}
      aria-label="Toggle property in vitals"
      onClick={toggleShowProperty}
      style={{
        height: 32,
        padding: "0 var(--space-3)",
        borderRadius: "var(--radius-pill)",
        border: `0.5px solid ${showProperty ? "var(--accent-soft)" : "var(--border)"}`,
        background: showProperty ? "var(--accent-soft)" : "transparent",
        color: showProperty ? "var(--accent-deep)" : "var(--text-faint)",
        fontSize: "var(--fs-meta)",
        fontWeight: 500,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        lineHeight: "var(--lh-tight)",
        display: "flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      {showProperty ? "Including property" : "Excluding property"}
    </button>
  ) : null;

  const pageTitle = showHeader ? (
    // Top spacing matches the Overview reference (pt-4 under the NavBar).
    <div style={{ marginBottom: "var(--space-4)", paddingTop: "var(--space-4)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-title)",
            fontWeight: 500,
            letterSpacing: "var(--tracking-title)",
            color: "var(--hero)",
            lineHeight: "var(--lh-tight)",
          }}
        >
          Vitals
        </div>
        {propertyToggle}
      </div>
    </div>
  ) : null;

  // Inline toggle row for headerless hosts (desktop Vitals page).
  // The property lens toggle for headerless hosts (desktop Vitals) — now sits on
  // the "Active vitals" row rather than at the very top, so the Pulse banner can
  // align with the chat rail. Null on mobile (renderToggleInline off).
  const inlineToggleNode = renderToggleInline && !showHeader && propertyToggle ? propertyToggle : null;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        {pageTitle}
        <SkeletonStripLine />
        <div style={{ marginBottom: "var(--space-5)" }}>
          <div
            style={{
              background: "var(--surface-elev)",
              borderRadius: "var(--radius-md)",
              height: 36,
              opacity: 0.4,
              marginBottom: 14,
            }}
          />
        </div>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <>
        {pageTitle}
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: "var(--fs-body)",
            color: "var(--text-dim)",
            lineHeight: "var(--lh-body)",
          }}
        >
          Couldn&apos;t load your Vitals. Pull down to retry.
        </div>
      </>
    );
  }

  const activeVitals = data.vitals.filter(
    (v) => v.applies && scopeVisible(v.scope, showProperty)
  );
  const dormantVitals = data.vitals.filter(
    (v) => !v.applies || !scopeVisible(v.scope, showProperty)
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  if (activeVitals.length === 0 && data.netWorthEur === 0) {
    return (
      <>
        {pageTitle}
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: "var(--fs-body)",
            color: "var(--text-dim)",
            lineHeight: "var(--lh-body)",
            marginBottom: "var(--space-5)",
          }}
        >
          Add your first asset to see your Vitals.
        </div>
        <button
          onClick={() => router.push("/chat?seed=onboarding-class")}
          className="btn btn-primary focus-ring"
        >
          Get started
        </button>
      </>
    );
  }

  // ── Build vital cards ──────────────────────────────────────────────────────
  const vitalMap = Object.fromEntries(
    data.vitals.map((v) => [v.key, v])
  );
  const displayCurrency = data.displayCurrency;

  function buildConfig(key: string): { vital: VitalResult; cfg: CardConfig } | null {
    const vital = vitalMap[key];
    if (!vital || !vital.applies || !scopeVisible(vital.scope, showProperty)) return null;

    let cfg: CardConfig;

    switch (key) {
      case "concentration":
        cfg = buildConcentrationCard(
          vital,
          showProperty ? allConcentrationPositions : investableConcentrationPositions,
          showProperty
        );
        break;
      case "realAssetWeight":
        cfg = buildRealAssetCard(vital);
        break;
      case "liquidityPosture":
        cfg = buildLiquidityCard(vital, displayCurrency);
        break;
      case "leverage":
        cfg = buildLeverageCard(vital);
        break;
      case "drawdown":
        cfg = buildDrawdownCard(vital, isSupportedCurrency(displayCurrency) ? displayCurrency : "EUR");
        break;
      case "cashRealYield":
        cfg = buildCashYieldCard(vital);
        break;
      case "realGrowth":
        cfg = buildRealGrowthCard(vital);
        break;
      default:
        return null;
    }
    return { vital, cfg };
  }

  // Desktop grid: the existing card, unchanged.
  function renderVitalCard(key: string): React.ReactNode {
    const built = buildConfig(key);
    if (!built) return null;
    return (
      <VitalCard key={key} {...built.cfg.props} fillHeight={layout === "grid"}>
        {built.cfg.chart}
      </VitalCard>
    );
  }

  // Mobile stack: the foldable row. Folded = name + plain-language line +
  // figure + status word; unfolded = chart, the right-hand stat, the full
  // explanation and an "Ask about this" chat hook. The bench line is dropped
  // here — each chart already carries its own benchmark.
  function effectiveOpen(key: string): boolean {
    const vital = vitalMap[key];
    const dflt = vital ? foldStatus(key, vital, showProperty).tone !== "ok" : false;
    return foldOverrides[key] ?? dflt;
  }

  function renderVitalFold(key: string, first: boolean): React.ReactNode {
    const built = buildConfig(key);
    if (!built) return null;
    const { vital, cfg } = built;
    const meta = FOLD_META[key] ?? { title: VITAL_LABELS[key] ?? key, question: "" };
    const status = foldStatus(key, vital, showProperty);
    const open = effectiveOpen(key);
    return (
      <FoldRow
        key={key}
        first={first}
        title={meta.title}
        question={meta.question}
        value={cfg.props.heroNumber}
        valueTone={cfg.props.heroNumberClass === "negative" ? "negative" : "default"}
        sub={status.label}
        subTone={status.tone}
        open={open}
        onToggle={() => setFold(key, !open)}
      >
        {cfg.chart}
        {cfg.props.rightStat && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 6, marginTop: "var(--space-2)" }}>
            <span className="eyebrow">{cfg.props.rightStat.label}</span>
            <span className="tnum" style={{ fontSize: "var(--fs-meta)", fontWeight: 500, color: "var(--text)" }}>
              {cfg.props.rightStat.value}
            </span>
          </div>
        )}
        {cfg.props.suggestion && (
          <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--fs-body)", lineHeight: "var(--lh-read)", color: "var(--text-dim)" }}>
            <b style={{ fontWeight: 600, color: cfg.props.suggestion.variant === "context" ? "var(--accent-text)" : "var(--negative-text)" }}>
              {cfg.props.suggestion.label} —{" "}
            </b>
            {cfg.props.suggestion.body}
          </p>
        )}
        <button
          type="button"
          onClick={() => askAboutVital(key)}
          className="font-ui focus-ring"
          style={{ marginTop: "var(--space-3)", padding: 0, background: "none", border: "none", cursor: "pointer", fontSize: "var(--fs-micro)", fontWeight: 600, letterSpacing: "0.04em", color: "var(--accent-text)" }}
        >
          Ask about this →
        </button>
      </FoldRow>
    );
  }

  // ── Dormant vitals for LibraryExpander ─────────────────────────────────────
  const dormantItems: DormantVital[] = dormantVitals
    .filter((v) => VITAL_LABELS[v.key])
    .map((v) => ({
      key: v.key,
      label: VITAL_LABELS[v.key],
      currentValue: "—",
      surfacesWhen: VITAL_SURFACES_WHEN[v.key] ?? "Surfaces when conditions are met.",
      reason: (v.applies && !scopeVisible(v.scope, showProperty)
        ? "property-off"
        : "applies") as "applies" | "property-off",
    }));

  // Cards in their fixed order. "grid" (desktop) keeps the existing card grid;
  // "stack" (mobile) renders the foldable rows — green vitals rest folded,
  // amber/red arrive open.
  const activeKeys = VITAL_ORDER.filter((k) => {
    const v = vitalMap[k];
    return !!v && v.applies && scopeVisible(v.scope, showProperty);
  });
  const anyFolded = activeKeys.some((k) => !effectiveOpen(k));
  const cards =
    layout === "grid" ? (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 11,
        }}
      >
        {VITAL_ORDER.map((key) => renderVitalCard(key))}
      </div>
    ) : (
      <div>{activeKeys.map((key, i) => renderVitalFold(key, i === 0))}</div>
    );

  const library =
    dormantItems.length > 0 ? (
      <LibraryExpander
        dormantVitals={dormantItems}
        totalCount={data.vitals.length}
      />
    ) : null;

  // ── Full render ────────────────────────────────────────────────────────────
  return (
    <>
      {/* 1. Page title */}
      {pageTitle}

      {/* 2. Pulse + signals. The Pulse is lens-aware: liquid pulse when Property
             is off, all-assets pulse otherwise (falls back to all-assets if the
             liquid pulse wasn't generated). It loads on a separate channel after
             the body paints, so until the sentence lands we hold the slot with a
             shimmer (only when the user has assets) to avoid shifting the cards.

             On mobile the four pulses — narrative Pulse, projection, Worth
             knowing, Markets — are four one-line rows on one tinted wash, each
             with an icon chip, a drop-down box, and one trigger sentence into
             chat. Desktop (no host slot) keeps the standalone Pulse plate. */}
      {(() => {
        const hasAssets = data.assets.length > 0;

        // Desktop / no host slot: the standalone Pulse plate card.
        if (!topSlot) {
          if (pulseSentence) {
            return (
              <PulseBanner
                dateLabel={`Pulse · ${fmtDate()}${pulseIsNew ? " · new" : ""}`}
                sentence={pulseSentence}
                metaLabel={`${activeVitals.length} vitals`}
              />
            );
          }
          return hasAssets ? <PulseBannerSkeleton /> : null;
        }

        // Mobile: the pulse family as ONE full-bleed tinted wash holding four
        // one-line rows — Pulse, projection, Worth knowing, Markets — each with
        // its own icon chip, an expandable drop-down, and one trigger sentence
        // into chat. The wash + white icon chips + serif voice are what set
        // these rows apart from the plain vital rows below.
        return (
          <>
            {(pulseSentence || hasAssets) && (
              <div style={{ margin: "0 calc(var(--space-5) * -1)", background: "var(--accent-soft)", padding: "7px var(--space-5) 3px" }}>
                {/* Header row carries the heartbeat trace between the dateline
                    and the count — the trace costs no extra vertical space. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 4px" }}>
                  <div className="eyebrow" style={{ color: "var(--accent-deep)", opacity: 0.8, whiteSpace: "nowrap" }}>
                    Pulse · {fmtDate()}
                    {pulseIsNew && <span> · new</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, color: "var(--accent)" }}>
                    <PulseTrace animate={traceAnimate} />
                  </div>
                  <div className="eyebrow" style={{ color: "var(--accent-deep)", opacity: 0.55, whiteSpace: "nowrap" }}>
                    {activeVitals.length} vitals
                  </div>
                </div>

                {/* Row 1 — the Pulse. One clipped line collapsed; the full
                    sentence + the pressure-test trigger when expanded. */}
                <div style={{ padding: "var(--space-1) 0" }}>
                  {pulseSentence ? (
                    <SignalRow
                      icon={
                        <SignalIconChip>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                            <polyline points="2 12 6 12 9 5 14 19 17 12 22 12" />
                          </svg>
                        </SignalIconChip>
                      }
                    >
                      <button
                        type="button"
                        aria-expanded={pulseOpen}
                        onClick={() => setPulseOpen((v) => !v)}
                        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <span style={{ ...SIGNAL_TEXT_STYLE, display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span
                            style={pulseOpen ? { minWidth: 0 } : { minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                            dangerouslySetInnerHTML={{ __html: toSafeHtml(pulseSentence) }}
                          />
                          <svg
                            viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={20}
                            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                            style={{
                              width: 10, height: 10, flexShrink: 0, alignSelf: "center",
                              color: "var(--accent-text)", opacity: 0.5,
                              transition: "transform 0.15s",
                              transform: pulseOpen ? "rotate(90deg)" : undefined,
                            }}
                          >
                            <polyline points="96 48 176 128 96 208" />
                          </svg>
                        </span>
                      </button>
                      {pulseOpen && (
                        <SignalDropBox
                          trigger={{ label: "Pressure-test this", onActivate: pressureTest }}
                        />
                      )}
                    </SignalRow>
                  ) : (
                    // Pulse still loading (or unavailable): keep the row's real
                    // anatomy — icon chip + a shimmering sentence-length bar.
                    <SignalRow
                      icon={
                        <SignalIconChip>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                            <polyline points="2 12 6 12 9 5 14 19 17 12 22 12" />
                          </svg>
                        </SignalIconChip>
                      }
                    >
                      <div className="animate-pulse" style={{ height: 12, width: "72%", borderRadius: "var(--radius-pill)", background: "var(--surface)", opacity: 0.7, marginTop: 4 }} />
                    </SignalRow>
                  )}
                </div>

                {/* Rows 2–4 — projection / Worth knowing / Markets, same shell. */}
                <div style={{ borderTop: "1px solid var(--border)" }}>{topSlot}</div>
              </div>
            )}
          </>
        );
      })()}

      {/* Library (top placement) */}
      {libraryPosition === "top" && library}

      {/* 3. Active vitals eyebrow — with the property lens toggle on its right
             for headerless desktop hosts (mobile keeps the plain eyebrow). */}
      {inlineToggleNode ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <span className="eyebrow">
            Active vitals &middot; {activeVitals.length}
          </span>
          {inlineToggleNode}
        </div>
      ) : layout === "stack" ? (
        // Mobile meta row — mirrors Overview's "12 positions · Collapse all":
        // the count on the left, a quiet global fold action on the right.
        // Tight top spacing: the vitals list must start above the fold.
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid var(--border)",
            marginTop: "var(--space-3)",
            paddingTop: "var(--space-2)",
            marginBottom: "var(--space-1)",
          }}
        >
          <span className="eyebrow">
            Active vitals &middot; {activeVitals.length}
          </span>
          <button
            type="button"
            onClick={() => setAllFolds(activeKeys, anyFolded)}
            className="font-ui"
            aria-label={anyFolded ? "Unfold all vitals" : "Fold all vitals"}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "var(--fs-micro)", fontWeight: 600, letterSpacing: "0.04em", color: "var(--accent-text)", whiteSpace: "nowrap" }}
          >
            {anyFolded ? "Unfold all" : "Fold all"}
          </button>
        </div>
      ) : (
        <div
          className="eyebrow"
          style={{
            marginBottom: "var(--space-4)",
          }}
        >
          Active vitals &middot; {activeVitals.length}
        </div>
      )}

      {/* 5. Vital cards in fixed order */}
      {cards}

      {/* 6. Library expander (bottom placement) — only if there are dormant vitals */}
      {libraryPosition === "bottom" && library}
    </>
  );
}
