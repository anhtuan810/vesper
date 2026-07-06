"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser, useProfile, useNetWorth, useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, isSupportedCurrency, type DisplayCurrency } from "@/lib/money";
import { createBrowserSupabase } from "@/lib/supabase";
import { SettingsContent } from "@/components/settings/SettingsContent";

const supabase = createBrowserSupabase();

// The account panel — a left drawer (IBKR-style) opened from the avatar in the
// top bar. Header: avatar, name, email, net worth. Body: ALL settings
// (SettingsContent embedded) — the Profile tab no longer links to /settings.
//
// The panel's transform is "none" while at rest-open (not translateX(0)) so
// the fixed-position overlays inside SettingsContent (delete dialog, currency
// toast) position against the viewport, not the drawer.
export function AccountPanel({
  open,
  onClose,
  displayName,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string | null;
}) {
  const { user } = useUser();
  const profile = useProfile(user?.id);
  const { netWorthEur, loading: nwLoading } = useNetWorth();
  // The header formats net worth in the display currency. useDisplayCurrency reads
  // it once (keyed on the user id) and never re-reads, but the embedded
  // SettingsContent can change it — it PATCHes the users row and calls
  // router.refresh(), which does NOT re-run this client hook. Track the currency
  // locally so a re-read of the same source can update the header without a full
  // reload: re-read when the panel (re)opens and when the tab regains focus.
  // (A one-line onCurrencyChange callback threaded from SettingsContent would let
  // the header update the instant the user changes it, but that file is out of
  // scope for this fix.)
  const hookCurrency = useDisplayCurrency();
  const [currencyOverride, setCurrencyOverride] = useState<DisplayCurrency | null>(null);
  const displayCurrency = currencyOverride ?? hookCurrency;

  const refreshDisplayCurrency = useCallback(() => {
    if (!user?.id) return;
    supabase
      .from("users")
      .select("display_currency")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_currency && isSupportedCurrency(data.display_currency)) {
          setCurrencyOverride(data.display_currency as DisplayCurrency);
        }
      });
  }, [user?.id]);

  // Re-read when the panel opens, so a currency changed in a prior open session is
  // reflected without a full reload.
  useEffect(() => {
    if (open) refreshDisplayCurrency();
  }, [open, refreshDisplayCurrency]);

  // Re-read when the tab regains focus (mirrors useProfile) — catches a change
  // made just before the app was backgrounded.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") refreshDisplayCurrency(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshDisplayCurrency]);

  // Lazy-mount the settings body on first open, so every page load doesn't pay
  // the panel's data fetches.
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setEverOpened(true);
  }, [open]);

  // Escape closes; body scroll locks while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const name = displayName || profile?.name || "Investor";
  const initial = name.trim().charAt(0).toUpperCase() || "V";

  return (
    <div
      aria-hidden={!open}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal)",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--scrim)",
          opacity: open ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      />
      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        // When closed the drawer is only slid off-screen (still mounted), so
        // without this its focusable controls stay in the tab order — a keyboard
        // user would hit ~6 invisible off-screen stops. `inert` removes the whole
        // subtree from focus, pointer and the a11y tree in one go (React 19).
        inert={!open}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "min(85vw, 340px)",
          background: "var(--bg)",
          borderRight: "0.5px solid var(--border)",
          boxShadow: open ? "var(--shadow-soft)" : "none",
          transform: open ? "none" : "translateX(-105%)",
          transition: "transform 0.25s ease",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Account header: avatar · name · email · net worth */}
        <div style={{ padding: "18px 18px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              aria-hidden="true"
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: "var(--accent-soft)",
                color: "var(--accent-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-subhead)",
                fontWeight: 600,
                letterSpacing: "var(--tracking-subhead)",
                color: "var(--hero)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {name}
              </div>
              {user?.email && (
                <div style={{
                  fontSize: "var(--fs-caption)",
                  color: "var(--text-faint)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {user.email}
                </div>
              )}
            </div>
          </div>
          {!nwLoading && netWorthEur > 0 && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span className="eyebrow">Net worth</span>
              <span className="tnum" style={{ fontSize: 17, fontWeight: 600, color: "var(--hero)" }}>
                {formatMoney(netWorthEur, "EUR", displayCurrency)}
              </span>
            </div>
          )}
        </div>

        {/* All settings, embedded */}
        <div style={{ padding: "16px 18px 24px" }}>
          {everOpened && <SettingsContent embedded />}
        </div>
      </div>
    </div>
  );
}
