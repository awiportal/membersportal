export type NavItem = { id: string; label: string; icon: string; tag?: string };
export type NavGroup = { group: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { group: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
    { id: 'portfolio', label: 'Investment Portfolio', icon: 'fa-chart-pie' },
    { id: 'financial-profile', label: 'Financial Profile', icon: 'fa-heart-pulse', tag: 'MSI' },
  ]},
  { group: 'Planning', items: [
    { id: 'planning', label: 'Planning Centre', icon: 'fa-compass-drafting' },
    { id: 'goals', label: 'Goal Tracker', icon: 'fa-bullseye' },
  ]},
  { group: 'Transactions', items: [
    { id: 'payments', label: 'Payments', icon: 'fa-money-bill-transfer' },
    { id: 'dividends', label: 'Dividends', icon: 'fa-coins' },
    { id: 'statements', label: 'Statements', icon: 'fa-file-invoice-dollar' },
    { id: 'opportunities', label: 'Opportunities', icon: 'fa-lightbulb' },
  ]},
  { group: 'Compliance', items: [
    { id: 'forms', label: 'Online Forms', icon: 'fa-file-signature' },
    { id: 'kyc', label: 'KYC Verification', icon: 'fa-id-card-clip' },
    { id: 'documents', label: 'Document Centre', icon: 'fa-folder-open' },
    { id: 'agreements', label: 'Agreements', icon: 'fa-file-contract' },
    { id: 'welfare', label: 'Welfare', icon: 'fa-hand-holding-heart' },
  ]},
  { group: 'Account', items: [
    { id: 'profile', label: 'Profile', icon: 'fa-user' },
    { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },
    { id: 'settings', label: 'Settings', icon: 'fa-gear' },
  ]},
];

export const LABELS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.id, i.label]))
);
