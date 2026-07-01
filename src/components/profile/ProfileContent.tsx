"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useUser, useProfile, useNetWorth } from "@/lib/hooks";
import { createBrowserSupabase } from "@/lib/supabase";
import { isSupportedCurrency } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import { computePerspective } from "@/lib/vitals/perspective";
import { findBaselineSnapshot, MIN_BASELINE_AGE_DAYS } from "@/lib/vitals/realGrowth";
import { PerspectiveCard } from "@/components/perspective/PerspectiveCard";
import { SubscriptionSection } from "@/components/profile/SubscriptionSection";
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

const PROFILE_FIELDS = [
  { key: "life_and_direction", label: "Life and direction" },
  { key: "approach", label: "Approach" },
  { key: "currently_exploring", label: "Currently exploring" },
  { key: "worth_raising", label: "Worth raising" },
] as const;

function SettingsGearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

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
  const router = useRouter();
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

      {/* Perspective section */}
      {perspective && (
        <>
          <div className="eyebrow" style={{ marginBottom: "var(--space-row)" }}>
            Perspective
          </div>
          <PerspectiveCard data={perspective} displayCurrency={displayCurrency} />
        </>
      )}

      {/* Context section — hidden entirely if extractor hasn't populated any fields yet */}
      {visibleFields.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: "var(--space-row)" }}>
            Context
          </div>
          <div style={{
            background: "var(--surface)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            marginBottom: 24,
            overflow: "hidden",
          }}>
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
                    padding: "14px var(--space-card)",
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
        </>
      )}

      {/* Your subscription — plan, status, renewal date, source + Manage. */}
      <SubscriptionSection />

      {/* Settings — the only operational control on this page; everything else
          (preferences, account, Data & AI, deletion) lives behind it. */}
      <button
        onClick={() => router.push("/settings")}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-row)",
          padding: "14px var(--space-card)",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          cursor: "pointer",
          color: "var(--accent-text)",
        }}
      >
        <SettingsGearIcon size={18} />
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-subhead)",
          fontWeight: 500,
          letterSpacing: "var(--tracking-subhead)",
          fontVariationSettings: "'opsz' 18",
        }}>
          Settings
        </span>
      </button>

    </div>
  );
}
