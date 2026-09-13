'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

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
  const navRef = useRef<HTMLElement | null>(null);

  // On phones the strip scrolls horizontally; keep the active pill centred in
  // view so the current page is never hidden off the right edge. This only
  // scrolls the strip itself, never the page.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (nav.scrollWidth <= nav.clientWidth) return;
    const el = nav.querySelector('.is-here') as HTMLElement | null;
    if (!el) return;
    nav.scrollLeft = Math.max(0, el.offsetLeft - (nav.clientWidth - el.clientWidth) / 2);
  }, [path]);

  return (
    <div className="pagenav-wrap">
      <nav className="pagenav" ref={navRef}>
        {ITEMS.map((it) => {
          const active = path === it.href || path.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} className={active ? 'is-here' : undefined}>
              <i className={`fa-solid ${it.icon}`} /> {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
