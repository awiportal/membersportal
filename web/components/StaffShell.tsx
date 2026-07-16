'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { roleLabel } from '@/lib/roles';

export default function StaffShell({
  profile,
  email,
  children,
}: {
  profile: any;
  email: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || '/staff';
  const router = useRouter();
  const name = profile?.full_name || email || 'Staff';
  const initials = name.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 20px 8px' }}>
          <div className="grad-purple" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: 18 }}>A</div>
          <div><div style={{ fontWeight: 800, letterSpacing: '-.3px' }}>AWIVEST</div><div className="muted" style={{ fontSize: 11 }}>Staff Console</div></div>
        </div>
        <nav className="side-scroll">
          <div className="nav-group-label">Management</div>
          <Link href="/staff" className={`nav-item ${(pathname === '/staff' || pathname.startsWith('/staff/members')) ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-user-check" /><span>Approvals &amp; Members</span>
          </Link>
          <Link href="/staff/agreements" className={`nav-item ${pathname.startsWith('/staff/agreements') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-file-contract" /><span>Agreements</span>
          </Link>
          <div className="nav-group-label">Coming soon</div>
          {[
            ['Documents & statements', 'fa-folder-open'],
            ['Welfare', 'fa-hand-holding-heart'],
            ['Opportunities', 'fa-lightbulb'],
            ['Reports', 'fa-chart-column'],
          ].map(([l, ic]) => (
            <div key={l} className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Being wired up next">
              <i className={`fa-solid ${ic}`} /><span>{l}</span>
            </div>
          ))}
          <div className="nav-group-label">Portal</div>
          <Link href="/dashboard" className="nav-item" onClick={() => setOpen(false)}>
            <i className="fa-solid fa-arrow-left-long" /><span>Investor portal</span>
          </Link>
        </nav>
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8 }}>
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{roleLabel(profile?.role)}</div>
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
          <div style={{ fontWeight: 700 }}>Staff Console</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="badge badge-purple hide-sm">{roleLabel(profile?.role)}</span>
            <div className="avatar" title={name}>{initials}</div>
          </div>
        </header>
        <main className="view">{children}</main>
      </div>
    </div>
  );
}
