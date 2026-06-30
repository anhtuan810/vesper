"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PulseBanner, toSafeHtml } from "@/components/vitals/PulseBanner";
import { VitalCard } from "@/components/vitals/VitalCard";
import type { VitalCardProps } from "@/components/vitals/VitalCard";
import { LibraryExpander } from "@/components/vitals/LibraryExpander";
import type { DormantVital } from "@/components/vitals/LibraryExpander";
import { ordinalSuffix } from "@/lib/utils";
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

function fmtCurrency(eur: number, dc: string): string {
  const sym = dc.toUpperCase() === "EUR" ? "€" : "$";
  const abs = Math.abs(eur);
  if (abs >= 1_000_000) return `${sym}${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${sym}${Math.round(abs / 1_000)}k`;
  return `${sym}${Math.round(abs)}`;
}

function fmtDate(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" });
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
  displayCurrency: string
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
    chart: <DrawdownBars data={v} />,
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
        height: 26,
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
    <div style={{ marginBottom: "var(--space-5)", paddingTop: "var(--space-8)" }}>
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
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 18px",
            background: "var(--accent)",
            color: "var(--bg)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-meta)",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
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

  function renderVitalCard(key: string): React.ReactNode {
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
        cfg = buildDrawdownCard(vital, displayCurrency);
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

    return (
      <VitalCard key={key} {...cfg.props} fillHeight={layout === "grid"}>
        {cfg.chart}
      </VitalCard>
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

  // Cards in their fixed order. "stack" (mobile) renders the vertical column
  // exactly as before; "grid" (desktop) wraps them in a responsive auto-fit
  // grid so several square-ish cards sit per row and collapse to one column
  // when the chat panel is dragged wide.
  const cardNodes = VITAL_ORDER.map((key) => renderVitalCard(key));
  const cards =
    layout === "grid" ? (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 11,
        }}
      >
        {cardNodes}
      </div>
    ) : (
      cardNodes
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

             On mobile these are unified into ONE "Pulse" card: the narrative
             pulse leads (gold band) and the relocated projection / worth-knowing /
             markets sit below it as sibling signals — all read as a family of
             pulses. Desktop (no host slot) keeps the standalone Pulse banner. */}
      {(() => {
        const pulseSentence = showProperty ? data.pulse : (data.pulseLiquid ?? data.pulse);
        const hasAssets = data.assets.length > 0;

        // Desktop / no host slot: the standalone Pulse banner, unchanged.
        if (!topSlot) {
          if (pulseSentence) {
            return (
              <PulseBanner
                dateLabel={`Pulse · ${fmtDate()}`}
                sentence={pulseSentence}
                metaLabel={`${activeVitals.length} vitals · 0 shifted`}
              />
            );
          }
          return hasAssets ? <PulseBannerSkeleton /> : null;
        }

        // Mobile: one card holding the narrative pulse (gold lead) + the relocated
        // signals (projection / worth knowing / markets) on the surface below.
        return (
          <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: "var(--space-4)" }}>
            {pulseSentence ? (
              <div style={{ background: "var(--accent-soft)", padding: "11px 15px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                  <div className="eyebrow" style={{ color: "var(--accent-deep)", opacity: 0.75 }}>
                    Pulse · {fmtDate()}
                  </div>
                  <div className="eyebrow" style={{ color: "var(--accent-deep)", opacity: 0.55 }}>
                    {activeVitals.length} vitals · 0 shifted
                  </div>
                </div>
                <div
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-body)", fontStyle: "italic", lineHeight: "var(--lh-body)", color: "var(--text)" }}
                  dangerouslySetInnerHTML={{ __html: toSafeHtml(pulseSentence) }}
                />
              </div>
            ) : hasAssets ? (
              <div style={{ background: "var(--accent-soft)", height: 52, opacity: 0.5 }} />
            ) : null}
            <div style={{ padding: "3px 15px 5px" }}>{topSlot}</div>
          </div>
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
