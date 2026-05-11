"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useProfile, useSignOut, useTheme } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { InlineEdit } from "@/components/InlineEdit";
import { createBrowserSupabase } from "@/lib/supabase";
import { uploadAvatar } from "@/lib/avatar-upload";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";

const supabase = createBrowserSupabase();

const CURRENCY_DISPLAY: Record<DisplayCurrency, { symbol: string; label: string }> = {
  EUR: { symbol: "€", label: "Euro" },
  USD: { symbol: "$", label: "US Dollar" },
  GBP: { symbol: "£", label: "British Pound" },
};

const THEME_OPTIONS = [
  { value: "auto" as const, label: "Auto" },
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
];

const TOAST_KEY = "vesper.currency.toastSeen";

const PROFILE_FIELDS = [
  { key: "goal", label: "Financial Goal" },
  { key: "risk_behaviour", label: "Risk Behaviour" },
  { key: "investment_style", label: "Investment Style" },
  { key: "life_context", label: "Life Context" },
  { key: "concerns", label: "Concerns" },
  { key: "preferences", label: "Preferences" },
  { key: "blind_spots", label: "Blind Spots" },
  { key: "decision_patterns", label: "Decision Patterns" },
  { key: "interests", label: "Interests" },
] as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const profile = useProfile(user?.id);
  const signOut = useSignOut();
  const { theme: currentTheme, setTheme } = useTheme();
  const [mutationCount, setMutationCount] = useState(0);
  const [profileData, setProfileData] = useState<Record<string, string>>({});
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("EUR");
  const [currencyLoading, setCurrencyLoading] = useState<DisplayCurrency | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(undefined);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [expandedPref, setExpandedPref] = useState<"currency" | "theme" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.profile) setProfileData(profile.profile);
  }, [profile]);

  const updateField = useCallback(async (key: string, value: string | null): Promise<string | null> => {
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { [key]: value } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.error ?? "Save failed";
      }
      setProfileData((prev) => {
        const next = { ...prev };
        if (value === null) delete next[key];
        else next[key] = value;
        return next;
      });
      return null;
    } catch {
      return "Save failed";
    }
  }, []);

  const handleAvatarFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    e.target.value = "";
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const url = await uploadAvatar(file, user.id);
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAvatarError(data.error ?? "Failed to save avatar.");
      } else {
        setAvatarUrl(url);
      }
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setAvatarUploading(false);
    }
  }, [user?.id]);

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

  const setTab = (t: "portfolio" | "diary" | "profile") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="h-14 bg-surface border-b border-border" />
      </div>
    );
  }

  const displayedAvatar = avatarUrl !== undefined ? avatarUrl : profile?.avatar_url;
  const currencyLabel = `${CURRENCY_DISPLAY[displayCurrency].label} (${CURRENCY_DISPLAY[displayCurrency].symbol})`;
  const themeLabel = THEME_OPTIONS.find(o => o.value === currentTheme)?.label ?? "Auto";

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
      />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 22px 110px" }}>

        {/* Page title */}
        <div style={{ marginBottom: 26, paddingTop: 32 }}>
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            color: "var(--hero)",
            lineHeight: 1,
            fontVariationSettings: "'opsz' 60",
          }}>
            Profile
          </div>
        </div>

        {/* Identity block */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "14px 0 22px",
          borderBottom: "0.5px solid var(--border)",
          marginBottom: 22,
        }}>
          {/* Avatar */}
          <div style={{ position: "relative", width: 78, height: 78, marginBottom: 14 }}>
            <button
              type="button"
              aria-label="Change avatar"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background: "var(--accent)",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {displayedAvatar ? (
                <img
                  src={displayedAvatar}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", opacity: avatarUploading ? 0.4 : 1 }}
                />
              ) : (
                <span style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 26,
                  fontWeight: 500,
                  color: "var(--bg)",
                  opacity: avatarUploading ? 0.4 : 1,
                  fontVariationSettings: "'opsz' 24",
                  userSelect: "none",
                }}>
                  {getInitials(profile?.name || "?")}
                </span>
              )}
              {avatarUploading && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                </div>
              )}
            </button>
            {/* Camera badge */}
            <div style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "var(--bg)",
              border: "1.5px solid var(--surface-elev)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              pointerEvents: "none",
            }}>
              <svg width="13" height="13" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
                <path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Z"/>
                <circle cx="128" cy="132" r="36"/>
              </svg>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleAvatarFileChange}
          />

          {/* Name */}
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--hero)",
            letterSpacing: "-0.01em",
            marginBottom: 4,
            fontVariationSettings: "'opsz' 24",
          }}>
            {profile?.name || "Investor"}
          </div>

          {/* Email */}
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: profile?.fingerprint ? 14 : 0 }}>
            {user?.email}
          </div>

          {/* Fingerprint */}
          {profile?.fingerprint && (
            <div style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--text-dim)",
              lineHeight: 1.45,
              textAlign: "center",
              maxWidth: 280,
              fontVariationSettings: "'opsz' 16",
            }}>
              {profile.fingerprint}
            </div>
          )}

          {avatarError && (
            <div style={{ fontSize: 11, color: "var(--negative)", marginTop: 8 }}>
              {avatarError}
            </div>
          )}
        </div>

        {/* Context section */}
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
          {PROFILE_FIELDS.map(({ key, label }, idx) => {
            const value = profileData[key] ?? null;
            const isLast = idx === PROFILE_FIELDS.length - 1;
            return (
              <InlineEdit
                key={key}
                display={
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    borderBottom: isLast ? "none" : "0.5px solid var(--border)",
                    width: "100%",
                    boxSizing: "border-box",
                  }}>
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
                      <div style={{
                        fontSize: 13,
                        color: value ? "var(--text-dim)" : "var(--text-faint)",
                        fontStyle: value ? "normal" : "italic",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.35,
                      }}>
                        {value || "Not yet shared"}
                      </div>
                    </div>
                    <ChevronRight />
                  </div>
                }
                rawValue={value ?? ""}
                displayStyle={{ borderBottom: isLast ? "none" : "0.5px solid var(--border)" }}
                onSave={async (raw) => {
                  const trimmed = raw.trim();
                  if (trimmed.length > 500) return "Max 500 characters";
                  if (trimmed === (profileData[key] ?? "")) return "";
                  return updateField(key, trimmed === "" ? null : trimmed);
                }}
              />
            );
          })}
        </div>

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

        {/* Sign out */}
        <div style={{ display: "flex", justifyContent: "center", padding: "18px 0 8px" }}>
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
