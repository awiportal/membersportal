import { createAdminClient } from '@/lib/supabase/admin';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function StaffSettings() {
  const admin = createAdminClient();
  const { data: rows } = await admin.from('app_settings').select('key,value');
  const map = Object.fromEntries(((rows ?? []) as any[]).map((r) => [r.key, r.value]));

  const initial = {
    onboarding: map['pandadoc_onboarding_template_id'] || '',
    oneoff: map['pandadoc_oneoff_template_id'] || '',
    role: map['pandadoc_signer_role'] || 'Investor',
    apiKeyPresent: !!process.env.PANDADOC_API_KEY,
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="page-title">Settings</div>
      <div className="sub">Configure e-signing (PandaDoc). The API key is stored securely as a server secret; here you set the templates and the signer role.</div>
      <div style={{ marginTop: 20 }}>
        <SettingsForm initial={initial} />
      </div>
    </div>
  );
}
