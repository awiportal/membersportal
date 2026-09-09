import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import KycClient from './KycClient';

export const dynamic = 'force-dynamic';

export default async function KycPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: docs }] = await Promise.all([
    supabase.from('profiles').select('member_type, kyc_status').eq('id', user.id).single(),
    supabase
      .from('kyc_documents')
      .select('id, doc_type, file_path, status, comment, uploaded_at, reviewed_at')
      .eq('member_id', user.id),
  ]);

  return (
    <KycClient
      uid={user.id}
      memberType={(profile?.member_type as string) || 'individual'}
      kycStatus={(profile?.kyc_status as string | null) ?? null}
      docs={(docs ?? []) as any}
    />
  );
}
