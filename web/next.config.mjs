/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs';

// Derive the Supabase project host from the public URL so the Next.js image
// optimizer is NOT an open proxy for arbitrary remote hosts (previously
// hostname:'**' allowed any HTTPS origin). Falls back to the Supabase wildcard
// if the env var is unavailable at build time.
let supabaseHost = null;
try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  }
} catch {
  /* ignore malformed URL */
}

const imageRemotePatterns = supabaseHost
  ? [{ protocol: 'https', hostname: supabaseHost }]
  : [{ protocol: 'https', hostname: '*.supabase.co' }];

// Supabase origins for CSP: REST + Storage over https, Realtime over wss.
const supabaseHttps = supabaseHost ? `https://${supabaseHost}` : 'https://*.supabase.co';
const supabaseWss = supabaseHost ? `wss://${supabaseHost}` : 'wss://*.supabase.co';

// Content-Security-Policy — now ENFORCED. Previously shipped in report-only mode
// so the report stream could confirm the allow-lists; those have been audited
// against the app's real loads and are complete, so the full policy is applied
// as an enforcing header below.
// Origins reflect the app's real loads:
//   - Google Fonts (fonts.googleapis.com CSS + fonts.gstatic.com webfonts)
//   - Font Awesome via cdnjs (CSS + webfonts)
//   - Supabase Storage/REST (https) and Realtime (wss); KYC review embeds a
//     signed Storage URL in an iframe, so the Supabase host is in frame-src too
//   - PandaDoc e-sign (form-action + frame-src)
// 'unsafe-inline' is still required: the theme <script> in app/layout.tsx and
// the app's inline style={} attributes need it. Future hardening: nonce the
// theme script (per-request nonce in middleware, add strict-dynamic) and drop
// 'unsafe-inline' from script-src.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://app.pandadoc.com",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
  `img-src 'self' data: blob: ${supabaseHttps}`,
  `connect-src 'self' ${supabaseHttps} ${supabaseWss}`,
  `frame-src 'self' ${supabaseHttps} https://app.pandadoc.com`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

// Baseline security headers applied to every response. These are safe defaults
// that do not rely on inline-script/style nonces, so they will not break the
// current UI.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // Full Content-Security-Policy, now ENFORCED (see csp above). Graduated from
  // report-only after auditing the app's real loads (Google Fonts, Font Awesome
  // via cdnjs, Supabase https/wss + Storage iframe, PandaDoc e-sign).
  { key: 'Content-Security-Policy', value: csp },
];

const nextConfig = {
  poweredByHeader: false,
  // Required on Next.js 14.x for instrumentation.ts (Sentry server/edge init).
  experimental: { instrumentationHook: true },
  images: { remotePatterns: imageRemotePatterns },
  webpack: (config) => {
    // pdfjs-dist (client-side PDF rendering for Documents to Sign field placement)
    // references an optional Node-only 'canvas' module. It is never needed in the
    // browser bundle, so alias it away to avoid a "Module not found: canvas" build
    // error. Purely additive; does not affect any other module resolution.
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress the noisy source-map upload logs during build.
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source maps upload only when SENTRY_AUTH_TOKEN is set (Vercel/CI). When it is
  // absent the upload is skipped and the build still succeeds.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Route browser events through the app's own origin so the enforced CSP
  // (connect-src 'self') and ad-blockers do not drop them.
  tunnelRoute: '/monitoring',
  widenClientFileUpload: true,
  disableLogger: true,
  // Skip source-map generation unless an upload token is set. Keeps builds
  // light on constrained CI; on Vercel with SENTRY_AUTH_TOKEN the maps are
  // generated and uploaded so stack traces stay readable.
  sourcemaps: { disable: process.env.SENTRY_AUTH_TOKEN ? false : true },
});
