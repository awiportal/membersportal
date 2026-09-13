import * as Sentry from "@sentry/nextjs";

// Edge runtime (middleware, edge routes) error monitoring. Inert unless a DSN is set.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    sendDefaultPii: false,
  });
}
