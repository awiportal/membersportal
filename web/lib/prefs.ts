// web/lib/prefs.ts
// Shared definitions for member Settings: notification categories, delivery
// channels, and the language list. Kept here so the Settings UI and the server
// actions validate against the exact same keys.

export type PrefDef = { key: string; label: string; desc: string; default: boolean };

export const NOTIFICATION_PREFS: PrefDef[] = [
  { key: 'dividend_alerts', label: 'Dividend alerts', desc: 'When a dividend is declared or paid out', default: true },
  { key: 'new_opportunities', label: 'New opportunities', desc: 'When a new investment opportunity opens', default: true },
  { key: 'statement_ready', label: 'Statement ready', desc: 'When a new account statement is available', default: true },
  { key: 'contribution_receipts', label: 'Contribution receipts', desc: 'When one of your contributions is confirmed', default: true },
  { key: 'welfare_updates', label: 'Welfare updates', desc: 'Enrollment and claim updates', default: true },
  { key: 'annual_review', label: 'Annual profile review', desc: 'A yearly nudge to refresh your financial profile', default: true },
  { key: 'marketing', label: 'AWIVEST news & events', desc: 'Newsletters, summit invites and announcements', default: false },
];

export const CHANNEL_PREFS: PrefDef[] = [
  { key: 'channel_email', label: 'Email', desc: 'Send notifications to your email address', default: true },
  { key: 'channel_sms', label: 'SMS', desc: 'Send critical alerts by SMS where available', default: false },
];

export const ALL_PREFS: PrefDef[] = [...NOTIFICATION_PREFS, ...CHANNEL_PREFS];
export const ALL_PREF_KEYS: string[] = ALL_PREFS.map((p) => p.key);

// Languages relevant to AWIVEST's continental + diaspora membership.
export const LOCALES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'sw', label: 'Kiswahili' },
  { value: 'fr', label: 'Français (French)' },
  { value: 'pt', label: 'Português (Portuguese)' },
  { value: 'ar', label: 'العربية (Arabic)' },
  { value: 'am', label: 'አማርኛ (Amharic)' },
  { value: 'es', label: 'Español (Spanish)' },
  { value: 'de', label: 'Deutsch (German)' },
  { value: 'zh', label: '中文 (Chinese)' },
];
export const LOCALE_CODES: string[] = LOCALES.map((l) => l.value);

// Fallback list if the browser doesn't expose Intl.supportedValuesOf('timeZone').
export const FALLBACK_TIMEZONES: string[] = [
  'Africa/Nairobi', 'Africa/Lagos', 'Africa/Accra', 'Africa/Cairo', 'Africa/Johannesburg',
  'Africa/Kampala', 'Africa/Dar_es_Salaam', 'Africa/Kigali', 'Africa/Addis_Ababa',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'Asia/Dubai', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney', 'UTC',
];

// Merge stored prefs with defaults so every known key is a real boolean.
export function withDefaults(stored: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of ALL_PREFS) {
    const v = stored?.[p.key];
    out[p.key] = typeof v === 'boolean' ? v : p.default;
  }
  return out;
}
