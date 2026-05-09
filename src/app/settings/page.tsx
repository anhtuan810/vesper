"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase";
import { useUser } from "@/lib/hooks";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";

const supabase = createBrowserSupabase();

const CURRENCY_DISPLAY: Record<DisplayCurrency, { symbol: string; label: string }> = {
  EUR: { symbol: "€", label: "Euro" },
  USD: { symbol: "$", label: "US Dollar" },
  GBP: { symbol: "£", label: "British Pound" },
};

const TOAST_KEY = "vesper.currency.toastSeen";

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useUser();
  const [selected, setSelected] = useState<DisplayCurrency>("EUR");
  const [loadingCard, setLoadingCard] = useState<DisplayCurrency | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("users")
      .select("display_currency")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_currency && isSupportedCurrency(data.display_currency)) {
          setSelected(data.display_currency as DisplayCurrency);
        }
      });
  }, [user?.id]);

  const handleSelect = async (currency: DisplayCurrency) => {
    if (currency === selected || loadingCard) return;
    setLoadingCard(currency);
    setError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_currency: currency }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to update currency");
      } else {
        setSelected(currency);
        if (currency !== "EUR" && !localStorage.getItem(TOAST_KEY)) {
          localStorage.setItem(TOAST_KEY, "1");
          setToastVisible(true);
          setTimeout(() => setToastVisible(false), 4000);
        }
        router.refresh();
      }
    } catch {
      setError("Failed to update currency");
    } finally {
      setLoadingCard(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div
        className="h-14 bg-surface border-b border-border flex items-center px-4"
        style={{ gap: 0 }}
      >
        <Link
          href="/profile"
          className="font-mono text-dim hover:text-fg transition-colors"
          style={{ fontSize: 11, letterSpacing: "0.04em", width: 72 }}
        >
          ← Profile
        </Link>
        <h1
          className="font-mono uppercase text-fg flex-1 text-center"
          style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.18em" }}
        >
          Settings
        </h1>
        {/* right spacer keeps title centered */}
        <div style={{ width: 72 }} />
      </div>

      <div className="max-w-[960px] mx-auto px-4 sm:px-8 pt-10 pb-24">
        <div
          className="font-mono text-faint uppercase mb-4"
          style={{ fontSize: 9, letterSpacing: "0.18em" }}
        >
          Display currency
        </div>

        <div className="space-y-2">
          {SUPPORTED_CURRENCIES.map((currency) => {
            const { symbol, label } = CURRENCY_DISPLAY[currency];
            const isActive = selected === currency;
            const isLoading = loadingCard === currency;

            return (
              <button
                key={currency}
                onClick={() => handleSelect(currency)}
                disabled={!!loadingCard}
                className="w-full text-left bg-surface rounded-xl p-4 transition-colors"
                style={{
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 18,
                        fontWeight: 500,
                        color: isActive ? "var(--accent)" : "var(--text-dim)",
                        width: 24,
                        textAlign: "center",
                      }}
                    >
                      {symbol}
                    </span>
                    <div>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: 13,
                          color: isActive ? "var(--accent)" : "var(--text)",
                        }}
                      >
                        {label}
                      </div>
                      <div
                        className="font-mono text-faint"
                        style={{ fontSize: 10, letterSpacing: "0.08em", marginTop: 2 }}
                      >
                        {currency}
                      </div>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="font-mono text-faint" style={{ fontSize: 10 }}>
                      Saving…
                    </div>
                  ) : isActive ? (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div
            className="font-mono mt-3"
            style={{ fontSize: 12, color: "var(--negative)" }}
          >
            {error}
          </div>
        )}
      </div>

      {toastVisible && (
        <div
          className="font-mono"
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
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            zIndex: 50,
          }}
        >
          Display only — your portfolio is unchanged.
        </div>
      )}
    </div>
  );
}
