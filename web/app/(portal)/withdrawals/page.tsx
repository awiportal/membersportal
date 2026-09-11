import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import WithdrawalsClient from './WithdrawalsClient';

export const dynamic = 'force-dynamic';

export default async function WithdrawalsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, full_name, investor_id')
    .eq('id', uid)
    .single();

  // Fund record gives us the withdrawable balance. A member who has not been
  // linked to a fund record yet simply has no cap enforced here (the office
  // verifies), so a missing row is not an error.
  const { data: fin } = await supabase
    .from('member_finances')
    .select('net_balance, current_balance, member_no, status')
    .eq('member_id', uid)
    .maybeSingle();

  // Own requests. If the table has not been migrated yet, degrade gracefully
  // rather than crash — the client shows a short "being set up" notice.
  const { data: rows, error } = await supabase
    .from('withdrawal_requests')
    .select('*')
    .eq('member_id', uid)
    .order('created_at', { ascending: false });

  const notReady = !!error;

  return (
    <WithdrawalsClient
      uid={uid}
      active={profile?.status === 'active'}
      netBalance={fin ? Number(fin.net_balance ?? fin.current_balance ?? 0) : null}
      requests={(rows ?? []) as any[]}
      notReady={notReady}
    />
  );
}
