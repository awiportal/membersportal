import { createClient } from '@/lib/supabase/server';

// Small read helpers over the app_settings key/value table. Reads degrade to a
// safe default rather than throwing, so a missing table/row never breaks a page.

export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

// Is the member-facing payout window open? Long-term fund defaults to CLOSED.
// (Exit requests are always accepted regardless — enforced in the submit action.)
export async function getWithdrawalsOpen(): Promise<boolean> {
  const v = await getAppSetting('withdrawals_open');
  return String(v ?? '').toLowerCase() === 'true';
}
