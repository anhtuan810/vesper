"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useSignOut, useTheme } from "@/lib/hooks";
import { useSubscription } from "@/components/SubscriptionProvider";
import { createBrowserSupabase } from "@/lib/supabase";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import type { SubscriptionSource } from "@/lib/subscription";
import { NativeSettingsRows } from "@/components/profile/NativeSettingsRows";
import { apiFetch } from "@/lib/api";

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
const SECTION_LABEL_STYLE = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
  color: "var(--text-faint)",
  marginBottom: 10,
};

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

// Deleting the Volnar account never cancels the underlying paid subscription:
// store subscriptions (App Store / Play) can only be cancelled by the user in
// their store settings — there is no developer API for it — and a web (Stripe)
// subscription must be cancelled before deletion. Surfaced in the delete dialog
// so a user can't unknowingly keep being billed for an account that's gone.
function subscriptionDeletionNotice(source: SubscriptionSource | null): string {
  if (source === "app_store")
    return "Deleting your account does not cancel your App Store subscription. To stop being billed, cancel it in Settings → your name → Subscriptions on your device.";
  if (source === "play_store")
    return "Deleting your account does not cancel your Google Play subscription. To stop being billed, cancel it in the Play Store under Payments & subscriptions.";
  // Web / Stripe.
  return "Deleting your account does not cancel your subscription. To stop being billed, cancel it first from “Manage subscription” on your profile.";
}

function BackArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="160 208 80 128 160 48" />
    </svg>
  );
}

export function SettingsContent() {
  const router = useRouter();
  const { user, aiConsentAt } = useUser();
  const { data: subscription } = useSubscription();
  const activeSubSource =
    subscription && (subscription.status === "trialing" || subscription.status === "active")
      ? subscription.source
      : undefined;
  const signOut = useSignOut();
  const { theme: currentTheme, setTheme } = useTheme();
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("EUR");
  const [currencyLoading, setCurrencyLoading] = useState<DisplayCurrency | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [expandedPref, setExpandedPref] = useState<"currency" | "theme" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      const res = await apiFetch("/api/users/me", {
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

  const closeDeleteDialog = useCallback(() => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteConfirmText("");
    setDeleteError(null);
  }, [deleting]);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== "DELETE" || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch("/api/users/me", { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("We could not complete the deletion. Please try again in a moment.");
        setDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      setDeleteError("We could not complete the deletion. Please try again in a moment.");
      setDeleting(false);
    }
  }, [deleteConfirmText, deleting, router]);

  const currencyLabel = `${CURRENCY_DISPLAY[displayCurrency].label} (${CURRENCY_DISPLAY[displayCurrency].symbol})`;
  const themeLabel = THEME_OPTIONS.find(o => o.value === currentTheme)?.label ?? "Light";

  return (
    <div className="min-h-screen bg-bg" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 0 110px" }}>

        {/* Back + page title */}
        <div style={{ padding: "12px 0 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -6, color: "var(--text)", background: "none", border: "none", cursor: "pointer" }}
            aria-label="Back"
          >
            <BackArrow />
          </button>
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--hero)",
            fontVariationSettings: "'opsz' 30",
          }}>
            Settings
          </div>
        </div>

        {/* Preferences section */}
        <div style={SECTION_LABEL_STYLE}>Preferences</div>
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

          {/* Native-only rows: Face ID lock + notifications */}
          <NativeSettingsRows />
        </div>

        {/* Account — email + sign out */}
        <div style={SECTION_LABEL_STYLE}>Account</div>
        <div style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: 14,
          marginBottom: 24,
          overflow: "hidden",
        }}>
          {user?.email && (
            <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border)", fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--font-sans)" }}>
              {user.email}
            </div>
          )}
          <button
            onClick={signOut}
            style={{
              width: "100%",
              padding: "14px 16px",
              textAlign: "left",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--negative)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Sign out
          </button>
        </div>

        {/* Data & AI — short, generic standing disclosure */}
        <div style={SECTION_LABEL_STYLE}>Data &amp; AI</div>
        <div style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: 14,
          marginBottom: 24,
          padding: "14px 16px",
        }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
            Volnar uses AI to power chat and insights. Your data is never used to
            train AI models.{" "}
            <a
              href="https://volnar.nl/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Privacy Policy
            </a>
          </div>
          {aiConsentAt && (
            <div style={{
              fontSize: 11,
              color: "var(--text-faint)",
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
              AI processing acknowledged
            </div>
          )}
        </div>

        {/* Legal note + delete */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "4px 0" }}>
          <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center", maxWidth: 320 }}>
            Volnar provides informational portfolio observations, not investment advice.
          </div>
          <button
            onClick={() => setDeleteOpen(true)}
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "var(--text-faint)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Delete account
          </button>
        </div>
      </div>

      {deleteOpen && (
        <div
          onClick={closeDeleteDialog}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              background: "var(--surface)",
              border: "0.5px solid var(--border)",
              borderRadius: 16,
              padding: "22px 20px 20px",
              fontFamily: "var(--font-sans)",
            }}
          >
            <div style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              fontWeight: 500,
              color: "var(--text)",
              marginBottom: 10,
              fontVariationSettings: "'opsz' 24",
            }}>
              Delete account
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55, marginBottom: 16 }}>
              This is permanent and cannot be undone. It removes all of your portfolio
              data, diary entries, and chat history. To continue, type DELETE below.
            </div>
            {activeSubSource !== undefined && (
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--amber-deep, var(--negative-text))",
                  lineHeight: 1.5,
                  background: "rgba(201,122,110,0.08)",
                  border: "1px solid rgba(201,122,110,0.18)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 16,
                }}
              >
                {subscriptionDeletionNotice(activeSubSource)}
              </div>
            )}
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={deleting}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 14,
                fontFamily: "var(--font-sans)",
                marginBottom: 14,
              }}
            />
            {deleteError && (
              <div style={{ fontSize: 12, color: "var(--negative)", marginBottom: 12, lineHeight: 1.5 }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={closeDeleteDialog}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: deleting ? "default" : "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deleting}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 10,
                  border: "1px solid var(--negative)",
                  background: deleteConfirmText === "DELETE" && !deleting ? "var(--negative-soft)" : "var(--bg)",
                  color: deleteConfirmText === "DELETE" && !deleting ? "var(--negative-text)" : "var(--text-faint)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: deleteConfirmText === "DELETE" && !deleting ? "pointer" : "default",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {deleting ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}

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
