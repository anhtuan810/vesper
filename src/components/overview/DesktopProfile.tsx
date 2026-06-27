"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser, useProfile, useNetWorth, useDisplayCurrency } from "@/lib/hooks";
import { computePerspective } from "@/lib/vitals/perspective";
import { findBaselineSnapshot, MIN_BASELINE_AGE_DAYS } from "@/lib/vitals/realGrowth";
import { PerspectiveCard } from "@/components/perspective/PerspectiveCard";
import { SubscriptionSection } from "@/components/profile/SubscriptionSection";
import { profileBaselineCacheKey, PROFILE_BASELINE_TTL_MS } from "@/lib/constants";
import type { Snapshot } from "@/lib/vitals/types";
import { apiFetch } from "@/lib/api";

const PROFILE_FIELDS = [
  { key: "life_and_direction", label: "Life and direction" },
  { key: "approach", label: "Approach" },
  { key: "currently_exploring", label: "Currently exploring" },
  { key: "worth_raising", label: "Worth raising" },
] as const;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
type BaselineCache = { value: number | null; ageDays: number | null; fetchedAt: number };
function readBaselineCache(userId: string): BaselineCache | null {
  try { const raw = sessionStorage.getItem(profileBaselineCacheKey(userId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeBaselineCache(userId: string, cache: BaselineCache): void {
  try { sessionStorage.setItem(profileBaselineCacheKey(userId), JSON.stringify(cache)); } catch {}
}

// Desktop Profile — the Twilight design over the live profile. Reuses the same
// data and the PerspectiveCard / SubscriptionSection components as the mobile
// ProfileContent (which is left untouched).
export function DesktopProfile() {
  const { user } = useUser();
  const userId = user?.id;
  const profile = useProfile(user?.id);
  const displayCurrency = useDisplayCurrency();
  const { netWorthEur, loading: nwLoading } = useNetWorth();
  const [netWorth12moAgoEur, setNetWorth12moAgoEur] = useState<number | null>(null);

  const loadBaseline = useCallback(() => {
    if (!userId) return;
    const cached = readBaselineCache(userId);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_BASELINE_TTL_MS) {
      if (cached.value != null) setNetWorth12moAgoEur(cached.value);
      return;
    }
    const now = Date.now();
    apiFetch(`/api/snapshots?after=${isoDay(now - 400 * 86_400_000)}&before=${isoDay(now - 300 * 86_400_000)}`)
      .then((r) => r.json())
      .then(({ data }) => {
        const baseline = findBaselineSnapshot((data ?? []) as Snapshot[]);
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

  const perspective = useMemo(
    () => (nwLoading || netWorthEur <= 0 ? null : computePerspective(netWorthEur, null, null, netWorth12moAgoEur)),
    [netWorthEur, nwLoading, netWorth12moAgoEur],
  );

  const visibleFields = PROFILE_FIELDS.filter(({ key }) => !!profile?.profile?.[key]);
  const isEmpty = !nwLoading && !perspective && visibleFields.length === 0;

  return (
    <>
      <div className="pf-head">
        <span className="eyebrow">Profile</span>
        <div className="pf-name">{profile?.name || "Investor"}</div>
        {profile?.fingerprint && <div className="pf-fp">{profile.fingerprint}</div>}
      </div>

      {isEmpty && (
        <p className="pf-intro">
          This page is yours. As you add holdings and talk things through, a picture of where you
          stand and how you invest takes shape here.
        </p>
      )}

      {perspective && (
        <div className="pf-sec">
          <span className="eyebrow">Perspective</span>
          <PerspectiveCard data={perspective} displayCurrency={displayCurrency} />
        </div>
      )}

      {visibleFields.length > 0 && (
        <div className="pf-sec">
          <span className="eyebrow">Context</span>
          <div className="pf-card">
            {visibleFields.map(({ key, label }) => {
              const value = profile?.profile?.[key];
              return (
                <div className="pf-field" key={key}>
                  <h4>{label}</h4>
                  {value?.split(/\.\.\s*/).filter((s) => s.trim()).slice(0, 2).map((sentence, i) => (
                    <p key={i}>{sentence.trim()}</p>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="pf-sec">
        <SubscriptionSection />
      </div>

      <Link href="/settings" className="pf-settings">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Settings
      </Link>
    </>
  );
}
