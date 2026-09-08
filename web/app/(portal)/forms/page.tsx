import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function StatusBadge({ s }: { s?: string }) {
  if (!s) return <span className="badge badge-warn">Not started</span>;
  const cls = s === 'approved' ? 'badge-good' : s === 'submitted' ? 'badge-info' : s === 'rejected' ? 'badge-bad' : 'badge-warn';
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default async function FormsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: formRows }, { data: subs }] = await Promise.all([
    supabase.from('forms').select('*').eq('status', 'active').order('sort_order', { ascending: true }),
    supabase.from('form_submissions').select('form_id,status').eq('member_id', uid),
  ]);
  const forms = (formRows ?? []) as any[];
  const subByForm: Record<string, string> = {};
  ((subs ?? []) as any[]).forEach((s) => {
    subByForm[s.form_id] = s.status;
  });

  return (
    <div>
      <div className="page-title">Online Forms</div>
      <div className="sub">Open a form, fill it online, then e-sign and submit.</div>

      <div className="card card-pad" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {forms.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No forms have been published yet.</div>
        ) : (
          forms.map((f) => {
            const st = subByForm[f.id];
            const cta = st === 'submitted' || st === 'approved' ? 'View' : st === 'draft' ? 'Continue' : 'Start';
            const btnCls = st === 'submitted' || st === 'approved' ? 'btn-ghost' : 'btn-lime';
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span className="ic" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--lime2)' }}>
                  <i className="fa-solid fa-file-signature" />
                </span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600 }}>{f.title}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{f.require_signature ? 'Requires signature' : 'No signature'}</div>
                </div>
                <StatusBadge s={st} />
                <Link href={`/forms/${f.id}`} className={`btn ${btnCls} btn-sm`}>{cta}</Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
