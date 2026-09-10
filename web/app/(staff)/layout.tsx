import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTwoFactor } from '@/lib/twofaGate';
import StaffShell from '@/components/StaffShell';
import { isStaff } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!isStaff(profile?.role)) redirect('/dashboard');

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
