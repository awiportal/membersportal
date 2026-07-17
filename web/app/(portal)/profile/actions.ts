'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { COUNTRIES, COUNTRY_BY_CODE } from '@/lib/countries';

export type ProfileInput = {
  full_name?: string;
  phone?: string;
  country?: string; // ISO alpha-2 code
  physical_address?: string;
  postal_address?: string;
  date_of_birth?: string; // yyyy-mm-dd
};

export async function updateProfile(input: ProfileInput): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };

  const full_name = String(input?.full_name || '').trim();
  if (!full_name) return { error: 'Please enter your full name.' };
  if (full_name.length > 120) return { error: 'That name looks too long — please shorten it.' };

  // The Profile field is a type-to-search input, so `country` may arrive as an
  // ISO code OR a full country name. Store the ISO code when we recognise it,
  // otherwise keep exactly what the member typed (don't silently drop it).
  let country: string | null = null;
  const rawCountry = String(input?.country || '').trim();
  if (rawCountry) {
    country = COUNTRY_BY_CODE[rawCountry]
      ? rawCountry
      : COUNTRIES.find((cc) => cc.name.toLowerCase() === rawCountry.toLowerCase())?.code || rawCountry;
  }
  const phone = String(input?.phone || '').trim() || null;
  const physical_address = String(input?.physical_address || '').trim() || null;
  const postal_address = String(input?.postal_address || '').trim() || null;

  let date_of_birth: string | null = null;
  if (input?.date_of_birth) {
    const d = String(input.date_of_birth).slice(0, 10);
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return { error: 'That date of birth is not valid.' };
    if (parsed.getTime() > Date.now()) return { error: 'Date of birth cannot be in the future.' };
    date_of_birth = d;
  }

  // RLS "profiles_update" already restricts this to the member's own row.
  const { error } = await supabase
    .from('profiles')
    .update({ full_name, phone, country, physical_address, postal_address, date_of_birth })
    .eq('id', user.id);

  if (error) {
    console.error('updateProfile failed:', error.message);
    return { error: 'We could not save your profile just now. Please try again in a moment.' };
  }

  revalidatePath('/profile');
  revalidatePath('/dashboard');
  return { ok: true };
}
