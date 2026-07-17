'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ALL_PREF_KEYS, LOCALE_CODES } from '@/lib/prefs';

const MIGRATION_HINT =
  'Preferences storage is not set up yet. Please run the v0.8 database migration, then try again.';

function looksMissingColumn(msg?: string) {
  const m = (msg || '').toLowerCase();
  return m.includes('column') && (m.includes('does not exist') || m.includes('notification_prefs') || m.includes('locale') || m.includes('timezone'));
}

export async function updateNotifications(prefs: Record<string, boolean>): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };

  const clean: Record<string, boolean> = {};
  for (const k of ALL_PREF_KEYS) {
    if (typeof prefs?.[k] === 'boolean') clean[k] = prefs[k];
  }

  const { error } = await supabase.from('profiles').update({ notification_prefs: clean }).eq('id', user.id);
  if (error) {
    console.error('updateNotifications failed:', error.message);
    return { error: looksMissingColumn(error.message) ? MIGRATION_HINT : 'We could not save your notification settings just now. Please try again.' };
  }

  revalidatePath('/settings');
  return { ok: true };
}

export async function updateRegional(input: { locale?: string; timezone?: string }): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };

  const locale = input?.locale && LOCALE_CODES.includes(input.locale) ? input.locale : null;
  // Basic IANA sanity: "Area/Location", letters/underscores/±digits only.
  const tzRaw = String(input?.timezone || '').trim();
  const timezone = /^[A-Za-z]+\/[A-Za-z0-9_+\-\/]+$/.test(tzRaw) || tzRaw === 'UTC' ? tzRaw : null;

  const { error } = await supabase.from('profiles').update({ locale, timezone }).eq('id', user.id);
  if (error) {
    console.error('updateRegional failed:', error.message);
    return { error: looksMissingColumn(error.message) ? MIGRATION_HINT : 'We could not save your language and time zone just now. Please try again.' };
  }

  revalidatePath('/settings');
  return { ok: true };
}

export async function changePassword(input: { password: string }): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };

  const pw = String(input?.password || '');
  if (pw.length < 8) return { error: 'Your new password must be at least 8 characters.' };
  if (pw.length > 72) return { error: 'That password is too long (72 characters max).' };

  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) {
    console.error('changePassword failed:', error.message);
    return { error: error.message || 'We could not update your password just now. Please try again.' };
  }

  return { ok: true };
}

// Turn the opt-in email-code sign-in on/off for the current member. OFF by
// default (see v1.0 migration); turning it on adds an emailed code at sign-in.
export async function updateTwofa(enabled: boolean): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };

  const { error } = await supabase.from('profiles').update({ twofa_email: !!enabled }).eq('id', user.id);
  if (error) {
    console.error('updateTwofa failed:', error.message);
    const m = (error.message || '').toLowerCase();
    if (m.includes('twofa_email') || (m.includes('column') && m.includes('does not exist'))) {
      return { error: 'Email code sign-in isn’t set up yet. Please run the v1.0 database migration, then try again.' };
    }
    return { error: 'We could not update your sign-in security just now. Please try again.' };
  }

  revalidatePath('/settings');
  return { ok: true };
}
