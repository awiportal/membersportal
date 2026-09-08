'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';

// Accept "AWI-001", "awi 1", "AWI1" or a bare "1"/"01" and normalise to the
// stored register format AWI-0NN. Anything else is returned trimmed/uppercased.
function normMemberNo(raw: string): string | null {
  const t = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  const m = t.match(/^AWI-?0*(\d{1,3})$/) || t.match(/^0*(\d{1,3})$/);
  if (m) return 'AWI-' + m[1].padStart(3, '0');
  return t;
}

// Bulk-load National ID / Passport (and optional phone) onto member_finances
// rows, so members can self-link at onboarding. Staff-only; the actual write
// goes through the member_finances staff RLS policy (is_staff()). These are the
// only PII fields loaded on the server — never committed to the repo.
export async function importFundIdentifiers(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const raw = String(formData.get('data') || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let updated = 0;
  let failed = 0;
  for (const line of lines) {
    const cells = line.split(/[\t,;]/).map((s) => s.trim());
    const first = cells[0] || '';
    if (/^member[_ ]?no$/i.test(first)) continue; // skip a header row
    const memberNo = normMemberNo(first);
    if (!memberNo) {
      failed++;
      continue;
    }
    const patch: Record<string, string> = {};
    if (cells[1]) patch.national_id = cells[1];
    if (cells[2]) patch.phone = cells[2];
    if (Object.keys(patch).length === 0) {
      failed++;
      continue;
    }

    const { data, error } = await supabase
      .from('member_finances')
      .update(patch)
      .eq('member_no', memberNo)
      .select('member_no');
    if (error || !data || data.length === 0) failed++;
    else updated++;
  }

  revalidatePath('/staff/fund-records');
  redirect(`/staff/fund-records?updated=${updated}&failed=${failed}`);
}
