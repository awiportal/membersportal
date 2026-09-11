import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import { importFundIdentifiers } from './actions';
import RegisterStatus from './RegisterStatus';

export const dynamic = 'force-dynamic';

// Show enough of a stored identifier to confirm it, without displaying full PII.
function mask(s?: string | null): string {
  if (!s) return '—';
  const t = String(s).trim();
  if (t.length <= 3) return '•'.repeat(t.length);
  return t.slice(0, 2) + '•'.repeat(Math.max(1, t.length - 4)) + t.slice(-2);
}

export default async function FundRecordsPage({
  searchParams,
}: {
  searchParams: { updated?: string; failed?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const { data: rows } = await supabase
    .from('member_finances')
    .select('member_no, full_name, national_id, phone, member_id, current_balance')
    .order('member_no', { ascending: true });
  const list = (rows ?? []) as any[];

  const total = list.length;
  const withId = list.filter((r) => r.national_id).length;
  const withPhone = list.filter((r) => r.phone).length;
  const linked = list.filter((r) => r.member_id).length;

  // Mask identifiers HERE, on the server — the client table receives only the
  // masked strings, so raw National ID / phone never reach the browser.
  const safeRows = list.map((r) => ({
    member_no: String(r.member_no),
    full_name: String(r.full_name || ''),
    nationalId: mask(r.national_id),
    phone: mask(r.phone),
    linked: !!r.member_id,
  }));

  const updated = Number(searchParams?.updated || 0);
  const failed = Number(searchParams?.failed || 0);
  const showResult = !!(searchParams?.updated || searchParams?.failed);

  const kpis = [
    { label: 'Register records', value: total, icon: 'fa-list-ol' },
    { label: 'National ID on file', value: `${withId}/${total}`, icon: 'fa-id-card' },
    { label: 'Phone on file', value: `${withPhone}/${total}`, icon: 'fa-phone' },
    { label: 'Linked to a login', value: `${linked}/${total}`, icon: 'fa-link' },
  ];

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div className="page-title">Fund records</div>
      <div className="sub">
        Load each member&apos;s National ID / Passport (and phone) onto her AWIVEST register record, so she is matched to
        her figures automatically when she registers. These identifiers are private and used only for matching.
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', margin: '22px 0 18px' }}>
        {kpis.map((k) => (
          <div key={k.label} className="card kpi hover-lift">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="lbl">{k.label}</span>
              <span className="ic" style={{ background: 'var(--surface2)', color: 'var(--lime2)' }}>
                <i className={`fa-solid ${k.icon}`} />
              </span>
            </div>
            <div className="val num">{k.value}</div>
          </div>
        ))}
      </div>

      {showResult && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <i className={`fa-solid ${failed ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} style={{ color: failed ? 'var(--warn2, #e2b93b)' : 'var(--lime2)' }} />{' '}
          Imported {updated} record{updated === 1 ? '' : 's'}
          {failed ? `. ${failed} line${failed === 1 ? '' : 's'} could not be matched to a register number or hit a duplicate-identifier check — check those and re-paste.` : '.'}
        </div>
      )}

      {/* Import */}
      <form action={importFundIdentifiers} className="card card-pad" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Import identifiers</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          One member per line: <code>member_no, national_id, phone</code> (phone optional). Comma-, tab- or
          semicolon-separated, so you can paste straight from a spreadsheet. Member numbers may be <code>AWI-007</code> or
          just <code>7</code>. Existing values are overwritten; blank cells are left unchanged.
        </div>
        <textarea
          className="input"
          name="data"
          rows={8}
          required
          placeholder={'AWI-001, 12345678, 0719261277\nAWI-002, A0123456, +254712345678'}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, width: '100%' }}
        />
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-lime" type="submit">
            <i className="fa-solid fa-file-import" /> Import
          </button>
        </div>
      </form>

      {/* Status table (search + unlinked filter; identifiers masked server-side) */}
      <RegisterStatus rows={safeRows} />
    </div>
  );
}
