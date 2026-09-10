import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyTwoFactorToken } from '@/lib/twofa';

// Email step-up (2FA) is MANDATORY for every signed-in user — members AND
// staff. After the password factor, the user must enter a one-time code emailed
// to them before any portal or staff page renders. A signed, expiring cookie
// (see lib/twofa) remembers the device for its TTL (12h) so we don't email a
// code on every navigation; a fresh login or a new device always re-verifies.
//
// Emergency kill-switch: set AWI_REQUIRE_2FA=false in the environment to turn
// enforcement off instantly (Vercel env change, no logic redeploy) if email
// delivery ever fails and members would otherwise be locked out. Leave it unset
// (or anything other than the string "false") to keep 2FA on.
export function requireTwoFactor(userId: string) {
  if (process.env.AWI_REQUIRE_2FA === 'false') return;
  const token = cookies().get('awi_2fa_ok')?.value;
  if (!verifyTwoFactorToken(token, userId)) redirect('/verify');
}
