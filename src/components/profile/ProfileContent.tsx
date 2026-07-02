"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useUser, useProfile, useNetWorth } from "@/lib/hooks";
import { createBrowserSupabase } from "@/lib/supabase";
import { isSupportedCurrency } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import { computePerspective } from "@/lib/vitals/perspective";
import { findBaselineSnapshot, MIN_BASELINE_AGE_DAYS } from "@/lib/vitals/realGrowth";
import { PerspectiveCard } from "@/components/perspective/PerspectiveCard";
import { SubscriptionSection, renewalDate, dateLabel } from "@/components/profile/SubscriptionSection";
import { FoldRow } from "@/components/FoldRow";
import { useSubscription } from "@/components/SubscriptionProvider";
import { PLAN_LABEL, TRIAL_DAYS } from "@/lib/subscription";
import { formatRenewalDate } from "@/lib/subscription";
import { formatMoney } from "@/lib/money";
import { profileBaselineCacheKey, PROFILE_BASELINE_TTL_MS } from "@/lib/constants";
import type { Snapshot } from "@/lib/vitals/types";
import { apiFetch } from "@/lib/api";

const supabase = createBrowserSupabase();

// Cached trajectory baseline (net worth ~365d ago), so repeat Profile visits don't
// re-pull snapshot history. `value` is null when no ≥330-day baseline exists yet.
// All storage/JSON access is wrapped so a failure is a silent no-op.
type BaselineCache = { value: number | null; ageDays: number | null; fetchedAt: number };

function readBaselineCache(userId: string): BaselineCache | null {
  try {
    const raw = sessionStorage.getItem(profileBaselineCacheKey(userId));
    return raw ? (JSON.parse(raw) as BaselineCache) : null;
  } catch { return null; }
}

function writeBaselineCache(userId: string, cache: BaselineCache): void {
  try { sessionStorage.setItem(profileBaselineCacheKey(userId), JSON.stringify(cache)); } catch {}
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Shown if a subscription exists but carries no usable date (defensive).
const STATUS_LABEL_FALLBACK = "active";

const PROFILE_FIELDS = [
  { key: "life_and_direction", label: "Life and direction" },
  { key: "approach", label: "Approach" },
  { key: "currently_exploring", label: "Currently exploring" },
  { key: "worth_raising", label: "Worth raising" },
] as const;

// A muted placeholder bar used in the zero-data preview.
function GhostBar({ width, height = 10 }: { width: number | string; height?: number }) {
  return (
    <div style={{ width, height, borderRadius: "var(--radius-pill)", background: "var(--surface-elev)" }} />
  );
}

// Zero-data preview shown on a fresh account, where there is no Perspective (net
// worth is 0) and the extractor hasn't noted anything yet. Rather than a near-empty
// page, it sketches what each section will hold — the real labels with placeholder
// bars — so a new user knows what to expect and the page doesn't feel broken. It
// gives way to the real Perspective/Context blocks as soon as there's data.
function ProfilePreview() {
  const card: CSSProperties = {
    background: "var(--surface)",
    border: "0.5px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
  };
  const caption: CSSProperties = {
    fontSize: "var(--fs-caption)",
    color: "var(--text-faint)",
    lineHeight: "var(--lh-body)",
    margin: "var(--space-row) 2px var(--space-6)",
  };

  return (
    <div>
      {/* Intro — sets the expectation in the app's calm, serif voice. */}
      <p style={{
        fontFamily: "var(--font-display)",
        fontStyle: "italic",
        fontSize: "var(--fs-body)",
        color: "var(--text-dim)",
        lineHeight: "var(--lh-body)",
        margin: "0 0 24px",
        fontVariationSettings: "'opsz' 16",
      }}>
        This page is yours. As you add holdings and talk things through, a picture of
        where you stand and how you invest takes shape here.
      </p>

      {/* Perspective preview */}
      <div className="eyebrow" style={{ marginBottom: "var(--space-row)" }}>Perspective</div>
      <div style={{ ...card, padding: "var(--space-card)" }}>
        <GhostBar width={84} height={9} />
        <div style={{ height: 14 }} />
        <GhostBar width="52%" height={24} />
        <div style={{ height: "var(--space-4)" }} />
        <GhostBar width="100%" />
        <div style={{ height: "var(--space-2)" }} />
        <GhostBar width="78%" />
      </div>
      <p style={caption}>
        Where you stand and your 12-month trajectory appear here once you&apos;ve added a
        holding or two.
      </p>

      {/* Profile preview — the same fields the extractor fills from chat. */}
      <div className="eyebrow" style={{ marginBottom: "var(--space-row)" }}>Profile</div>
      <div style={card}>
        {PROFILE_FIELDS.map(({ key, label }, idx) => (
          <div
            key={key}
            style={{
              padding: "14px var(--space-card)",
              borderBottom: idx === PROFILE_FIELDS.length - 1 ? "none" : "0.5px solid var(--border)",
            }}
          >
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-subhead)",
              fontWeight: 500,
              letterSpacing: "var(--tracking-subhead)",
              color: "var(--text-faint)",
              marginBottom: "var(--space-row)",
              fontVariationSettings: "'opsz' 18",
            }}>
              {label}
            </div>
            <GhostBar width={idx % 2 === 0 ? "88%" : "66%"} />
          </div>
        ))}
      </div>
      <p style={caption}>
        Noted quietly as you chat — it stays on your device, never shared.
      </p>
    </div>
  );
}

export function ProfileContent({ fillWidth = false }: { fillWidth?: boolean } = {}) {
  const { user } = useUser();
  const userId = user?.id;
  const profile = useProfile(user?.id);
  const { netWorthEur, loading: nwLoading } = useNetWorth();
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("EUR");
  const [netWorth12moAgoEur, setNetWorth12moAgoEur] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("users")
      .select("display_currency")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_currency && isSupportedCurrency(data.display_currency)) {
          setDisplayCurrency(data.display_currency as DisplayCurrency);
        }
      });
  }, [user?.id]);

  // Trajectory baseline: hydrate instantly from cache when fresh (<24h); otherwise
  // fetch only a bounded window of snapshots around the 365-day target (a small
  // fraction of the full history) and cache the derived value. findBaselineSnapshot
  // + the MIN_BASELINE_AGE_DAYS guard are unchanged, so the chip's threshold matches.
  const loadBaseline = useCallback(() => {
    if (!userId) return;
    const cached = readBaselineCache(userId);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_BASELINE_TTL_MS) {
      if (cached.value != null) setNetWorth12moAgoEur(cached.value);
      return; // fresh — no snapshot refetch
    }
    const now = Date.now();
    const after = isoDay(now - 400 * 86_400_000);
    const before = isoDay(now - 300 * 86_400_000);
    apiFetch(`/api/snapshots?after=${after}&before=${before}`)
      .then((r) => r.json())
      .then(({ data }) => {
        const snaps = (data ?? []) as Snapshot[];
        const baseline = findBaselineSnapshot(snaps);
        if (baseline && baseline.ageDays >= MIN_BASELINE_AGE_DAYS) {
          setNetWorth12moAgoEur(baseline.snapshot.total_value);
          writeBaselineCache(userId, { value: baseline.snapshot.total_value, ageDays: baseline.ageDays, fetchedAt: Date.now() });
        } else {
          writeBaselineCache(userId, { value: null, ageDays: baseline?.ageDays ?? null, fetchedAt: Date.now() });
        }
      })
      .catch(() => {});
  }, [userId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadBaseline(); }, [loadBaseline]);

  const perspective = useMemo(() => {
    if (nwLoading || netWorthEur <= 0) return null;
    return computePerspective(netWorthEur, null, null, netWorth12moAgoEur);
  }, [netWorthEur, nwLoading, netWorth12moAgoEur]);

  const visibleFields = PROFILE_FIELDS.filter(({ key }) => !!(profile?.profile?.[key]));

  // ── Fold state — same grammar as Vitals: per-device overrides on top of
  // defaults (Perspective open, the rest folded; the trial CTA self-opens).
  const FOLDS_KEY = "volnar:profile-open";
  const [foldOverrides, setFoldOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FOLDS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setFoldOverrides(JSON.parse(raw));
    } catch {}
  }, []);
  function setFold(key: string, open: boolean) {
    setFoldOverrides((prev) => {
      const next = { ...prev, [key]: open };
      try { sessionStorage.setItem(FOLDS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Plan fold header — derived from the same subscription view the section
  // body renders, so the two never disagree. Hidden on the demo account and
  // while loading (SubscriptionSection renders null there too).
  const { data: subData, loading: subLoading, entitled } = useSubscription();
  const showPlan = !subLoading && !subData?.isDemo;
  const hasSub =
    subData != null &&
    (subData.status === "trialing" || subData.status === "active" || subData.status === "past_due");
  const planValue = hasSub
    ? (subData!.plan ? PLAN_LABEL[subData!.plan] : "Volnar")
    : entitled ? "Activating…" : "Free trial";
  const planDate = hasSub ? formatRenewalDate(renewalDate(subData!)) : null;
  const planSub = hasSub
    ? (planDate ? `${dateLabel(subData!).charAt(0).toLowerCase()}${dateLabel(subData!).slice(1)} ${planDate}` : STATUS_LABEL_FALLBACK)
    : entitled ? "one moment" : `${TRIAL_DAYS} days free`;

  // World percentile → the one folded takeaway ("top 9% worldwide").
  const worldRow = perspective?.rows.find((r) => r.region === "WORLD");
  const perspectiveSub = worldRow
    ? `top ${Math.max(1, Math.round(100 - worldRow.percentile))}% worldwide`
    : "your wealth today";

  const openPerspective = foldOverrides["perspective"] ?? true;
  const openContext = foldOverrides["context"] ?? false;
  const openPlan = foldOverrides["plan"] ?? !hasSub;

  return (
    <div style={fillWidth
      ? { maxWidth: "none", margin: 0, padding: 0 }
      // 660 column + shared bottom clearance — same shell as Overview/Vitals.
      : { maxWidth: 660, margin: "0 auto", padding: "0 0 var(--page-bottom-pad)" }}>

      {/* Name as page title + fingerprint as supporting line. Top spacing
          matches the Overview reference (pt-4 under the NavBar). */}
      <div style={{ paddingTop: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-title)",
          fontWeight: 500,
          letterSpacing: "var(--tracking-title)",
          color: "var(--hero)",
          lineHeight: "var(--lh-tight)",
          fontVariationSettings: "'opsz' 60",
          marginBottom: profile?.fingerprint ? 10 : 0,
        }}>
          {profile?.name || "Investor"}
        </div>
        {profile?.fingerprint && (
          <div style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: "var(--fs-body)",
            color: "var(--text-dim)",
            lineHeight: "var(--lh-body)",
            fontVariationSettings: "'opsz' 16",
          }}>
            {profile.fingerprint}
          </div>
        )}
      </div>

      {/* Zero-data state: a fresh account has no Perspective and no extracted
          context yet. Sketch what's coming so the page reads as intentional, not
          empty. Gated on net worth being resolved (not loading) so it never flashes
          for a user who actually has data. */}
      {!nwLoading && !perspective && visibleFields.length === 0 && <ProfilePreview />}

      {/* One "Your picture" section of foldable rows — the same grammar as
          Vitals: plain-language line, figure, chevron. Perspective (the page's
          one wow) arrives open; Context and Plan rest folded. */}
      {(perspective || visibleFields.length > 0 || showPlan) && (
        <div
          className="eyebrow"
          style={{ borderTop: "1px solid var(--border)", marginTop: "var(--space-5)", paddingTop: "var(--space-3)", marginBottom: "var(--space-1)" }}
        >
          Your picture
        </div>
      )}

      {perspective && (
        <FoldRow
          first
          title="Perspective"
          question="where you stand among households"
          value={formatMoney(netWorthEur, "EUR", displayCurrency)}
          sub={perspectiveSub}
          subTone="neutral"
          open={openPerspective}
          onToggle={() => setFold("perspective", !openPerspective)}
        >
          <PerspectiveCard data={perspective} displayCurrency={displayCurrency} frameless />
        </FoldRow>
      )}

      {/* Context — hidden entirely if the extractor hasn't populated any
          fields yet. Folded by default: personal notes aren't on screen every
          time the tab opens. */}
      {visibleFields.length > 0 && (
        <FoldRow
          first={!perspective}
          title="Context"
          question="what Volnar has noted about you"
          value={String(visibleFields.length)}
          sub={visibleFields.length === 1 ? "note" : "notes"}
          subTone="neutral"
          open={openContext}
          onToggle={() => setFold("context", !openContext)}
        >
          <div>
            {visibleFields.map(({ key, label }, idx) => {
              const value = profile?.profile?.[key];
              const isLast = idx === visibleFields.length - 1;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-3)",
                    padding: "14px 0",
                    borderBottom: isLast ? "none" : "0.5px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "var(--fs-subhead)",
                      fontWeight: 500,
                      letterSpacing: "var(--tracking-subhead)",
                      color: "var(--text)",
                      marginBottom: 3,
                      fontVariationSettings: "'opsz' 18",
                    }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "var(--fs-body)", color: "var(--text-dim)", lineHeight: "var(--lh-body)" }}>
                      {value?.split(/\.\.\s*/).filter(s => s.trim()).slice(0, 2).map((sentence, i) => (
                        <div key={i} style={{ marginBottom: "var(--space-1)" }}>{sentence.trim()}</div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", lineHeight: "var(--lh-body)", margin: "var(--space-1) 0 0" }}>
            Noted quietly as you chat — it stays with your account, never shared.
          </p>
        </FoldRow>
      )}

      {/* Plan — the subscription as a foldable row; the trial CTA self-opens
          so a non-subscriber still sees the offer. Hidden on the demo account. */}
      {showPlan && (
        <FoldRow
          first={!perspective && visibleFields.length === 0}
          title="Plan"
          question="your subscription"
          value={planValue}
          sub={planSub}
          subTone="neutral"
          open={openPlan}
          onToggle={() => setFold("plan", !openPlan)}
        >
          <SubscriptionSection embedded />
        </FoldRow>
      )}

      {/* Settings moved to the account panel (avatar, top-left of the nav bar)
          — the Profile tab is purely your picture now. */}

    </div>
  );
}
