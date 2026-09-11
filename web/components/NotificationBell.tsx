'use client';

// In-app notification bell: live unread badge, dropdown panel, and a toast
// "pop" the moment a new notification lands. New rows arrive via Supabase
// Realtime (postgres_changes on `notifications`, RLS-filtered to the signed-in
// member). A window-focus + slow poll fallback keeps it correct even where
// Realtime isn't enabled. Used by both the member Shell and the StaffShell.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Notif = {
  id: string;
  type: string | null;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  link_url?: string | null;
};

// Icon + accent per notification type, aligned with the /notifications page and
// the Information Center categories (announcement/news/event/update).
const META: Record<string, { icon: string; color: string }> = {
  approval: { icon: 'fa-user-check', color: 'var(--good)' },
  onboarding: { icon: 'fa-id-card-clip', color: 'var(--info)' },
  kyc: { icon: 'fa-id-card-clip', color: 'var(--info)' },
  agreement: { icon: 'fa-file-contract', color: 'var(--lime2)' },
  payment: { icon: 'fa-money-bill-trend-up', color: 'var(--lime2)' },
  contribution: { icon: 'fa-hand-holding-dollar', color: 'var(--lime2)' },
  statement: { icon: 'fa-file-invoice-dollar', color: 'var(--lime2)' },
  document: { icon: 'fa-folder-open', color: 'var(--info)' },
  dividend: { icon: 'fa-coins', color: 'var(--warn)' },
  welfare: { icon: 'fa-hand-holding-heart', color: 'var(--purple2)' },
  withdrawal: { icon: 'fa-money-bill-transfer', color: 'var(--warn)' },
  event: { icon: 'fa-calendar-day', color: 'var(--lime2)' },
  news: { icon: 'fa-newspaper', color: 'var(--info)' },
  announcement: { icon: 'fa-bullhorn', color: 'var(--purple2)' },
  update: { icon: 'fa-rotate', color: 'var(--info)' },
  default: { icon: 'fa-bell', color: 'var(--muted2)' },
};
const metaFor = (t?: string | null) => META[t || 'default'] || META.default;

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB');
}

const STYLE = `
@keyframes nbell-shake{0%,100%{transform:rotate(0)}15%{transform:rotate(15deg)}30%{transform:rotate(-13deg)}45%{transform:rotate(9deg)}60%{transform:rotate(-6deg)}75%{transform:rotate(3deg)}}
@keyframes nbell-pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}
@keyframes nbell-in{0%{transform:translateX(118%);opacity:0}100%{transform:translateX(0);opacity:1}}
.nbell-ring{animation:nbell-shake .8s ease;transform-origin:top center}
.nbell-badge{animation:nbell-pop .3s ease}
.nbell-toast{animation:nbell-in .34s cubic-bezier(.2,.8,.2,1)}
.nbell-item{display:flex;gap:11px;padding:11px 12px;border-radius:12px;cursor:pointer;transition:background .15s;align-items:flex-start;text-align:left;width:100%;background:transparent;border:0;font:inherit;color:inherit}
.nbell-item:hover{background:var(--surface2)}
.nbell-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
`;

function IconChip({ type, size = 36 }: { type?: string | null; size?: number }) {
  const m = metaFor(type);
  return (
    <span
      style={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: 11,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface2)',
        color: m.color,
      }}
    >
      <i className={`fa-solid ${m.icon}`} style={{ fontSize: size * 0.42 }} />
    </span>
  );
}

function ToastCard({ n, onClose, onOpen }: { n: Notif; onClose: () => void; onOpen: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onClose, 6500);
  }, [onClose]);
  useEffect(() => {
    start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [start]);
  return (
    <div
      className="nbell-toast card"
      role="alert"
      onClick={onOpen}
      onMouseEnter={() => timer.current && clearTimeout(timer.current)}
      onMouseLeave={start}
      style={{
        width: 340,
        maxWidth: '86vw',
        padding: 13,
        display: 'flex',
        gap: 11,
        alignItems: 'flex-start',
        boxShadow: '0 18px 46px -18px rgba(0,0,0,.55)',
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
    >
      <IconChip type={n.type} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{n.title}</div>
        {n.body ? (
          <div className="muted nbell-clamp" style={{ fontSize: 12.5, marginTop: 2 }}>
            {n.body}
          </div>
        ) : null}
      </div>
      <button
        aria-label="Dismiss"
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{ width: 28, height: 28, flex: 'none' }}
      >
        <i className="fa-solid fa-xmark" style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}

export default function NotificationBell({
  userId,
  viewAllHref,
}: {
  userId?: string;
  viewAllHref?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [uid, setUid] = useState<string | undefined>(userId);
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notif[]>([]);
  const [ring, setRing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const unread = items.reduce((a, i) => a + (i.read ? 0 : 1), 0);

  useEffect(() => setMounted(true), []);

  // Resolve the signed-in user id if the caller didn't supply it.
  useEffect(() => {
    if (uid) return;
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive && data.user) setUid(data.user.id);
    });
    return () => {
      alive = false;
    };
  }, [uid, supabase]);

  const pushToasts = useCallback((fresh: Notif[]) => {
    if (!fresh.length) return;
    setToasts((prev) => [...fresh, ...prev.filter((p) => !fresh.some((f) => f.id === p.id))].slice(0, 4));
    setRing(true);
    setTimeout(() => setRing(false), 900);
  }, []);

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, created_at, link_url')
      .eq('member_id', uid)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!data) return;
    const list = data as Notif[];
    // On any refresh after the first, toast rows we haven't seen before (the
    // fallback path when Realtime isn't delivering).
    if (initialized.current) {
      const fresh = list.filter((n) => !knownIds.current.has(n.id) && !n.read);
      pushToasts(fresh);
    }
    list.forEach((n) => knownIds.current.add(n.id));
    initialized.current = true;
    setItems(list);
  }, [uid, supabase, pushToasts]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription + focus/visibility refetch + slow poll safety net.
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notif:${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as Notif;
          if (knownIds.current.has(n.id)) return;
          knownIds.current.add(n.id);
          setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 50)));
          pushToasts([n]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `member_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as Notif;
          setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, ...n } : p)));
        },
      )
      .subscribe();

    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const poll = setInterval(load, 45000);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(poll);
    };
  }, [uid, supabase, load, pushToasts]);

  // Close the panel on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = useCallback(
    async (id: string) => {
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, read: true } : p)));
      await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', id);
    },
    [supabase],
  );

  const markAll = useCallback(async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((p) => ({ ...p, read: true })));
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .in('id', ids);
  }, [items, supabase]);

  const openItem = useCallback(
    (n: Notif) => {
      markRead(n.id);
      setOpen(false);
      setToasts((prev) => prev.filter((t) => t.id !== n.id));
      if (n.link_url) router.push(n.link_url);
    },
    [markRead, router],
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <style>{STYLE}</style>
      <button
        className="icon-btn"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ position: 'relative' }}
      >
        <i className={`fa-solid fa-bell${ring ? ' nbell-ring' : ''}`} />
        {unread > 0 && (
          <span
            key={unread}
            className="nbell-badge"
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              minWidth: 17,
              height: 17,
              padding: '0 4px',
              borderRadius: 9,
              background: '#ef5a5a',
              color: '#fff',
              fontSize: 10.5,
              fontWeight: 800,
              lineHeight: '17px',
              textAlign: 'center',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="menu-pop"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            width: 372,
            maxWidth: '92vw',
            maxHeight: 'min(70vh, 460px)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 95,
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 22px 52px -18px rgba(0,0,0,.55)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '13px 15px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14.5 }}>Notifications</div>
            {unread > 0 && <span className="badge badge-purple" style={{ fontSize: 11 }}>{unread} new</span>}
            <button
              onClick={markAll}
              disabled={!unread}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 0,
                color: 'var(--lime2)',
                opacity: unread ? 1 : 0.4,
                cursor: unread ? 'pointer' : 'default',
                font: 'inherit',
                fontSize: 12.5,
                fontWeight: 600,
                padding: 4,
              }}
            >
              Mark all read
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: 6 }}>
            {items.length === 0 ? (
              <div style={{ padding: '34px 18px', textAlign: 'center' }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    margin: '0 auto 10px',
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--surface2)',
                  }}
                >
                  <i className="fa-solid fa-bell-slash muted" />
                </div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>You&apos;re all caught up</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  New activity will appear here the moment it happens.
                </div>
              </div>
            ) : (
              items.map((n) => (
                <button key={n.id} className="nbell-item" onClick={() => openItem(n)}>
                  <IconChip type={n.type} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: n.read ? 600 : 800, fontSize: 13.5, flex: 1, minWidth: 0 }}>{n.title}</span>
                      {!n.read && <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 5, background: '#ef5a5a' }} />}
                    </div>
                    {n.body ? (
                      <div className="muted nbell-clamp" style={{ fontSize: 12.5, marginTop: 2 }}>
                        {n.body}
                      </div>
                    ) : null}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {viewAllHref && (
            <button
              onClick={() => {
                setOpen(false);
                router.push(viewAllHref);
              }}
              style={{
                border: 0,
                borderTop: '1px solid var(--border)',
                background: 'transparent',
                cursor: 'pointer',
                padding: 11,
                font: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--lime2)',
              }}
            >
              View all notifications
            </button>
          )}
        </div>
      )}

      {mounted &&
        toasts.length > 0 &&
        createPortal(
          <div
            aria-live="polite"
            style={{
              position: 'fixed',
              top: 16,
              right: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            {toasts.map((t) => (
              <ToastCard
                key={t.id}
                n={t}
                onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                onOpen={() => openItem(t)}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
