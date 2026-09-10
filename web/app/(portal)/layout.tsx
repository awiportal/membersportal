import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTwoFactor } from '@/lib/twofaGate';
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

  // Mandatory emailed sign-in code for every member — no longer opt-in
  // (see lib/twofaGate). Sends the member to /verify until this device has
  // completed the current code.
  requireTwoFactor(user.id);

  return (
    <Shell profile={profile} email={user.email ?? ''}>
      {children}
    </Shell>
  );
}
