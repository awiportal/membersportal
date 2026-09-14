// Shared, dependency-free types + helpers for the per-step "custom signer
// fields" on the sequential Documents-to-Sign flow.
//
// This module deliberately has NO server-only imports, so it is safe to import
// from client components, server actions and PDF builders alike. The admin
// builder authors field DEFINITIONS (value = null); when a signer signs, their
// answers are merged in as VALUES while the key/label/type/required are
// preserved. A step whose custom_fields is [] behaves exactly as before.

export type CustomFieldType = 'text' | 'date';

// One custom field on a signing step. Stored in the step's `custom_fields`
// jsonb column as an ordered array of these objects.
export type CustomField = {
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  value: string | null;
};

// A raw builder row before it is turned into a stored definition.
export type CustomFieldInput = {
  label: string;
  type: string;
  required: boolean;
};

function isCustomFieldType(v: unknown): v is CustomFieldType {
  return v === 'text' || v === 'date';
}

// Stable slug of a label, suffixed with its index so blank or duplicate labels
// still yield a unique key within a single step.
export function customFieldKey(label: string, index: number): string {
  const base = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'field'}-${index}`;
}

// Safely normalise an unknown jsonb value (from the DB or a form) into a typed
// CustomField[]. Anything malformed is dropped rather than throwing.
export function parseCustomFields(raw: unknown): CustomField[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomField[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label : '';
    const type: CustomFieldType = isCustomFieldType(o.type) ? o.type : 'text';
    const key = typeof o.key === 'string' && o.key.trim() ? o.key : customFieldKey(label, i);
    const required = o.required === true;
    const value =
      typeof o.value === 'string' ? o.value : o.value == null ? null : String(o.value);
    out.push({ key, label, type, required, value });
  });
  return out;
}

// Build clean DEFINITIONS (value = null) from admin builder rows. Blank labels
// are dropped; keys are regenerated so they stay stable and unique.
export function buildCustomFieldDefs(rows: CustomFieldInput[]): CustomField[] {
  const defs: CustomField[] = [];
  rows.forEach((row) => {
    const label = String(row?.label ?? '').trim();
    if (!label) return;
    const type: CustomFieldType = isCustomFieldType(row?.type) ? row.type : 'text';
    defs.push({
      key: customFieldKey(label, defs.length),
      label,
      type,
      required: row?.required === true,
      value: null,
    });
  });
  return defs;
}

// Normalise an unknown value into clean DEFINITIONS: strip any values and
// regenerate keys. Accepts both raw builder rows and already-shaped defs.
export function normalizeCustomFieldDefs(raw: unknown): CustomField[] {
  return buildCustomFieldDefs(
    parseCustomFields(raw).map((f) => ({ label: f.label, type: f.type, required: f.required }))
  );
}

// Parse a JSON string of builder rows/defs (from FormData) into clean defs.
export function parseCustomFieldDefsJson(json: string): CustomField[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  return normalizeCustomFieldDefs(parsed);
}

// Parse a JSON string of submitted signer values (from FormData) into a
// key -> string map. Non-string values are coerced; malformed input yields {}.
export function parseCustomFieldValuesJson(json: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!json) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    out[k] = typeof v === 'string' ? v : v == null ? '' : String(v);
  }
  return out;
}

// Validate a signer's submitted values against a step's field definitions and
// merge them in (preserving key/label/type/required, setting value). Every
// `required` field must have a non-empty value; the first offender yields a
// clear error. Empty optional values are stored as null.
export function mergeCustomFieldValues(
  defs: CustomField[],
  values: Record<string, string>
): { ok: true; merged: CustomField[] } | { ok: false; error: string } {
  const merged: CustomField[] = [];
  for (const def of defs) {
    const raw = values[def.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (def.required && !value) {
      return { ok: false, error: `Please fill in the required field "${def.label}".` };
    }
    merged.push({ ...def, value: value ? value : null });
  }
  return { ok: true, merged };
}
