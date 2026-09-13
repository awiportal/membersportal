import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import MfaChallengeClient from './MfaChallengeClient';

export const dynamic = 'force-dynamic';

// Authenticator (TOTP) step-up screen for Admin / Chairlady (#176). It sits
// OUTSIDE the (portal)/(staff) layouts so it is never caught by their gates
// (which would loop). The email step-up has already passed by the time an admin
// is bounced here from the staff layout's requireAdminMfa().
export default async function MfaVerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // Already stepped up, or nothing to challenge (no verified factor) -> leave.
  if (!aal || aal.currentLevel === 'aal2' || aal.nextLevel !== 'aal2') redirect('/');

  return <MfaChallengeClient />;
}
