import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

  return (
    <StaffShell profile={profile} email={user.email ?? ''}>
      {children}
    </StaffShell>
  );
}
