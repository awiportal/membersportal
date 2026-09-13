import * as Sentry from "@sentry/nextjs";

// Browser-side error + performance monitoring. Fully inert unless a DSN is set,
// so this is safe to ship before a Sentry project exists. Events are delivered
// through the same-origin tunnel route (see next.config.mjs) to satisfy the
// enforced CSP and survive ad-blockers.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    // Keep tracing cost predictable; tune via env without a code redeploy.
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    // This is a financial app: do not attach PII (emails, IPs) by default.
    sendDefaultPii: false,
  });
}
