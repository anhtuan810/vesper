"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useProfile, useSignOut, useTheme, useNetWorth } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { createBrowserSupabase } from "@/lib/supabase";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import { computePerspective } from "@/lib/vitals/perspective";
import { findBaselineSnapshot, MIN_BASELINE_AGE_DAYS } from "@/lib/vitals/realGrowth";
import { PerspectiveCard } from "@/components/perspective/PerspectiveCard";
import type { Snapshot } from "@/lib/vitals/types";

const supabase = createBrowserSupabase();

const CURRENCY_DISPLAY: Record<DisplayCurrency, { symbol: string; label: string }> = {
  EUR: { symbol: "€", label: "Euro" },
  USD: { symbol: "$", label: "US Dollar" },
  GBP: { symbol: "£", label: "British Pound" },
};

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
];

const TOAST_KEY = "volnar.currency.toastSeen";

const PROFILE_FIELDS = [
  { key: "life_and_direction", label: "Life and direction" },
  { key: "approach", label: "Approach" },
  { key: "currently_exploring", label: "Currently exploring" },
  { key: "worth_raising", label: "Worth raising" },
] as const;

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

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const profile = useProfile(user?.id);
  const signOut = useSignOut();
  const { theme: currentTheme, setTheme } = useTheme();
  const { netWorthEur, loading: nwLoading } = useNetWorth();
  const [mutationCount, setMutationCount] = useState(0);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("EUR");
  const [currencyLoading, setCurrencyLoading] = useState<DisplayCurrency | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [expandedPref, setExpandedPref] = useState<"currency" | "theme" | null>(null);
  const [netWorth12moAgoEur, setNetWorth12moAgoEur] = useState<number | null>(null);

  const fetchMutationCount = useCallback(async () => {
    if (!user?.id) return;
    const { count } = await supabase
      .from("mutations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setMutationCount(count ?? 0);
  }, [user?.id]);

  useEffect(() => { fetchMutationCount(); }, [fetchMutationCount]);

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

  useEffect(() => {
    fetch("/api/snapshots?range=All")
      .then((r) => r.json())
      .then(({ data }) => {
        const snaps = (data ?? []) as Snapshot[];
        const baseline = findBaselineSnapshot(snaps);
        if (baseline && baseline.ageDays >= MIN_BASELINE_AGE_DAYS) {
          setNetWorth12moAgoEur(baseline.snapshot.total_value);
        }
      })
      .catch(() => {});
  }, []);

  const perspective = useMemo(() => {
    if (nwLoading || netWorthEur <= 0) return null;
    return computePerspective(netWorthEur, null, null, netWorth12moAgoEur);
  }, [netWorthEur, nwLoading, netWorth12moAgoEur]);

  const handleCurrencySelect = useCallback(async (currency: DisplayCurrency) => {
    if (currency === displayCurrency || currencyLoading) return;
    setCurrencyLoading(currency);
    setCurrencyError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_currency: currency }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCurrencyError(data.error ?? "Failed to update currency");
      } else {
        setDisplayCurrency(currency);
        setExpandedPref(null);
        if (currency !== "EUR" && !localStorage.getItem(TOAST_KEY)) {
          localStorage.setItem(TOAST_KEY, "1");
          setToastVisible(true);
          setTimeout(() => setToastVisible(false), 4000);
        }
        router.refresh();
      }
    } catch {
      setCurrencyError("Failed to update currency");
    } finally {
      setCurrencyLoading(null);
    }
  }, [displayCurrency, currencyLoading, router]);

  if (userLoading) {
    return (
      <div className="min-h-screen bg-bg" />
    );
  }

  const currencyLabel = `${CURRENCY_DISPLAY[displayCurrency].label} (${CURRENCY_DISPLAY[displayCurrency].symbol})`;
  const themeLabel = THEME_OPTIONS.find(o => o.value === currentTheme)?.label ?? "Light";
  const visibleFields = PROFILE_FIELDS.filter(({ key }) => !!(profile?.profile?.[key]));

  const setTab = (t: "portfolio" | "diary" | "profile" | "vitals") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  return (
    <div className="min-h-screen bg-bg">
      <NavBar
        tab="profile"
        setTab={setTab}
        mutationCount={mutationCount}
        liveCount={0}
        totalSymbols={0}
        refreshing={false}
        refreshPrices={() => {}}
        empty
      />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 0 110px" }}>

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

        {/* Preferences section */}
        <div style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          marginBottom: 10,
        }}>
          Preferences
        </div>
        <div style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: 14,
          marginBottom: 24,
          overflow: "hidden",
        }}>
          {/* Display currency row */}
          <div style={{ borderBottom: "0.5px solid var(--border)" }}>
            <button
              onClick={() => setExpandedPref(expandedPref === "currency" ? null : "currency")}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 16,
                  fontWeight: 500,
                  color: "var(--text)",
                  fontVariationSettings: "'opsz' 18",
                }}>
                  Display currency
                </div>
              </div>
              <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, flexShrink: 0 }}>
                {currencyLabel}
              </span>
              <ChevronRight />
            </button>
            {expandedPref === "currency" && (
              <div style={{ padding: "0 16px 14px" }}>
                {SUPPORTED_CURRENCIES.map((currency) => {
                  const { symbol, label } = CURRENCY_DISPLAY[currency];
                  const isActive = displayCurrency === currency;
                  const isLoading = currencyLoading === currency;
                  return (
                    <button
                      key={currency}
                      onClick={() => handleCurrencySelect(currency)}
                      disabled={!!currencyLoading}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                        background: isActive ? "var(--accent-soft)" : "var(--bg)",
                        cursor: currencyLoading ? "default" : "pointer",
                        marginBottom: 6,
                        textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16, fontWeight: 500, color: isActive ? "var(--accent-text)" : "var(--text-dim)", width: 20, textAlign: "center" }}>
                          {symbol}
                        </span>
                        <span style={{ fontSize: 13, color: isActive ? "var(--accent-text)" : "var(--text)" }}>
                          {label}
                        </span>
                      </div>
                      {isLoading ? (
                        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Saving…</span>
                      ) : isActive ? (
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
                      ) : null}
                    </button>
                  );
                })}
                {currencyError && (
                  <div style={{ fontSize: 11, color: "var(--negative)", marginTop: 4 }}>{currencyError}</div>
                )}
              </div>
            )}
          </div>

          {/* Theme row */}
          <div>
            <button
              onClick={() => setExpandedPref(expandedPref === "theme" ? null : "theme")}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 16,
                  fontWeight: 500,
                  color: "var(--text)",
                  fontVariationSettings: "'opsz' 18",
                }}>
                  Theme
                </div>
              </div>
              <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, flexShrink: 0 }}>
                {themeLabel}
              </span>
              <ChevronRight />
            </button>
            {expandedPref === "theme" && (
              <div style={{ padding: "0 16px 14px" }}>
                {THEME_OPTIONS.map(({ value, label }) => {
                  const isActive = currentTheme === value;
                  return (
                    <button
                      key={value}
                      onClick={() => { setTheme(value); setExpandedPref(null); }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                        background: isActive ? "var(--accent-soft)" : "var(--bg)",
                        cursor: "pointer",
                        marginBottom: 6,
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 13, color: isActive ? "var(--accent-text)" : "var(--text)" }}>
                        {label}
                      </span>
                      {isActive && (
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Account — email + sign out */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 0 8px", gap: 8 }}>
          {user?.email && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-sans)" }}>
              {user.email}
            </div>
          )}
          <button
            onClick={signOut}
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--negative)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Sign out
          </button>
          <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
            Volnar provides informational portfolio observations, not investment advice.
          </div>
        </div>

      </div>

      {toastVisible && (
        <div
          style={{
            position: "fixed",
            bottom: 88,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: "10px 18px",
            fontSize: 12,
            color: "var(--text-dim)",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            zIndex: 50,
            fontFamily: "var(--font-sans)",
          }}
        >
          Display only — your portfolio is unchanged.
        </div>
      )}

    </div>
  );
}
