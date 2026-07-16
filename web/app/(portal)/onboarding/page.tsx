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

  const [{ data: profile }, { data: relations }, { data: docs }, { data: agrDocs }, { data: acceptances }] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('member_relations').select('*').eq('member_id', uid),
      supabase.from('kyc_documents').select('*').eq('member_id', uid).order('uploaded_at', { ascending: false }),
      supabase
        .from('agreement_documents')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('agreement_acceptances').select('*').eq('member_id', uid),
    ]);

  const agreements = ((agrDocs ?? []) as any[]).map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    required: d.required,
    fileUrl: supabase.storage.from('agreements').getPublicUrl(d.file_path).data.publicUrl,
  }));

  return (
    <OnboardingClient
      profile={profile}
      relations={relations ?? []}
      docs={docs ?? []}
      agreements={agreements}
      acceptances={acceptances ?? []}
      email={user.email ?? ''}
      requestedStep={searchParams?.step}
      err={searchParams?.err}
    />
  );
}
