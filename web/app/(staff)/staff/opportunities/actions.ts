'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';

// Both writes are governed by the opp_staff RLS policy (is_staff()); we mirror
// that check in the action so a non-staff caller is bounced before the query.
async function requireStaff() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');
  return supabase;
}

export async function addOpportunity(formData: FormData) {
  const supabase = await requireStaff();

  const name = String(formData.get('name') || '').trim();
  if (!name) redirect('/staff/opportunities');

  const asset_class = String(formData.get('asset_class') || '').trim() || null;
  const target_irr = String(formData.get('target_irr') || '').trim() || null;
  const minRaw = String(formData.get('min_amount') || '').replace(/[^0-9.]/g, '');
  const min_amount = minRaw ? Number(minRaw) : null;
  const closesRaw = String(formData.get('closes_at') || '').trim();
  const closes_at = closesRaw || null;
  const description = String(formData.get('description') || '').trim() || null;

  const { error } = await supabase
    .from('opportunities')
    .insert({ name, asset_class, target_irr, min_amount, closes_at, description, status: 'open' });
  if (error) console.error('addOpportunity failed:', error.message);

  revalidatePath('/staff/opportunities');
  revalidatePath('/opportunities');
  redirect('/staff/opportunities?added=1');
}

export async function removeOpportunity(formData: FormData) {
  const supabase = await requireStaff();

  const id = String(formData.get('id') || '');
  if (id) {
    const { error } = await supabase.from('opportunities').delete().eq('id', id);
    if (error) console.error('removeOpportunity failed:', error.message);
  }

  revalidatePath('/staff/opportunities');
  revalidatePath('/opportunities');
  redirect('/staff/opportunities?removed=1');
}
