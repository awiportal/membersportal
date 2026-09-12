import { redirect } from 'next/navigation';
import { requireTwoFactor } from '@/lib/twofaGate';
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

  return (
    <StaffShell profile={profile} email={user.email ?? ''}>
      {children}
    </StaffShell>
  );
}
