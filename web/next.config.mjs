/** @type {import('next').NextConfig} */

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

// Baseline security headers applied to every response. These are safe defaults
// that do not rely on inline-script/style nonces, so they will not break the
// current UI. Layer a full script-src/style-src CSP on top once inline styles
// and the theme <script> are nonced.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // Clickjacking protection for browsers that prefer CSP over X-Frame-Options.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

const nextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: imageRemotePatterns },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
