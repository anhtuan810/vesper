"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F8F7F4", margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F0E0C", marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 24, maxWidth: 320 }}>
              {error.message}
            </div>
            <button
              onClick={unstable_retry}
              style={{
                fontSize: 12, fontWeight: 600, padding: "8px 16px",
                borderRadius: 8, background: "#2563EB", color: "#fff",
                border: "none", cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
