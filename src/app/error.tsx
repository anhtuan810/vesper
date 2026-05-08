"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({
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
    <div
      className="min-h-screen bg-[#F8F7F4] flex items-center justify-center"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="text-center">
        <div className="text-sm font-semibold text-[#0F0E0C] mb-2">Something went wrong</div>
        <div className="text-xs text-gray-400 mb-6 max-w-sm">{error.message}</div>
        <button
          onClick={unstable_retry}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
