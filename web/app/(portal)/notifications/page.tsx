import { createClient } from '@/lib/supabase/server';
import { markAllRead } from './actions';

export const dynamic = 'force-dynamic';

const ICON: Record<string, { i: string; c: string }> = {
  approval: { i: 'fa-user-check', c: 'var(--good)' },
  onboarding: { i: 'fa-id-card-clip', c: 'var(--info)' },
  agreement: { i: 'fa-file-contract', c: 'var(--lime2)' },
  payment: { i: 'fa-money-bill-trend-up', c: 'var(--lime2)' },
  document: { i: 'fa-folder-open', c: 'var(--info)' },
  dividend: { i: 'fa-coins', c: 'var(--warn)' },
};
function iconFor(t?: string) {
  return ICON[t || ''] || { i: 'fa-bell', c: 'var(--muted2)' };
}

export default async function NotificationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const { data: rows } = await supabase
    .from('notifications')
    .select('*')
    .eq('member_id', uid)
    .order('created_at', { ascending: false });
  const notifs = (rows ?? []) as any[];
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">Notifications</div>
          <div className="sub">Approvals, contributions, statements and document requests.{unread ? ` · ${unread} unread` : ''}</div>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button className="btn btn-ghost btn-sm" type="submit">Mark all read</button>
          </form>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notifs.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No notifications yet.</div>
        ) : (
          notifs.map((n) => {
            const ic = iconFor(n.type);
            return (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: n.read ? 'transparent' : 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span className="ic" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: ic.c }}>
                  <i className={`fa-solid ${ic.i}`} />
                </span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {n.title}
                    {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lime)', display: 'inline-block' }} />}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{n.body}</div>
                </div>
                <span className="muted" style={{ fontSize: 11.5 }}>{n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB') : ''}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
