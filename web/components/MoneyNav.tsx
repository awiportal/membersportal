'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
  { href: '/portfolio', icon: 'fa-chart-pie', label: 'Portfolio' },
  { href: '/contributions', icon: 'fa-hand-holding-dollar', label: 'Contributions' },
  { href: '/dividends', icon: 'fa-coins', label: 'Dividends' },
  { href: '/withdrawals', icon: 'fa-money-bill-wave', label: 'Withdrawals' },
  { href: '/statements', icon: 'fa-file-invoice-dollar', label: 'Statement' },
  { href: '/welfare', icon: 'fa-hand-holding-heart', label: 'Welfare' },
];

export default function MoneyNav() {
  const path = usePathname() || '';
  return (
    <nav className="pagenav">
      {ITEMS.map((it) => {
        const active = path === it.href || path.startsWith(it.href + '/');
        return (
          <Link key={it.href} href={it.href} className={active ? 'is-here' : undefined}>
            <i className={`fa-solid ${it.icon}`} /> {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
