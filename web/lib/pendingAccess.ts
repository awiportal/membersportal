// Single source of truth for what a not-yet-approved ("pending") member may
// access. Shared by the sidebar nav (components/Shell.tsx) and the server-side
// gate (lib/supabase/middleware.ts) so the two can never drift apart.
//
// A "pending" member is any signed-in member whose profile.status is not
// 'active'. Staff roles are exempt from this gate.

// Nav item ids a pending member may see and open in the sidebar.
export const PENDING_ALLOWED_NAV = new Set<string>([
  'dashboard',
  'information',
  'kyc',
  'profile',
  'notifications',
  'settings',
]);

// URL paths a pending member may load. Mirrors PENDING_ALLOWED_NAV, plus the
// onboarding hub (reached from the dashboard CTA, not from a nav item).
const PENDING_ALLOWED_PATHS = [
  '/dashboard',
  '/information',
  '/kyc',
  '/onboarding',
  '/profile',
  '/notifications',
  '/settings',
];

// True when `pathname` is one a pending member is allowed to load — either an
// exact match or a sub-path (e.g. /onboarding/step-2).
export function isPendingAllowedPath(pathname: string): boolean {
  return PENDING_ALLOWED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}
