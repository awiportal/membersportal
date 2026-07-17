'use client';

import { useState } from 'react';

// A friendly Day / Month / Year picker for older members who find the native
// calendar pop-up fiddly. Works two ways:
//   * Controlled:  <DateSelect value={v} onChange={setV} />
//   * In a form:   <DateSelect name="date_of_birth" defaultValue={...} />  ->
//                  it renders a hidden input so the yyyy-mm-dd value submits.
// You can combine both (controlled value + name) — onboarding does this.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parse(v?: string | null): { d: string; m: string; y: string } {
  if (!v) return { d: '', m: '', y: '' };
  const match = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { d: '', m: '', y: '' };
  return { y: match[1], m: String(Number(match[2])), d: String(Number(match[3])) };
}

function daysInMonth(y: number, m: number): number {
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

export default function DateSelect({
  name,
  value,
  defaultValue,
  onChange,
  fromYear,
  toYear,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  fromYear?: number;
  toYear?: number;
}) {
  const controlled = value !== undefined;
  const now = new Date();
  const maxY = toYear ?? now.getFullYear();
  const minY = fromYear ?? 1930;

  const [inner, setInner] = useState(() => parse(value ?? defaultValue));
  const cur = controlled ? parse(value) : inner;
  const { d, m, y } = cur;

  function combine(nd: string, nm: string, ny: string): string {
    if (nd && nm && ny) {
      return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
    }
    return '';
  }

  function update(nd: string, nm: string, ny: string) {
    // Clamp the day if the new month/year has fewer days.
    let day = nd;
    if (day && nm && ny) {
      const dim = daysInMonth(Number(ny), Number(nm));
      if (Number(day) > dim) day = String(dim);
    }
    if (!controlled) setInner({ d: day, m: nm, y: ny });
    onChange?.(combine(day, nm, ny));
  }

  const years: number[] = [];
  for (let i = maxY; i >= minY; i--) years.push(i);

  const dim = daysInMonth(Number(y), Number(m));
  const days: number[] = [];
  for (let i = 1; i <= dim; i++) days.push(i);

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1.5fr 1.1fr' }}>
      <select className="input" aria-label="Day" value={d} onChange={(e) => update(e.target.value, m, y)}>
        <option value="">Day</option>
        {days.map((n) => (
          <option key={n} value={String(n)}>{n}</option>
        ))}
      </select>
      <select className="input" aria-label="Month" value={m} onChange={(e) => update(d, e.target.value, y)}>
        <option value="">Month</option>
        {MONTHS.map((label, i) => (
          <option key={label} value={String(i + 1)}>{label}</option>
        ))}
      </select>
      <select className="input" aria-label="Year" value={y} onChange={(e) => update(d, m, e.target.value)}>
        <option value="">Year</option>
        {years.map((n) => (
          <option key={n} value={String(n)}>{n}</option>
        ))}
      </select>
      {name ? <input type="hidden" name={name} value={combine(d, m, y)} readOnly /> : null}
    </div>
  );
}
