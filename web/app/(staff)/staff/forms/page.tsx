import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import FormsManager from './FormsManager';

export const dynamic = 'force-dynamic';

export default async function StaffFormsPage({
  searchParams,
}: {
  searchParams: { ok?: string; err?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const [{ data: formRows }, { data: subs }] = await Promise.all([
    supabase.from('forms').select('*').order('sort_order', { ascending: true }).order('title', { ascending: true }),
    supabase.from('form_submissions').select('form_id,status'),
  ]);

  const forms = (formRows ?? []) as any[];
  const counts: Record<string, { total: number; pending: number }> = {};
  ((subs ?? []) as any[]).forEach((s) => {
    const c = (counts[s.form_id] = counts[s.form_id] || { total: 0, pending: 0 });
    c.total += 1;
    if (s.status === 'submitted') c.pending += 1;
  });

  return <FormsManager forms={forms} counts={counts} flash={searchParams} />;
}
