import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OnboardingClient from './OnboardingClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { step?: string; err?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const [{ data: profile }, { data: relations }, { data: docs }, { data: agreements }] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('member_relations').select('*').eq('member_id', uid),
      supabase.from('kyc_documents').select('*').eq('member_id', uid).order('uploaded_at', { ascending: false }),
      supabase.from('agreements').select('*').eq('member_id', uid),
    ]);

  return (
    <OnboardingClient
      profile={profile}
      relations={relations ?? []}
      docs={docs ?? []}
      agreementSigned={((agreements ?? []) as any[]).some((a) => a.status === 'completed')}
      email={user.email ?? ''}
      requestedStep={searchParams?.step}
      err={searchParams?.err}
    />
  );
}
