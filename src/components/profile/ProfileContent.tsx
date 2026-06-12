"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useProfile, useNetWorth } from "@/lib/hooks";
import { createBrowserSupabase } from "@/lib/supabase";
import { isSupportedCurrency } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import { computePerspective } from "@/lib/vitals/perspective";
import { findBaselineSnapshot, MIN_BASELINE_AGE_DAYS } from "@/lib/vitals/realGrowth";
import { PerspectiveCard } from "@/components/perspective/PerspectiveCard";
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

function ChevronRight() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 256 256" fill="none"
      stroke="currentColor" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--text-faint)", flexShrink: 0 }}
    >
      <polyline points="96 48 176 128 96 208" />
    </svg>
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
      : { maxWidth: 520, margin: "0 auto", padding: "0 0 110px" }}>

      {/* Name as page title + fingerprint as supporting line */}
      <div style={{ paddingTop: 32, marginBottom: 26 }}>
        <div style={{
          fontFamily: "var(--font-serif)",
          fontSize: 38,
          fontWeight: 500,
          letterSpacing: "-0.025em",
          color: "var(--hero)",
          lineHeight: 1,
          fontVariationSettings: "'opsz' 60",
          marginBottom: profile?.fingerprint ? 10 : 0,
        }}>
          {profile?.name || "Investor"}
        </div>
        {profile?.fingerprint && (
          <div style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 15,
            color: "var(--text-dim)",
            lineHeight: 1.45,
            fontVariationSettings: "'opsz' 16",
          }}>
            {profile.fingerprint}
          </div>
        )}
      </div>

      {/* Perspective section */}
      {perspective && (
        <>
          <div style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--text-faint)",
            marginBottom: 10,
          }}>
            Perspective
          </div>
          <PerspectiveCard data={perspective} displayCurrency={displayCurrency} />
        </>
      )}

      {/* Context section — hidden entirely if extractor hasn't populated any fields yet */}
      {visibleFields.length > 0 && (
        <>
          <div style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--text-faint)",
            marginBottom: 10,
          }}>
            Context
          </div>
          <div style={{
            background: "var(--surface)",
            border: "0.5px solid var(--border)",
            borderRadius: 14,
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
                    gap: 12,
                    padding: "14px 16px",
                    borderBottom: isLast ? "none" : "0.5px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: 16,
                      fontWeight: 500,
                      color: "var(--text)",
                      marginBottom: 3,
                      fontVariationSettings: "'opsz' 18",
                    }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55 }}>
                      {value?.split(/\.\.\s*/).filter(s => s.trim()).slice(0, 2).map((sentence, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>{sentence.trim()}</div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Settings — the only operational control on this page; everything else
          (preferences, account, Data & AI, deletion) lives behind it. */}
      <button
        onClick={() => router.push("/settings")}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: 14,
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text-dim)",
        }}
      >
        <SettingsGearIcon size={18} />
        <span style={{
          flex: 1,
          fontFamily: "var(--font-serif)",
          fontSize: 16,
          fontWeight: 500,
          color: "var(--text)",
          fontVariationSettings: "'opsz' 18",
        }}>
          Settings
        </span>
        <ChevronRight />
      </button>

    </div>
  );
}
