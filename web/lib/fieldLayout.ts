// Shared, dependency-free types + helpers for the VISUAL PDF field placement
// (PandaDoc-style) layer on the sequential Documents-to-Sign flow.
//
// This module deliberately has NO server-only imports (no supabase, no pdf-lib,
// no react), so it is safe to import from client components, server actions and
// the PDF stamper alike. The admin builder authors field DEFINITIONS (value =
// null) as boxes dropped on the PDF; each signer fills in the VALUES on THEIR
// boxes when they sign. A request whose field_layout is [] behaves exactly as
// before.
//
// Coordinates are NORMALIZED to 0..1 of the page width/height with the origin at
// the TOP-LEFT (the same convention pdf.js renders in). The completion stamper
// converts y into pdf-lib's BOTTOM-LEFT origin.

export type PlacedFieldType = 'signature' | 'name' | 'date' | 'text';

// One visually placed field on the PDF. Stored in sign_requests.field_layout as
// an ordered jsonb array of these objects.
export type PlacedField = {
  id: string;
  page: number; // 0-based page index
  x: number; // normalized 0..1 of page width,  top-left origin
  y: number; // normalized 0..1 of page height, top-left origin
  w: number; // normalized 0..1 of page width
  h: number; // normalized 0..1 of page height
  type: PlacedFieldType;
  signer_key: string; // 'member' (step-1 investor) or an office role lowercased
  label: string;
  required: boolean;
  value: string | null;
};

export const PLACED_FIELD_TYPES: readonly PlacedFieldType[] = [
  'signature',
  'name',
  'date',
  'text',
];

export function isPlacedFieldType(v: unknown): v is PlacedFieldType {
  return v === 'signature' || v === 'name' || v === 'date' || v === 'text';
}

// ---------------------------------------------------------------------------
// signer_key mapping
// ---------------------------------------------------------------------------
// Step 1 of every chain is the member/Investor -> 'member'. Office-holder steps
// use their role LABEL lowercased ('secretary'|'treasurer'|'chairlady'). Both the
// builder (when placing boxes) and the signing/stamping side derive the key the
// SAME way, so a box placed for e.g. the Treasurer matches the Treasurer's step
// on every chain of a broadcast.
export function officeSignerKey(roleLabel: string | null | undefined): string {
  return String(roleLabel ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function signerKeyForStep(
  stepOrder: number,
  signerRole: string | null | undefined
): string {
  return stepOrder === 1 ? 'member' : officeSignerKey(signerRole);
}

// ---------------------------------------------------------------------------
// Parsing / normalization
// ---------------------------------------------------------------------------
function clamp01(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function toInt(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

// Normalise one unknown element into a typed PlacedField, or null if it is not a
// usable box. Coordinates are clamped into the page and boxes are kept inside the
// [0,1] range so a stored layout can never point off-page.
export function normalizePlacedField(raw: unknown, index: number): PlacedField | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isPlacedFieldType(o.type)) return null;

  const x = clamp01(o.x);
  const y = clamp01(o.y);
  // Width/height must leave the box inside the page and be non-trivial.
  let w = clamp01(o.w);
  let h = clamp01(o.h);
  if (w <= 0) w = 0.02;
  if (h <= 0) h = 0.02;
  if (x + w > 1) w = Math.max(0.01, 1 - x);
  if (y + h > 1) h = Math.max(0.01, 1 - y);

  const signerKey = typeof o.signer_key === 'string' ? o.signer_key.trim() : '';
  if (!signerKey) return null;

  const id =
    typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `f-${index}-${Math.trunc(x * 1000)}`;
  const label = typeof o.label === 'string' ? o.label : '';
  const required = o.required === true;
  const value =
    typeof o.value === 'string' ? o.value : o.value == null ? null : String(o.value);

  return {
    id,
    page: toInt(o.page),
    x,
    y,
    w,
    h,
    type: o.type,
    signer_key: signerKey,
    label,
    required,
    value,
  };
}

// Normalise an unknown jsonb value (from the DB or a form) into a typed
// PlacedField[]. Anything malformed is dropped rather than throwing.
export function parseFieldLayout(raw: unknown): PlacedField[] {
  if (!Array.isArray(raw)) return [];
  const out: PlacedField[] = [];
  raw.forEach((item, i) => {
    const f = normalizePlacedField(item, i);
    if (f) out.push(f);
  });
  return out;
}

// Parse a JSON string of a layout (from FormData) into a clean PlacedField[].
export function parseFieldLayoutJson(json: string): PlacedField[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  return parseFieldLayout(parsed);
}

export function serializeFieldLayout(fields: PlacedField[]): string {
  return JSON.stringify(fields);
}

export function hasFieldLayout(raw: unknown): boolean {
  return parseFieldLayout(raw).length > 0;
}

// The subset of a layout that belongs to one signer_key (the boxes that signer
// fills in / that carry that signer's signature).
export function fieldsForSigner(layout: PlacedField[], signerKey: string): PlacedField[] {
  return layout.filter((f) => f.signer_key === signerKey);
}

// A short, dependency-free unique id for a newly placed box (client-side).
export function newFieldId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Merge a signer's submitted values into a layout when they sign.
// ---------------------------------------------------------------------------
// Only boxes belonging to `signerKey` are touched. Every REQUIRED text/date/name
// box must have a non-empty value; a required signature box needs a captured
// signature (`hasSignature`). Signature boxes keep value = null — their image is
// stamped from the signer's step signature at completion. Boxes for other signers
// pass through unchanged.
export function mergePositionalValues(
  layout: PlacedField[],
  signerKey: string,
  values: Record<string, string>,
  hasSignature: boolean
): { ok: true; merged: PlacedField[] } | { ok: false; error: string } {
  const merged: PlacedField[] = [];
  for (const f of layout) {
    if (f.signer_key !== signerKey) {
      merged.push(f);
      continue;
    }
    if (f.type === 'signature') {
      if (f.required && !hasSignature) {
        return { ok: false, error: `Please add your signature for "${f.label || 'Signature'}".` };
      }
      merged.push({ ...f });
      continue;
    }
    const raw = values[f.id];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (f.required && !value) {
      return { ok: false, error: `Please fill in the required field "${f.label || f.type}".` };
    }
    merged.push({ ...f, value: value ? value : null });
  }
  return { ok: true, merged };
}
