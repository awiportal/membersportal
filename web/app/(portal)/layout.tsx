import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import Shell from '@/components/Shell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // Opt-in email-code step-up. If this member turned it on and this device
  // hasn't verified in the last 12 hours, send them to /verify first.
  // twofa_email defaults to false, so members who never opt in are unaffected.
  // Guarded with `in profile` so the portal keeps working before the v1.0
  // migration adds the column.
  if (profile && 'twofa_email' in profile && profile.twofa_email) {
    const verified = cookies().get('awi_2fa_ok')?.value;
    if (verified !== user.id) redirect('/verify');
  }

  return (
    <Shell profile={profile} email={user.email ?? ''}>
      {children}
    </Shell>
  );
}
