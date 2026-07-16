// Shared constants for the member onboarding journey (manual sections 3.3–3.8)

export const KYC_DOC_TYPES = [
  { key: 'passport_photo', label: 'Passport photo', accept: 'image/*' },
  { key: 'national_id', label: 'Copy of National ID / Passport', accept: 'image/*,application/pdf' },
  { key: 'kra_pin', label: 'KRA PIN certificate', accept: 'image/*,application/pdf' },
] as const;

export type KycDocKey = (typeof KYC_DOC_TYPES)[number]['key'];

export const RELATION_KINDS = [
  { key: 'next_of_kin', label: 'Next of kin', required: true },
  { key: 'beneficiary', label: 'Beneficiary', required: false },
  { key: 'nominee', label: 'Nominee', required: false },
] as const;

export type RelationKey = (typeof RELATION_KINDS)[number]['key'];

export const ONBOARDING_ORDER = ['personal', 'documents', 'agreements', 'review', 'submitted'] as const;
export type OnboardingStep = (typeof ONBOARDING_ORDER)[number];

// The single membership packet the member consents to (manual 3.5).
export const AGREEMENT_TITLE =
  'AWI Membership Agreement, Terms & Conditions and Confidentiality Agreement';
