// The six on-demand reports (#156). Shared by the hub, the generator page and
// the CSV route so slugs/labels never drift.
export type ReportType = 'agm' | 'finance' | 'tax' | 'audit' | 'committee' | 'member';

export const REPORTS: { slug: ReportType; label: string; desc: string; icon: string }[] = [
  { slug: 'agm', label: 'AGM report', desc: 'Membership and fund-position pack for the Annual General Meeting.', icon: 'fa-people-roof' },
  { slug: 'finance', label: 'Finance report', desc: 'Statement of the fund: opening, contributions, interest and withdrawals.', icon: 'fa-scale-balanced' },
  { slug: 'tax', label: 'Tax report (withholding)', desc: 'Interest earned per member with estimated withholding tax.', icon: 'fa-file-invoice-dollar' },
  { slug: 'audit', label: 'Audit report', desc: 'Control totals, per-member reconciliation and audit-log activity.', icon: 'fa-clipboard-check' },
  { slug: 'committee', label: 'Committee report', desc: 'Committee roles, meetings, attendance and open action items.', icon: 'fa-people-group' },
  { slug: 'member', label: 'Member report', desc: "Full member roster with each member's standing and share of the fund.", icon: 'fa-users' },
];

export const REPORT_SLUGS = REPORTS.map((r) => r.slug) as string[];

export function reportDef(slug: string) {
  return REPORTS.find((r) => r.slug === slug);
}
