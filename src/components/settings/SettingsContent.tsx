"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useSignOut, useTheme } from "@/lib/hooks";
import { useSubscription } from "@/components/SubscriptionProvider";
import { createBrowserSupabase } from "@/lib/supabase";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import type { SubscriptionSource, SubscriptionStatus } from "@/lib/subscription";
import { NativeSettingsRows } from "@/components/profile/NativeSettingsRows";
import { apiFetch } from "@/lib/api";
import { DISCLAIMER_TEXT } from "@/lib/claude";

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
const SECTION_LABEL_STYLE = { marginBottom: 10 };

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

// Billing notice for the delete dialog. Store subscriptions (App Store / Play) can
// only be cancelled by the user in their store settings — there is no developer API
// — so warn them; a web (Stripe) subscription is cancelled automatically as part of
// deletion (see DELETE /api/users/me), so reassure rather than warn. Returned for
// any subscription that could still be billing; null once it has already ended, so
// the dialog stays uncluttered when there's nothing to act on.
function subscriptionDeletionNotice(
  source: SubscriptionSource | null,
  status: SubscriptionStatus | null,
): string | null {
  // Already ended → no further billing either way, nothing to warn about.
  if (!status || status === "expired" || status === "canceled") return null;
  if (source === "app_store")
    return "Deleting your account does not cancel your App Store subscription. To stop being billed, cancel it in Settings → your name → Subscriptions on your device.";
  if (source === "play_store")
    return "Deleting your account does not cancel your Google Play subscription. To stop being billed, cancel it in the Play Store under Payments & subscriptions.";
  // Web / Stripe — cancelled automatically when the account is deleted.
  return "Deleting your account also cancels your web subscription, so you won’t be billed again.";
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
  // The shared demo/review account hides real billing surfaces (subscription card,
  // delete account) and swaps Sign out for a path to a real subscription.
  const isDemo = subscription?.isDemo ?? false;
  const deletionNotice = subscription
    ? subscriptionDeletionNotice(subscription.source, subscription.status)
    : null;
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
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-title)",
            fontWeight: 500,
            letterSpacing: "var(--tracking-title)",
            color: "var(--hero)",
            fontVariationSettings: "'opsz' 30",
          }}>
            Settings
          </div>
        </div>

        {/* Preferences section */}
        <div className="eyebrow" style={SECTION_LABEL_STYLE}>Preferences</div>
        <div style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-lg)",
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
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--fs-subhead)",
                  fontWeight: 500,
                  letterSpacing: "var(--tracking-subhead)",
                  color: "var(--text)",
                  fontVariationSettings: "'opsz' 18",
                }}>
                  Display currency
                </div>
              </div>
              <span className="tnum" style={{ fontSize: "var(--fs-meta)", color: "var(--text)", fontWeight: 500, flexShrink: 0 }}>
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
                        borderRadius: "var(--radius-md)",
                        border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                        background: isActive ? "var(--accent-soft)" : "var(--bg)",
                        cursor: currencyLoading ? "default" : "pointer",
                        marginBottom: 6,
                        textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: "var(--fs-subhead)", fontWeight: 500, color: isActive ? "var(--accent-text)" : "var(--text-dim)", width: 20, textAlign: "center" }}>
                          {symbol}
                        </span>
                        <span style={{ fontSize: "var(--fs-meta)", color: isActive ? "var(--accent-text)" : "var(--text)" }}>
                          {label}
                        </span>
                      </div>
                      {isLoading ? (
                        <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)" }}>Saving…</span>
                      ) : isActive ? (
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
                      ) : null}
                    </button>
                  );
                })}
                {currencyError && (
                  <div style={{ fontSize: "var(--fs-caption)", color: "var(--negative)", marginTop: 4 }}>{currencyError}</div>
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
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--fs-subhead)",
                  fontWeight: 500,
                  letterSpacing: "var(--tracking-subhead)",
                  color: "var(--text)",
                  fontVariationSettings: "'opsz' 18",
                }}>
                  Theme
                </div>
              </div>
              <span className="tnum" style={{ fontSize: "var(--fs-meta)", color: "var(--text)", fontWeight: 500, flexShrink: 0 }}>
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
                        borderRadius: "var(--radius-md)",
                        border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                        background: isActive ? "var(--accent-soft)" : "var(--bg)",
                        cursor: "pointer",
                        marginBottom: 6,
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: "var(--fs-meta)", color: isActive ? "var(--accent-text)" : "var(--text)" }}>
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

        {/* Account — email + sign out. On the demo account: a note + a path to a
            real subscription (sign out, then create your own account → paywall). */}
        <div className="eyebrow" style={SECTION_LABEL_STYLE}>Account</div>
        <div style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          marginBottom: 24,
          overflow: "hidden",
        }}>
          {isDemo ? (
            <>
              <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border)", fontSize: "var(--fs-caption)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", fontFamily: "var(--font-ui)" }}>
                You’re exploring a live demo account. Start your own subscription to track your real portfolio.
              </div>
              <button
                onClick={signOut}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  textAlign: "left",
                  fontSize: "var(--fs-body)",
                  fontWeight: 600,
                  color: "var(--accent)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Start your subscription
              </button>
            </>
          ) : (
            <>
              {user?.email && (
                <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border)", fontSize: "var(--fs-caption)", color: "var(--text-dim)", fontFamily: "var(--font-ui)" }}>
                  {user.email}
                </div>
              )}
              <button
                onClick={signOut}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  textAlign: "left",
                  fontSize: "var(--fs-body)",
                  fontWeight: 500,
                  color: "var(--negative)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>

        {/* Data & AI — short, generic standing disclosure */}
        <div className="eyebrow" style={SECTION_LABEL_STYLE}>Data &amp; AI</div>
        <div style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          marginBottom: 24,
          padding: "14px 16px",
        }}>
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)", lineHeight: "var(--lh-body)" }}>
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
              fontSize: "var(--fs-caption)",
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
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", textAlign: "center", maxWidth: 320, lineHeight: "var(--lh-body)" }}>
            {DISCLAIMER_TEXT}{" "}
            <a
              href="https://volnar.nl/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Terms
            </a>
          </div>
          {/* No account deletion on the shared demo account. */}
          {!isDemo && (
            <button
              onClick={() => setDeleteOpen(true)}
              style={{
                fontSize: "var(--fs-caption)",
                fontWeight: 400,
                color: "var(--text-faint)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Delete account
            </button>
          )}
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
              borderRadius: "var(--radius-lg)",
              padding: "22px 20px 20px",
              fontFamily: "var(--font-ui)",
            }}
          >
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-subhead)",
              fontWeight: 500,
              letterSpacing: "var(--tracking-subhead)",
              color: "var(--text)",
              marginBottom: 10,
              fontVariationSettings: "'opsz' 24",
            }}>
              Delete account
            </div>
            <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", marginBottom: 16 }}>
              This is permanent and cannot be undone. It removes all of your portfolio
              data, diary entries, and chat history. To continue, type DELETE below.
            </div>
            {deletionNotice && (
              <div
                style={{
                  fontSize: "var(--fs-caption)",
                  color: "var(--amber-deep, var(--negative-text))",
                  lineHeight: "var(--lh-body)",
                  background: "rgba(175,85,48,0.08)",
                  border: "1px solid rgba(175,85,48,0.18)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  marginBottom: 16,
                }}
              >
                {deletionNotice}
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
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "var(--fs-body)",
                fontFamily: "var(--font-ui)",
                marginBottom: 14,
              }}
            />
            {deleteError && (
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--negative)", marginBottom: 12, lineHeight: "var(--lh-body)" }}>
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
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: "var(--fs-body)",
                  fontWeight: 500,
                  cursor: deleting ? "default" : "pointer",
                  fontFamily: "var(--font-ui)",
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
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--negative)",
                  background: deleteConfirmText === "DELETE" && !deleting ? "var(--negative-soft)" : "var(--bg)",
                  color: deleteConfirmText === "DELETE" && !deleting ? "var(--negative-text)" : "var(--text-faint)",
                  fontSize: "var(--fs-body)",
                  fontWeight: 500,
                  cursor: deleteConfirmText === "DELETE" && !deleting ? "pointer" : "default",
                  fontFamily: "var(--font-ui)",
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
            borderRadius: "var(--radius-md)",
            padding: "10px 18px",
            fontSize: "var(--fs-caption)",
            color: "var(--text-dim)",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-soft)",
            zIndex: 50,
            fontFamily: "var(--font-ui)",
          }}
        >
          Display only — your portfolio is unchanged.
        </div>
      )}
    </div>
  );
}
