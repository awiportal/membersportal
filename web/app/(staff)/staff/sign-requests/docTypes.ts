// Shared doc_type allow-set for the Documents to Sign module. Kept in a plain
// (non-"use server", non-"use client") module so it can be imported by BOTH the
// staff server action (for validation) and the client select (for options).
export const SIGN_DOC_TYPES = [
  'enrollment',
  'claim',
  'exit',
  'welfare_statement',
  'kyc',
  'other',
] as const;

export type SignDocType = (typeof SIGN_DOC_TYPES)[number];

export const DOC_TYPE_SET = new Set<string>(SIGN_DOC_TYPES as unknown as string[]);

export const DOC_TYPE_OPTIONS: { value: SignDocType; label: string }[] = [
  { value: 'enrollment', label: 'Enrollment' },
  { value: 'claim', label: 'Claim' },
  { value: 'exit', label: 'Exit' },
  { value: 'welfare_statement', label: 'Welfare statement' },
  { value: 'kyc', label: 'KYC' },
  { value: 'other', label: 'Other' },
];

export function docTypeLabel(v?: string | null): string {
  const found = DOC_TYPE_OPTIONS.find((o) => o.value === v);
  return found ? found.label : 'Other';
}
