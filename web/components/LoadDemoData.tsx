'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoadDemoData() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setLoading(false);

    const uid = user.id;
    await supabase.from('holdings').insert([
      { member_id: uid, instrument: 'Britam Money Market Fund', asset_class: 'Money Market', value: 1842000, weight: 34, day_change: 1.2, annual_return: '11.4%' },
      { member_id: uid, instrument: 'Jubilee Balanced Fund', asset_class: 'Balanced', value: 1120000, weight: 20, day_change: 0.8, annual_return: '9.7%' },
      { member_id: uid, instrument: 'NSE Equities (AWIVEST pool)', asset_class: 'Equities', value: 986000, weight: 18, day_change: -1.4, annual_return: '15.2%' },
      { member_id: uid, instrument: 'Infrastructure Bonds (CBK)', asset_class: 'Fixed Income', value: 742000, weight: 14, day_change: 0.3, annual_return: '13.8%' },
      { member_id: uid, instrument: 'Riverdrift Property SPV', asset_class: 'Real Estate', value: 520000, weight: 9, day_change: 0, annual_return: '-' },
      { member_id: uid, instrument: 'Welfare & Cash Reserve', asset_class: 'Cash', value: 268000, weight: 5, day_change: 0, annual_return: '6.0%' },
    ]);
    await supabase.from('goals').insert([
      { member_id: uid, name: 'Family Home Deposit', category: 'Home', priority: 'High', target_amount: 4500000, saved_amount: 1980000, target_date: '2028-12-31', projected_monthly: 64000, projected_rate: 9 },
      { member_id: uid, name: "Children's Education", category: 'Education', priority: 'Very high', target_amount: 2800000, saved_amount: 1512000, target_date: '2031-01-31', projected_monthly: 31000, projected_rate: 9 },
      { member_id: uid, name: 'Emergency Fund', category: 'Emergency', priority: 'High', target_amount: 900000, saved_amount: 900000, target_date: '2026-01-01', projected_monthly: 0, projected_rate: 6 },
    ]);
    router.refresh();
    setLoading(false);
  }

  return (
    <button className="btn btn-lime" onClick={load} disabled={loading}>
      <i className="fa-solid fa-wand-magic-sparkles" /> {loading ? 'Loading…' : 'Load sample portfolio'}
    </button>
  );
}
