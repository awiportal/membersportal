// Shared constants for the member onboarding journey.

export type KycDoc = { key: string; label: string; accept: string; required: boolean };
export type KycDocKey = string;

const DOC_IMG_PDF = 'image/*,application/pdf';

// Per-account-type document checklists (international best practice). A member
// only ever sees the checklist for their own account type. `required` items
// gate submission; the rest are optional/supporting.
export const DOCS_BY_TYPE: Record<string, KycDoc[]> = {
  individual: [
    { key: 'passport_photo',   label: 'Passport-size photo',                              accept: 'image/*',   required: true },
    { key: 'national_id',      label: 'National ID / Passport copy',                      accept: DOC_IMG_PDF, required: true },
    { key: 'proof_of_address', label: 'Proof of address (utility bill / bank statement)', accept: DOC_IMG_PDF, required: false },
    { key: 'tax_certificate',  label: 'Tax certificate / KRA PIN',                        accept: DOC_IMG_PDF, required: false },
  ],
  group: [
    { key: 'group_constitution', label: 'Group constitution / registration certificate',          accept: DOC_IMG_PDF, required: true },
    { key: 'officials_ids',      label: "Officials' IDs (chairperson, secretary, treasurer)",      accept: DOC_IMG_PDF, required: true },
    { key: 'group_resolution',   label: 'Group resolution / minutes authorising the investment',   accept: DOC_IMG_PDF, required: true },
    { key: 'member_list',        label: 'Group member list',                                       accept: DOC_IMG_PDF, required: false },
    { key: 'tax_certificate',    label: 'Tax / PIN certificate',                                   accept: DOC_IMG_PDF, required: false },
  ],
  corporate: [
    { key: 'certificate_incorporation', label: 'Certificate of Incorporation',                accept: DOC_IMG_PDF, required: true },
    { key: 'company_registration',      label: 'Company registration (CR12 or equivalent)',   accept: DOC_IMG_PDF, required: true },
    { key: 'directors_ids',             label: "Directors' / authorised signatories' IDs",    accept: DOC_IMG_PDF, required: true },
    { key: 'board_resolution',          label: 'Board resolution authorising the investment', accept: DOC_IMG_PDF, required: true },
    { key: 'proof_of_address',          label: 'Proof of registered address',                 accept: DOC_IMG_PDF, required: false },
    { key: 'tax_certificate',           label: 'Tax certificate',                             accept: DOC_IMG_PDF, required: false },
  ],
  other: [
    { key: 'national_id',         label: 'ID / registration document', accept: DOC_IMG_PDF, required: false },
    { key: 'supporting_document', label: 'Supporting document',        accept: DOC_IMG_PDF, required: false },
  ],
};

export function docsFor(memberType: string | null | undefined): KycDoc[] {
  return DOCS_BY_TYPE[(memberType as string) || 'individual'] ?? DOCS_BY_TYPE.individual;
}

// Documents that MUST be uploaded before a member can submit, per account type.
export function requiredDocsFor(memberType: string | null | undefined): string[] {
  return docsFor(memberType).filter((d) => d.required).map((d) => d.key);
}

// Back-compat alias: the original flat (individual) checklist.
export const KYC_DOC_TYPES = DOCS_BY_TYPE.individual;

export const RELATION_KINDS = [
  { key: 'next_of_kin', label: 'Next of kin', required: true },
  { key: 'beneficiary', label: 'Beneficiary', required: false },
  { key: 'nominee', label: 'Nominee', required: false },
] as const;

export type RelationKey = (typeof RELATION_KINDS)[number]['key'];

export const ONBOARDING_ORDER = ['personal', 'documents', 'agreements', 'review', 'submitted'] as const;
export type OnboardingStep = (typeof ONBOARDING_ORDER)[number];

// Account types (set at registration). Drives which membership fields and
// documents a member is asked for.
export type MemberType = 'individual' | 'group' | 'corporate' | 'other';

export function memberTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case 'group': return 'Group (Chama)';
    case 'corporate': return 'Corporate (Institution)';
    case 'other': return 'Other';
    default: return 'Individual';
  }
}

// The single membership packet the member consents to (manual 3.5).
export const AGREEMENT_TITLE =
  'AWI Membership Agreement, Terms & Conditions and Confidentiality Agreement';
