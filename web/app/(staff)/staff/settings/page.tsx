import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { canManageConfig } from '@/lib/roles';
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

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null as any };
  const canConfig = canManageConfig(me?.role);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="page-title">Settings</div>
      <div className="sub">Configure e-signing (PandaDoc). The API key is stored securely as a server secret; here you set the templates and the signer role.</div>
      <div style={{ marginTop: 20 }}>
        {canConfig ? (
          <SettingsForm initial={initial} />
        ) : (
          <div className="card card-pad muted" style={{ fontSize: 13 }}>
            E-signing settings are managed by an Admin or the Chairlady.
          </div>
        )}
      </div>
    </div>
  );
}
