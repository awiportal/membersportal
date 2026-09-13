"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Root-level error boundary. Next.js renders this (replacing the whole app) when
// an error escapes the root layout. It reports the error to Sentry (when a DSN is
// configured) and shows a minimal, on-brand fallback with a retry.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#160a15",
          color: "#f6f3f8",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", color: "#b9aec6", fontSize: 14, lineHeight: 1.5 }}>
            An unexpected error occurred and has been logged. You can try again, or
            reload the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "linear-gradient(135deg, #B22C75, #7A1E50)",
              color: "#fff",
              border: 0,
              borderRadius: 12,
              padding: "11px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
