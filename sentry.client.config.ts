import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
} else if (process.env.NODE_ENV === "development") {
  console.log("[Sentry] NEXT_PUBLIC_SENTRY_DSN not set — client error tracking disabled");
}
