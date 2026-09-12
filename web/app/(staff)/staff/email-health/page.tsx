import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canViewStaffConsole } from '@/lib/roles';
import { sendTestEmail } from './actions';

export const dynamic = 'force-dynamic';

// Email health: a staff-only diagnostic for the transactional-email (Resend)
// setup. Shows whether the env vars are present and sends a live test through
// the real sendMemberEmail path, so any Resend error (e.g. an unverified sender
// domain) surfaces immediately instead of failing silently.
export default async function EmailHealthPage({
  searchParams,
}: {
  searchParams: { sent?: string; err?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');

  const resendSet = !!process.env.RESEND_API_KEY;
  const fromSet = !!process.env.EMAIL_FROM;
  const fromVal = process.env.EMAIL_FROM || '(not set)';
  const sent = searchParams?.sent;
  const err = searchParams?.err;

  const inputStyle = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontFamily: 'inherit',
    fontSize: 14,
  } as const;

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 640 }}>
      <div>
        <h1 className="page-title">Email health</h1>
        <p className="section-sub">Transactional email (Resend) configuration and a live test send.</p>
      </div>

      <div className="card card-pad" style={{ display: 'grid', gap: 12 }}>
        <div className="section-title">Configuration</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className={`badge ${resendSet ? 'badge-good' : 'badge-bad'}`}>{resendSet ? 'set' : 'missing'}</span>
          <code>RESEND_API_KEY</code>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`badge ${fromSet ? 'badge-good' : 'badge-bad'}`}>{fromSet ? 'set' : 'missing'}</span>
          <code>EMAIL_FROM</code>
          <span className="section-sub">{fromVal}</span>
        </div>
      </div>

      {sent ? (
        <div className="card card-pad" style={{ borderColor: 'var(--lime)' }}>
          Test email sent to <b>{sent}</b>. Check the inbox and Resend &rarr; Emails / Logs.
        </div>
      ) : null}
      {err ? (
        <div className="card card-pad" style={{ borderColor: '#e0526a' }}>
          Send failed: <b>{err}</b>
        </div>
      ) : null}

      <form action={sendTestEmail} className="card card-pad" style={{ display: 'grid', gap: 12 }}>
        <div className="section-title">Send a test email</div>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="section-sub">Recipient (defaults to your own address)</span>
          <input name="to" type="email" placeholder={user.email ?? 'you@example.com'} style={inputStyle} />
        </label>
        <button type="submit" className="btn btn-lime" style={{ width: 'fit-content' }}>
          Send test email
        </button>
      </form>
    </div>
  );
}
