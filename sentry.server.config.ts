import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
} else if (process.env.NODE_ENV === "development") {
  console.log("[Sentry] SENTRY_DSN not set — server error tracking disabled");
}
