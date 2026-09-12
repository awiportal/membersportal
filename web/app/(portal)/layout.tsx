import { redirect } from 'next/navigation';
import { requireTwoFactor } from '@/lib/twofaGate';
import { getSessionUser, getSessionProfile } from '@/lib/session';
import Shell from '@/components/Shell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const profile = await getSessionProfile();

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
