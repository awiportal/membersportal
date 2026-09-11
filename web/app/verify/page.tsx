import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifyTwoFactorToken } from '@/lib/twofa';
import VerifyClient from './VerifyClient';

export const dynamic = 'force-dynamic';

// Standalone step-up screen. It sits OUTSIDE the (portal)/(staff) layouts so it
// is never caught by their mandatory 2FA gate (that would loop). Email 2FA is
// now required for EVERY signed-in user, so this page always shows the code
// form unless this device has already verified.
//
// NOTE: do NOT re-add a `twofa_email` opt-in bounce here. The gate in the
// portal/staff layouts sends everyone to /verify; bouncing non-opted-in users
// back to /dashboard from here produces an infinite /dashboard <-> /verify
// redirect loop (ERR_TOO_MANY_REDIRECTS).
export default async function VerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Already verified on this device -> go to the role-correct home ('/'
  // resolves member -> /dashboard, staff -> /staff).
  if (verifyTwoFactorToken(cookies().get('awi_2fa_ok')?.value, user.id)) redirect('/');

  return <VerifyClient email={user.email ?? ''} />;
}
