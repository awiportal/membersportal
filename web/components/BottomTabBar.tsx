'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { id: string; href: string; icon: string; label: string };

// Primary destinations for an approved member.
const ACTIVE_ITEMS: Item[] = [
  { id: 'dashboard', href: '/dashboard', icon: 'fa-gauge-high', label: 'Home' },
  { id: 'portfolio', href: '/portfolio', icon: 'fa-chart-pie', label: 'Portfolio' },
  { id: 'contributions', href: '/contributions', icon: 'fa-hand-holding-dollar', label: 'Contribute' },
  { id: 'statements', href: '/statements', icon: 'fa-file-invoice-dollar', label: 'Statement' },
];

// Reduced set for a pending member (mirrors the pending-access allow-list).
const PENDING_ITEMS: Item[] = [
  { id: 'dashboard', href: '/dashboard', icon: 'fa-gauge-high', label: 'Home' },
  { id: 'kyc', href: '/onboarding', icon: 'fa-id-card-clip', label: 'KYC' },
  { id: 'notifications', href: '/notifications', icon: 'fa-bell', label: 'Updates' },
];

// Fixed bottom navigation for phones (hidden on desktop via CSS). The last cell
// is a "Menu" button that opens the full sidebar drawer.
export default function BottomTabBar({
  isActive,
  onMenu,
}: {
  isActive: boolean;
  onMenu: () => void;
}) {
  const path = usePathname() || '';
  const items = isActive ? ACTIVE_ITEMS : PENDING_ITEMS;
  const isHere = (href: string) => path === href || path.startsWith(href + '/');

  return (
    <nav className="bottombar" aria-label="Primary">
      {items.map((it) => (
        <Link
          key={it.id}
          href={it.href}
          className={isHere(it.href) ? 'is-here' : undefined}
          aria-current={isHere(it.href) ? 'page' : undefined}
        >
          <i className={`fa-solid ${it.icon}`} aria-hidden="true" />
          <span>{it.label}</span>
        </Link>
      ))}
      <button type="button" onClick={onMenu} aria-label="Open menu">
        <i className="fa-solid fa-bars" aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
