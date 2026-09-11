'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { roleLabel, isAdmin } from '@/lib/roles';

// Shows the user's uploaded photo when present, otherwise their coloured
// initials — same 40x40 rounded shape everywhere.
function Avatar({ url, initials, title }: { url?: string | null; initials: string; title?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" title={title} className="avatar" style={{ objectFit: 'cover', padding: 0 }} />;
  }
  return <div className="avatar" title={title}>{initials}</div>;
}

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/awi-logo.png" alt="AWIVEST" width={40} height={40} style={{ display: 'block' }} />
          <div><div style={{ fontWeight: 800, letterSpacing: '-.3px' }}>AWIVEST</div><div className="muted" style={{ fontSize: 11 }}>Staff Console</div></div>
        </div>
        <nav className="side-scroll">
          <div className="nav-group-label">Management</div>
          <Link href="/staff" className={`nav-item ${(pathname === '/staff' || pathname.startsWith('/staff/members')) ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-user-check" /><span>Approvals &amp; Members</span>
          </Link>
          <Link href="/staff/statements" className={`nav-item ${pathname.startsWith('/staff/statements') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-file-invoice-dollar" /><span>Member statements</span>
          </Link>
          <Link href="/staff/agreements" className={`nav-item ${pathname.startsWith('/staff/agreements') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-file-contract" /><span>Agreements</span>
          </Link>
          <Link href="/staff/documents" className={`nav-item ${pathname.startsWith('/staff/documents') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-folder-open" /><span>Documents</span>
          </Link>
          <Link href="/staff/kyc" className={`nav-item ${pathname.startsWith('/staff/kyc') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-id-card-clip" /><span>KYC review</span>
          </Link>
          <Link href="/staff/welfare" className={`nav-item ${pathname.startsWith('/staff/welfare') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-hand-holding-heart" /><span>Welfare claims</span>
          </Link>
          <Link href="/staff/fund-records" className={`nav-item ${pathname.startsWith('/staff/fund-records') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-file-import" /><span>Fund records</span>
          </Link>
          <Link href="/staff/fund-data" className={`nav-item ${pathname.startsWith('/staff/fund-data') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-database" /><span>Fund data</span>
          </Link>
          <Link href="/staff/opportunities" className={`nav-item ${pathname.startsWith('/staff/opportunities') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-lightbulb" /><span>Opportunities</span>
          </Link>
          <Link href="/staff/reports" className={`nav-item ${pathname.startsWith('/staff/reports') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-chart-column" /><span>Reports &amp; distribution</span>
          </Link>
          <Link href="/staff/information" className={`nav-item ${pathname.startsWith('/staff/information') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-bullhorn" /><span>Information Center</span>
          </Link>
          <div className="nav-group-label">Administration</div>
          {isAdmin(profile?.role) ? (
            <Link href="/staff/roles" className={`nav-item ${pathname.startsWith('/staff/roles') ? 'active' : ''}`} onClick={() => setOpen(false)}>
              <i className="fa-solid fa-user-shield" /><span>Role management</span>
            </Link>
          ) : (
            <div className="nav-item" style={{ opacity: 0.45, cursor: 'not-allowed' }} title="Admin / Chairlady only">
              <i className="fa-solid fa-user-shield" /><span>Role management</span>
              <i className="fa-solid fa-lock" style={{ marginLeft: 'auto', fontSize: 11 }} />
            </div>
          )}
          <Link href="/staff/settings" className={`nav-item ${pathname.startsWith('/staff/settings') ? 'active' : ''}`} onClick={() => setOpen(false)}>
            <i className="fa-solid fa-gear" /><span>Settings</span>
          </Link>
          <div className="nav-group-label">Portal</div>
          <Link href="/dashboard" className="nav-item" onClick={() => setOpen(false)}>
            <i className="fa-solid fa-arrow-left-long" /><span>Investor portal</span>
          </Link>
        </nav>
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8 }}>
            <Avatar url={profile?.avatar_url} initials={initials} title={name} />
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
            <Avatar url={profile?.avatar_url} initials={initials} title={name} />
          </div>
        </header>
        <main className="view">{children}</main>
      </div>
    </div>
  );
}
