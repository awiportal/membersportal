import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { pandadocConfigured } from '@/lib/pandadoc';
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

  const [
    { data: profile },
    { data: relations },
    { data: docs },
    { data: agrDocs },
    { data: acceptances },
    { data: settingsRows },
  ] = await Promise.all([
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
    supabase.from('app_settings').select('key,value'),
  ]);

  const settings = Object.fromEntries(
    ((settingsRows ?? []) as any[]).map((r) => [r.key, r.value])
  ) as Record<string, string>;

  // E-signing replaces the typed-name flow only when it's fully configured;
  // otherwise the member sees the original typed-name agreements.
  const esignEnabled = pandadocConfigured() && !!(settings['pandadoc_onboarding_template_id'] || '').trim();

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
      esignEnabled={esignEnabled}
      requestedStep={searchParams?.step}
      err={searchParams?.err}
    />
  );
}
