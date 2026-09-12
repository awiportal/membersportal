import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canViewStaffConsole } from '@/lib/roles';
import SubmissionsReview from './SubmissionsReview';

export const dynamic = 'force-dynamic';

export default async function FormSubmissionsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');

  const { data: form } = await supabase.from('forms').select('*').eq('id', params.id).single();
  if (!form) notFound();

  const { data: subRows } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('form_id', params.id)
    .order('submitted_at', { ascending: false, nullsFirst: false });
  const subs = (subRows ?? []) as any[];

  const memberIds = Array.from(new Set(subs.map((s) => s.member_id)));
  let memberMap: Record<string, any> = {};
  if (memberIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, investor_id, email')
      .in('id', memberIds);
    memberMap = Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, p]));
  }

  const rows = subs.map((s) => ({ ...s, member: memberMap[s.member_id] || null }));

  return <SubmissionsReview form={form} rows={rows} saved={!!searchParams?.ok} />;
}
