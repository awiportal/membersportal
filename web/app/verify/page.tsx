import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import VerifyClient from './VerifyClient';

export const dynamic = 'force-dynamic';

// Standalone step-up screen (NOT inside the (portal) layout, so it never gets
// caught by the portal's own 2FA gate — avoids a redirect loop).
export default async function VerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('twofa_email')
    .eq('id', user.id)
    .single();

  // Nothing to verify if the member hasn't opted in, or this device already did.
  if (!profile?.twofa_email) redirect('/dashboard');
  if (cookies().get('awi_2fa_ok')?.value === user.id) redirect('/dashboard');

  return <VerifyClient email={user.email ?? ''} />;
}
