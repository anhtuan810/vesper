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

// Same billing notice the mobile SettingsContent shows in the delete dialog.
function subscriptionDeletionNotice(source: SubscriptionSource | null, status: SubscriptionStatus | null): string | null {
  if (!status || status === "expired" || status === "canceled") return null;
  if (source === "app_store") return "Deleting your account does not cancel your App Store subscription. To stop being billed, cancel it in Settings → your name → Subscriptions on your device.";
  if (source === "play_store") return "Deleting your account does not cancel your Google Play subscription. To stop being billed, cancel it in the Play Store under Payments & subscriptions.";
  return "Deleting your account also cancels your web subscription, so you won’t be billed again.";
}

function Chevron() {
  return <svg className="st-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
}

// Desktop Settings — the Twilight design over the same settings logic as the
// mobile SettingsContent (which is left untouched): currency, theme, account,
// Data & AI, and account deletion. Handlers are copied verbatim for safety.
export function DesktopSettings() {
  const router = useRouter();
  const { user, aiConsentAt } = useUser();
  const { data: subscription } = useSubscription();
  const isDemo = subscription?.isDemo ?? false;
  const deletionNotice = subscription ? subscriptionDeletionNotice(subscription.source, subscription.status) : null;
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
    supabase.from("users").select("display_currency").eq("id", user.id).single().then(({ data }) => {
      if (data?.display_currency && isSupportedCurrency(data.display_currency)) setDisplayCurrency(data.display_currency as DisplayCurrency);
    });
  }, [user?.id]);

  const handleCurrencySelect = useCallback(async (currency: DisplayCurrency) => {
    if (currency === displayCurrency || currencyLoading) return;
    setCurrencyLoading(currency);
    setCurrencyError(null);
    try {
      const res = await apiFetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_currency: currency }) });
      if (!res.ok) { const data = await res.json(); setCurrencyError(data.error ?? "Failed to update currency"); }
      else {
        setDisplayCurrency(currency);
        setExpandedPref(null);
        if (currency !== "EUR" && !localStorage.getItem(TOAST_KEY)) {
          localStorage.setItem(TOAST_KEY, "1");
          setToastVisible(true);
          setTimeout(() => setToastVisible(false), 4000);
        }
        router.refresh();
      }
    } catch { setCurrencyError("Failed to update currency"); }
    finally { setCurrencyLoading(null); }
  }, [displayCurrency, currencyLoading, router]);

  const closeDeleteDialog = useCallback(() => {
    if (deleting) return;
    setDeleteOpen(false); setDeleteConfirmText(""); setDeleteError(null);
  }, [deleting]);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== "DELETE" || deleting) return;
    setDeleting(true); setDeleteError(null);
    try {
      const res = await apiFetch("/api/users/me", { method: "DELETE" });
      if (!res.ok) { setDeleteError("We could not complete the deletion. Please try again in a moment."); setDeleting(false); return; }
      await supabase.auth.signOut();
      router.replace("/login");
    } catch { setDeleteError("We could not complete the deletion. Please try again in a moment."); setDeleting(false); }
  }, [deleteConfirmText, deleting, router]);

  const currencyLabel = `${CURRENCY_DISPLAY[displayCurrency].label} (${CURRENCY_DISPLAY[displayCurrency].symbol})`;
  const themeLabel = THEME_OPTIONS.find((o) => o.value === currentTheme)?.label ?? "Light";

  return (
    <div className="st-wrap">
      <div className="sec-top" style={{ marginBottom: 24 }}>
        <div><span className="eyebrow">Settings</span><h2>Preferences <span className="g">and account.</span></h2></div>
      </div>

      {/* Preferences */}
      <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>Preferences</span>
      <div className="st-card">
        <button className="st-row" onClick={() => setExpandedPref(expandedPref === "currency" ? null : "currency")}>
          <span className="st-name">Display currency</span>
          <span className="st-val">{currencyLabel}</span>
          <Chevron />
        </button>
        {expandedPref === "currency" && (
          <div className="st-exp">
            {SUPPORTED_CURRENCIES.map((currency) => {
              const { symbol, label } = CURRENCY_DISPLAY[currency];
              const on = displayCurrency === currency;
              return (
                <button key={currency} className={`st-opt${on ? " on" : ""}`} onClick={() => handleCurrencySelect(currency)} disabled={!!currencyLoading}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 18, textAlign: "center", fontWeight: 600 }}>{symbol}</span>{label}</span>
                  {currencyLoading === currency ? <span style={{ fontSize: 12, color: "var(--faint)" }}>Saving…</span> : on ? <span className="dot" /> : null}
                </button>
              );
            })}
            {currencyError && <div className="st-modal-err" style={{ marginBottom: 0 }}>{currencyError}</div>}
          </div>
        )}
        <button className="st-row" onClick={() => setExpandedPref(expandedPref === "theme" ? null : "theme")}>
          <span className="st-name">Theme</span>
          <span className="st-val">{themeLabel}</span>
          <Chevron />
        </button>
        {expandedPref === "theme" && (
          <div className="st-exp">
            {THEME_OPTIONS.map(({ value, label }) => (
              <button key={value} className={`st-opt${currentTheme === value ? " on" : ""}`} onClick={() => { setTheme(value); setExpandedPref(null); }}>
                {label}{currentTheme === value && <span className="dot" />}
              </button>
            ))}
            <div className="st-val" style={{ marginTop: 4 }}>The desktop site always uses the light theme; this also sets the theme on mobile.</div>
          </div>
        )}
        <NativeSettingsRows />
      </div>

      {/* Account */}
      <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>Account</span>
      <div className="st-card">
        {isDemo ? (
          <>
            <div className="st-acct">You’re exploring a live demo account. Start your own subscription to track your real portfolio.</div>
            <button className="st-signout accent" onClick={signOut}>Start your subscription</button>
          </>
        ) : (
          <>
            {user?.email && <div className="st-acct">{user.email}</div>}
            <button className="st-signout" onClick={signOut}>Sign out</button>
          </>
        )}
      </div>

      {/* Data & AI */}
      <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>Data &amp; AI</span>
      <div className="st-card" style={{ padding: "15px 20px" }}>
        <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
          Volnar uses AI to power chat and insights. Your data is never used to train AI models.{" "}
          <a className="st-link" href="https://volnar.nl/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </div>
        {aiConsentAt && (
          <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />AI processing acknowledged
          </div>
        )}
      </div>

      {/* Legal + delete */}
      <div className="st-legal">
        <div className="note">{DISCLAIMER_TEXT} <a className="st-link" href="https://volnar.nl/terms" target="_blank" rel="noopener noreferrer">Terms</a></div>
        {!isDemo && <button className="st-del" onClick={() => setDeleteOpen(true)}>Delete account</button>}
      </div>

      {deleteOpen && (
        <div className="st-modal" onClick={closeDeleteDialog}>
          <div className="st-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Delete account</h3>
            <div className="desc">This is permanent and cannot be undone. It removes all of your portfolio data, diary entries, and chat history. To continue, type DELETE below.</div>
            {deletionNotice && <div className="st-modal-warn">{deletionNotice}</div>}
            <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} disabled={deleting} />
            {deleteError && <div className="st-modal-err">{deleteError}</div>}
            <div className="st-modal-btns">
              <button className="st-cancel" onClick={closeDeleteDialog} disabled={deleting}>Cancel</button>
              <button className={`st-confirm${deleteConfirmText === "DELETE" && !deleting ? " armed" : ""}`} onClick={handleDeleteAccount} disabled={deleteConfirmText !== "DELETE" || deleting}>
                {deleting ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastVisible && <div className="st-toast">Display only — your portfolio is unchanged.</div>}
    </div>
  );
}
