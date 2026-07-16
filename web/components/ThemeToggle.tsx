'use client';

import { useEffect, useState } from 'react';

// Light/dark toggle. Reads the theme the no-flash script already applied on
// <html>, flips it on click, and remembers the choice in localStorage.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('awivest-theme', next);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setTheme(next);
  }

  return (
    <button className="icon-btn" onClick={toggle} title="Toggle light / dark theme" aria-label="Toggle light or dark theme">
      <i className={`fa-solid ${theme === 'dark' ? 'fa-moon' : 'fa-sun'}`} />
    </button>
  );
}
