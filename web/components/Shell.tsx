'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { createClient } from '@/lib/supabase/client';
import { isStaff } from '@/lib/roles';
import ThemeToggle from './ThemeToggle';

// Sections a member can reach before their membership is approved (manual 3.7):
// Dashboard, KYC/onboarding, Profile, Notifications, Settings. The rest lock.
const ALLOWED_WHEN_PENDING = new Set(['dashboard', 'kyc', 'profile', 'notifications', 'settings']);

export default function Shell({
  profile,
  email,
  children,
}: {
  profile: any;
  email: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isActive = profile?.status === 'active';
  let active = (pathname || '/dashboard').replace(/^\//, '') || 'dashboard';
  if ((pathname || '').startsWith('/onboarding')) active = 'kyc';
  const name = profile?.full_name || email || 'Member';
  const initials = name.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function hrefFor(id: string) {
    if (id === 'dashboard') return '/dashboard';
    if (id === 'kyc') return isActive ? '/kyc' : '/onboarding';
    return `/${id}`;
  }

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 20px 8px' }}>
          <div className="grad-lime" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#20260a', fontWeight: 900, fontSize: 18 }}>A</div>
          <div><div style={{ fontWeight: 800, letterSpacing: '-.3px' }}>AWIVEST</div><div className="muted" style={{ fontSize: 11 }}>Investor Portal</div></div>
        </div>
        <nav className="side-scroll">
          {isStaff(profile?.role) && (
            <Link
              href="/staff"
              className="nav-item"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 6 }}
              onClick={() => setOpen(false)}
            >
              <i className="fa-solid fa-user-shield" />
              <span>Staff console</span>
            </Link>
          )}
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="nav-group-label">{group.group}</div>
              {group.items.map((it) => {
                const locked = !isActive && !ALLOWED_WHEN_PENDING.has(it.id);
                if (locked) {
                  return (
                    <div
                      key={it.id}
                      className="nav-item"
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                      title="Available once your membership is approved"
                    >
                      <i className={`fa-solid ${it.icon}`} />
                      <span>{it.label}</span>
                      <i className="fa-solid fa-lock" style={{ marginLeft: 'auto', fontSize: 11 }} />
                    </div>
                  );
                }
                return (
                  <Link
                    key={it.id}
                    href={hrefFor(it.id)}
                    className={`nav-item ${active === it.id ? 'active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    <i className={`fa-solid ${it.icon}`} />
                    <span>{it.label}</span>
                    {it.tag && <span className="tag">{it.tag}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8 }}>
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{profile?.investor_id || 'Pending ID'}</div>
            </div>
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 34, height: 34 }} onClick={signOut} title="Sign out">
              <i className="fa-solid fa-arrow-right-from-bracket" style={{ fontSize: 13 }} />
            </button>
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><i className="fa-solid fa-bars" /></button>
          <label className="search"><i className="fa-solid fa-magnifying-glass" /><input placeholder="Search holdings, forms, documents…" aria-label="Search" /></label>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={`badge ${isActive ? 'badge-good' : 'badge-warn'} hide-sm`}>{profile?.status ? String(profile.status)[0].toUpperCase() + String(profile.status).slice(1) : 'Member'}</span>
            <ThemeToggle />
            <button className="icon-btn" aria-label="Notifications"><i className="fa-solid fa-bell" /></button>
            <div className="avatar" title={name}>{initials}</div>
          </div>
        </header>
        <main className="view">{children}</main>
      </div>
    </div>
  );
}
