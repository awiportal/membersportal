"use client";

import { useState } from "react";
import FancySelect from "./FancySelect";

// A friendly Day / Month / Year picker for members who find the native calendar
// pop-up fiddly. Built on FancySelect so the Year list has a visible scrollbar
// and type-to-filter instead of the OS dropdown. Works two ways:
//   * Controlled:  <DateSelect value={v} onChange={setV} />
//   * In a form:   <DateSelect name="date_of_birth" defaultValue={...} />  ->
//                  it renders a hidden input so the yyyy-mm-dd value submits.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parse(v?: string | null): { d: string; m: string; y: string } {
  if (v === undefined || v === null || v === "") return { d: "", m: "", y: "" };
  const match = String(v).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match === null) return { d: "", m: "", y: "" };
  return { y: match[1], m: String(Number(match[2])), d: String(Number(match[3])) };
}

function daysInMonth(y: number, m: number): number {
  if (Number.isFinite(y) === false || Number.isFinite(m) === false || m < 1) return 31;
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
  const controlled = typeof value === "string";
  const now = new Date();
  const maxY = toYear ?? now.getFullYear();
  const minY = fromYear ?? 1930;

  const [inner, setInner] = useState(() => parse(value ?? defaultValue));
  const cur = controlled ? parse(value) : inner;
  const { d, m, y } = cur;

  function combine(nd: string, nm: string, ny: string): string {
    if (nd && nm && ny) {
      return ny + "-" + String(nm).padStart(2, "0") + "-" + String(nd).padStart(2, "0");
    }
    return "";
  }

  function update(nd: string, nm: string, ny: string) {
    let day = nd;
    if (day && nm && ny) {
      const dim = daysInMonth(Number(ny), Number(nm));
      if (Number(day) > dim) day = String(dim);
    }
    if (controlled === false) setInner({ d: day, m: nm, y: ny });
    if (onChange) onChange(combine(day, nm, ny));
  }

  const years: number[] = [];
  for (let i = maxY; i >= minY; i--) years.push(i);

  const dim = daysInMonth(Number(y), Number(m));
  const days: number[] = [];
  for (let i = 1; i <= dim; i++) days.push(i);

  const dayOpts = days.map((n) => ({ value: String(n), label: String(n) }));
  const monthOpts = MONTHS.map((label, i) => ({ value: String(i + 1), label }));
  const yearOpts = years.map((n) => ({ value: String(n), label: String(n) }));

  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1.5fr 1.1fr" }}>
      <FancySelect ariaLabel="Day" placeholder="Day" options={dayOpts} value={d} onChange={(v) => update(v, m, y)} searchable={false} />
      <FancySelect ariaLabel="Month" placeholder="Month" options={monthOpts} value={m} onChange={(v) => update(d, v, y)} searchable={false} />
      <FancySelect ariaLabel="Year" placeholder="Year" options={yearOpts} value={y} onChange={(v) => update(d, m, v)} />
      {name ? <input type="hidden" name={name} value={combine(d, m, y)} readOnly /> : null}
    </div>
  );
}
