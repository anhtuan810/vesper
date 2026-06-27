"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      className="min-h-screen bg-bg flex items-center justify-center"
      style={{ fontFamily: "var(--sans)" }}
    >
      <div className="text-center">
        <div className="text-sm font-semibold text-fg mb-2">Something went wrong</div>
        <div className="text-xs text-faint mb-6 max-w-sm">{error.message}</div>
        <button
          onClick={reset}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-text transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
