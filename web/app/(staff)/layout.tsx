import { redirect } from 'next/navigation';
import { requireTwoFactor } from '@/lib/twofaGate';
import { requireAdminMfa } from '@/lib/mfaGate';
import { getSessionUser, getSessionProfile } from '@/lib/session';
import StaffShell from '@/components/StaffShell';
import { canViewStaffConsole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const profile = await getSessionProfile();
  if (!canViewStaffConsole(profile?.role)) redirect('/dashboard');

  // Staff hold the highest privilege (every member's financial data), so the
  // emailed sign-in code is mandatory for them too. The staff console
  // previously had NO 2FA gate at all.
  requireTwoFactor(user.id);

  // High-privilege accounts (Admin + Chairlady) additionally step up with an
  // authenticator-app (TOTP) code (#176). Fail-open by design so it can never
  // lock an admin out (see lib/mfaGate); disable with AWI_REQUIRE_ADMIN_MFA=false.
  await requireAdminMfa(profile?.role);

  return (
    <StaffShell profile={profile} email={user.email ?? ''}>
      {children}
    </StaffShell>
  );
}
