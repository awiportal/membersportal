import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/roles';

// Step-up authenticator (TOTP) MFA enforcement for high-privilege accounts (#176).
//
// This layers ON TOP of the mandatory email step-up (lib/twofaGate): a member
// still enters the emailed code, and Admin + Chairlady additionally step up with
// a 6-digit authenticator-app code. It uses Supabase's native MFA (factors live
// in auth.mfa_factors; the secret never touches our DB), so assurance level
// (AAL) is what we check.
//
// FAIL-OPEN BY DESIGN. Auth changes carry lockout risk, so every uncertain path
// here lets the admin through rather than blocking:
//   - Any error looking up the assurance level -> allow.
//   - No verified TOTP factor enrolled yet -> allow (the /staff/security page
//     shows an enrolment prompt) unless AWI_FORCE_ADMIN_MFA_ENROLL=true.
//
// Controls (Vercel env, no code redeploy), mirroring AWI_REQUIRE_2FA:
//   AWI_REQUIRE_ADMIN_MFA=false        -> disable step-up entirely (kill-switch).
//   AWI_FORCE_ADMIN_MFA_ENROLL=true    -> admins with no factor are sent to
//                                         /staff/security to enrol before use.
export async function requireAdminMfa(role?: string | null) {
  if (process.env.AWI_REQUIRE_ADMIN_MFA === 'false') return;
  if (!isAdmin(role)) return;

  const supabase = createClient();

  let currentLevel: string | null = null;
  let nextLevel: string | null = null;
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return; // fail-open on lookup error
    currentLevel = data.currentLevel;
    nextLevel = data.nextLevel;
  } catch {
    return; // fail-open
  }

  // Already stepped up to aal2 in this session -> allow.
  if (currentLevel === 'aal2') return;

  // A verified TOTP factor exists but the session is only aal1 -> require step-up.
  if (nextLevel === 'aal2') redirect('/verify/mfa');

  // No verified factor enrolled yet. Do not lock out; optionally force enrolment.
  if (process.env.AWI_FORCE_ADMIN_MFA_ENROLL === 'true') redirect('/staff/security?mfa=enroll');
}
