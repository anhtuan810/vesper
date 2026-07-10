"use client";

import { track } from "@vercel/analytics";
import { AssetCollector } from "@/components/assets/AssetCollector";
import { apiFetch } from "@/lib/api";
import { useDisplayCurrencyState } from "@/lib/hooks";
import { bumpPortfolioRevision } from "@/lib/portfolio-revision";
import { watchPortfolioBuild } from "@/lib/portfolio-build";
import type { PortfolioChange } from "@/lib/apply-changes";

// In-app mount of the reusable AssetCollector: a modal sheet for adding assets from
// inside the app (the same collector the onboarding flow uses). Persists through the
// shared POST /api/assets/create write path and refreshes the dashboard — holdings,
// net-worth chart, diary — exactly like the chat add path.
export function AddAssetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currency } = useDisplayCurrencyState();
  if (!open) return null;

  const persist = async (changes: PortfolioChange[]): Promise<{ ok: boolean; error?: string }> => {
    const res = await apiFetch("/api/assets/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes, displayCurrency: currency }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error ?? "Couldn't save that — please try again." };
    if (body?.changed === false) {
      const reason = Array.isArray(body?.failures) && body.failures[0]?.reason;
      return { ok: false, error: reason || "I couldn't record that — please check the details." };
    }
    // Refresh the dashboard (holdings + chart/diary) and show the build indicator.
    try {
      window.dispatchEvent(new Event("volnar:asset-restored"));
    } catch {
      /* no-op */
    }
    bumpPortfolioRevision();
    watchPortfolioBuild();
    return { ok: true };
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Add an asset" className="aas-overlay" onClick={onClose}>
      <div className="aas-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="aas-head">
          <span className="aas-title">Add an asset</span>
          <button className="aas-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {/* No onCancel: the collector's Cancel abandons the in-progress asset and
            returns to the type picker; the ✕ above closes the whole sheet. */}
        <AssetCollector
          displayCurrency={currency}
          onConfirm={persist}
          onStep={(e, p) => {
            try {
              track(`add_asset_${e}`, p);
            } catch {
              /* best effort */
            }
          }}
        />
      </div>
      <style>{`
        .aas-overlay {
          position: fixed; inset: 0; z-index: var(--z-modal, 9000);
          background: var(--scrim, rgba(0,0,0,0.4));
          display: flex; align-items: flex-end; justify-content: center;
          padding: 0;
        }
        @media (min-width: 640px) {
          .aas-overlay { align-items: center; padding: var(--space-5); }
        }
        .aas-sheet {
          width: 100%; max-width: 560px;
          background: var(--bg); color: var(--text);
          border: 0.5px solid var(--border);
          border-radius: var(--radius-xl) var(--radius-xl) 0 0;
          padding: var(--space-5) var(--space-5) calc(env(safe-area-inset-bottom) + var(--space-5));
          max-height: 92dvh; overflow-y: auto;
          box-shadow: var(--shadow-soft);
        }
        @media (min-width: 640px) {
          .aas-sheet { border-radius: var(--radius-xl); }
        }
        .aas-head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: var(--space-4);
        }
        .aas-title {
          font-family: var(--font-display); font-style: italic; font-size: var(--fs-subhead);
          color: var(--hero);
        }
        .aas-close {
          background: none; border: none; cursor: pointer; color: var(--text-faint);
          font-size: var(--fs-body); width: 36px; height: 36px; border-radius: 50%;
        }
      `}</style>
    </div>
  );
}
