// Next.js instrumentation hook. Runs once when the server (Node or Edge runtime)
// boots and initialises Sentry for that runtime. Browser-side Sentry is
// initialised separately by sentry.client.config.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
