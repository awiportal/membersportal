import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // select('*') so this page still renders if the v0.8 columns aren't migrated yet.
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  return (
    <SettingsClient
      accountEmail={user.email ?? ''}
      notificationPrefs={(profile?.notification_prefs as Record<string, boolean>) ?? {}}
      locale={(profile?.locale as string) ?? ''}
      timezone={(profile?.timezone as string) ?? ''}
      twofaEmail={Boolean(profile?.twofa_email)}
    />
  );
}
