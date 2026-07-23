'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  pandadocConfigured,
  createFromTemplate,
  sendSilently,
  createSigningLink,
  isCompletedBy,
} from '@/lib/pandadoc';
import { requiredDocsFor } from '@/lib/onboarding';

const RELATIONS = ['next_of_kin', 'beneficiary', 'nominee'] as const;

function clean(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function cleanInt(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// Read admin-configured settings (RLS allows any signed-in user to read).
async function readSettings(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.from('app_settings').select('key,value');
  return Object.fromEntries(((data ?? []) as any[]).map((r) => [r.key, r.value])) as Record<string, string>;
}

// E-signing is "on" only when a key is present AND an onboarding template is set.
// Otherwise we fall back to the typed-name agreements flow so members never get stuck.
function isEsignEnabled(settings: Record<string, string>): boolean {
  return pandadocConfigured() && !!(settings['pandadoc_onboarding_template_id'] || '').trim();
}

// Step 1 — save personal details + next of kin / beneficiary / nominee
export async function savePersonalData(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const { error: updErr } = await supabase
    .from('profiles')
    .update({
      full_name: clean(formData, 'full_name'),
      national_id: clean(formData, 'national_id'),
      kra_pin: clean(formData, 'kra_pin'),                 // optional Tax ID / KRA PIN
      registration_number: clean(formData, 'registration_number'),
      contact_person: clean(formData, 'contact_person'),
      contact_role: clean(formData, 'contact_role'),
      contact_email: clean(formData, 'contact_email'),
      nationality: clean(formData, 'nationality'),
      gender: clean(formData, 'gender'),
      occupation: clean(formData, 'occupation'),
      org_reg_date: clean(formData, 'org_reg_date'),
      org_reg_country: clean(formData, 'org_reg_country'),
      org_nature: clean(formData, 'org_nature'),
      member_count: cleanInt(formData, 'member_count'),
      official_chairperson: clean(formData, 'official_chairperson'),
      official_secretary: clean(formData, 'official_secretary'),
      official_treasurer: clean(formData, 'official_treasurer'),
      beneficial_owner_name: clean(formData, 'beneficial_owner_name'),
      beneficial_owner_role: clean(formData, 'beneficial_owner_role'),
      date_of_birth: clean(formData, 'date_of_birth'),
      phone: clean(formData, 'phone'),
      country: clean(formData, 'country'),
      address_line1: clean(formData, 'address_line1'),
      address_line2: clean(formData, 'address_line2'),
      city: clean(formData, 'city'),
      state_region: clean(formData, 'state_region'),
      postal_code: clean(formData, 'postal_code'),
      onboarding_step: 'documents',
    })
    .eq('id', uid);

  if (updErr) {
    console.error('savePersonalData profiles.update failed:', updErr.message);
    const info = `${updErr.code || ''} ${updErr.message || ''} ${(updErr as any).details || ''}`.toLowerCase();
    if (updErr.code === '23505' || info.includes('duplicate key') || info.includes('already exists')) {
      if (info.includes('national_id')) redirect('/onboarding?step=personal&err=dup_national_id');
      if (info.includes('phone')) redirect('/onboarding?step=personal&err=dup_phone');
      redirect('/onboarding?step=personal&err=dup');
    }
    redirect('/onboarding?step=personal&err=save');
  }

  for (const kind of RELATIONS) {
    const name = clean(formData, `${kind}_name`);
    const relationship = clean(formData, `${kind}_relationship`);
    const phone = clean(formData, `${kind}_phone`);
    const id_number = clean(formData, `${kind}_id_number`);
    if (name || relationship || phone || id_number) {
      const { error: relErr } = await supabase
        .from('member_relations')
        .upsert(
          { member_id: uid, relation_kind: kind, name, relationship, phone, id_number },
          { onConflict: 'member_id,relation_kind' }
        );
      if (relErr) console.error(`savePersonalData relation ${kind} failed:`, relErr.message);
    }
  }

  revalidatePath('/onboarding');
  redirect('/onboarding?step=documents');
}

// Step 2 — advance past documents (files are uploaded client-side to Storage)
export async function continueFromDocuments() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const [{ data: docs }, { data: prof }] = await Promise.all([
    supabase.from('kyc_documents').select('doc_type').eq('member_id', uid),
    supabase.from('profiles').select('member_type').eq('id', uid).single(),
  ]);

  const have = new Set((docs ?? []).map((d: any) => d.doc_type));
  const required = requiredDocsFor(prof?.member_type);
  if (!required.every((r) => have.has(r))) {
    redirect('/onboarding?step=documents&err=docs');
  }

  await supabase.from('profiles').update({ onboarding_step: 'agreements' }).eq('id', uid);
  revalidatePath('/onboarding');
  redirect('/onboarding?step=agreements');
}

// Step 3a (typed-name fallback) — sign one agreement by typing full name
export async function signAgreement(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const agreement_id = String(formData.get('agreement_id') || '');
  const signed_name = String(formData.get('signed_name') || '').trim();
  if (!agreement_id || !signed_name) {
    redirect('/onboarding?step=agreements&err=sign');
  }

  const { error } = await supabase.from('agreement_acceptances').upsert(
    { member_id: uid, agreement_id, signed_name, signed_at: new Date().toISOString() },
    { onConflict: 'member_id,agreement_id' }
  );
  if (error) console.error('signAgreement failed:', error.message);

  revalidatePath('/onboarding');
  redirect('/onboarding?step=agreements');
}

// Step 3 (e-sign) — open (or create) the member's onboarding-packet signing session.
// Returns a short-lived PandaDoc signing URL for the client to open in a new tab.
export async function startEsign(): Promise<{ ok?: true; url?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };
  const email = user.email;
  if (!email) return { error: 'Your account has no email address on file, so we cannot prepare your agreement.' };

  const settings = await readSettings();
  if (!isEsignEnabled(settings)) {
    return { error: 'Online signing is not set up yet. Please contact your administrator.' };
  }
  const templateId = settings['pandadoc_onboarding_template_id'];
  const role = settings['pandadoc_signer_role'] || 'Investor';

  const { data: p } = await supabase
    .from('profiles')
    .select('full_name, esign_document_id, esign_status')
    .eq('id', user.id)
    .single();

  // Already signed — nothing to open.
  if (p?.esign_status === 'completed' && p?.esign_document_id) {
    return { ok: true };
  }

  try {
    let docId = (p?.esign_document_id as string | null) || null;
    if (!docId) {
      const parts = String(p?.full_name || '').trim().split(' ').filter(Boolean);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || undefined;
      docId = await createFromTemplate({
        templateId,
        roleName: role,
        email,
        firstName,
        lastName,
        name: 'AWIVEST Onboarding Packet',
      });
      // sendSilently must succeed before we persist the id, so a stored id is
      // always a sent (link-able) document.
      await sendSilently(docId);
      await supabase
        .from('profiles')
        .update({ esign_document_id: docId, esign_status: 'sent' })
        .eq('id', user.id);
    }
    const url = await createSigningLink(docId, email);
    return { ok: true, url };
  } catch (e: any) {
    return { error: e?.message || 'We could not open your signing document just now. Please try again in a moment.' };
  }
}

// Step 3 (e-sign) — check PandaDoc for the member's completed signature.
// On completion, records it and advances the member to Review.
export async function refreshEsignStatus(): Promise<{ completed?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };
  const email = user.email;
  if (!email) return { error: 'Your account has no email address on file.' };

  const { data: p } = await supabase
    .from('profiles')
    .select('esign_document_id, esign_status, onboarding_step')
    .eq('id', user.id)
    .single();

  if (p?.esign_status === 'completed') return { completed: true };

  const docId = p?.esign_document_id as string | null;
  if (!docId) return { completed: false };

  try {
    const { completed } = await isCompletedBy(docId, email);
    if (!completed) return { completed: false };

    const patch: Record<string, any> = {
      esign_status: 'completed',
      esign_signed_at: new Date().toISOString(),
    };
    if (p?.onboarding_step === 'agreements') patch.onboarding_step = 'review';
    await supabase.from('profiles').update(patch).eq('id', user.id);
    revalidatePath('/onboarding');
    return { completed: true };
  } catch (e: any) {
    return { error: e?.message || 'We could not check your signature status just now. Please try again in a moment.' };
  }
}

// Step 3b — advance past agreements. Gate depends on the active signing mode.
export async function continueFromAgreements() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const settings = await readSettings();

  if (isEsignEnabled(settings)) {
    const { data: p } = await supabase.from('profiles').select('esign_status').eq('id', uid).single();
    if (p?.esign_status !== 'completed') {
      redirect('/onboarding?step=agreements&err=esign_incomplete');
    }
    await supabase.from('profiles').update({ onboarding_step: 'review' }).eq('id', uid);
    revalidatePath('/onboarding');
    redirect('/onboarding?step=review');
  }

  // Typed-name fallback: require all active required agreements to be signed.
  const { data: agrDocs } = await supabase
    .from('agreement_documents')
    .select('id,required')
    .eq('active', true);
  const { data: accs } = await supabase
    .from('agreement_acceptances')
    .select('agreement_id')
    .eq('member_id', uid);
  const signed = new Set((accs ?? []).map((a: any) => a.agreement_id));
  const missing = (agrDocs ?? []).filter((d: any) => d.required && !signed.has(d.id));
  if (missing.length) {
    redirect('/onboarding?step=agreements&err=agreements');
  }

  await supabase.from('profiles').update({ onboarding_step: 'review' }).eq('id', uid);
  revalidatePath('/onboarding');
  redirect('/onboarding?step=review');
}

// Step 4 — submit the completed pack for committee approval
export async function submitForApproval() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  // Server-side completeness guard (type-aware).
  const { data: p } = await supabase
    .from('profiles')
    .select('full_name,national_id,phone,member_type,registration_number,contact_person,esign_status,nationality,org_reg_country,org_nature,member_count,official_chairperson,official_secretary,official_treasurer,beneficial_owner_name')
    .eq('id', uid)
    .single();
  const { data: kd } = await supabase.from('kyc_documents').select('doc_type').eq('member_id', uid);
  const have = new Set((kd ?? []).map((d: any) => d.doc_type));
  const mt = p?.member_type || 'individual';
  const isOrg = mt === 'group' || mt === 'corporate';
  const docsOk = requiredDocsFor(mt).every((r) => have.has(r));

  const settings = await readSettings();
  let agreementsOk: boolean;
  if (isEsignEnabled(settings)) {
    agreementsOk = p?.esign_status === 'completed';
  } else {
    const { data: agrDocs } = await supabase
      .from('agreement_documents')
      .select('id,required')
      .eq('active', true);
    const { data: accs } = await supabase
      .from('agreement_acceptances')
      .select('agreement_id')
      .eq('member_id', uid);
    const signedSet = new Set((accs ?? []).map((a: any) => a.agreement_id));
    agreementsOk = (agrDocs ?? []).filter((d: any) => d.required).every((d: any) => signedSet.has(d.id));
  }

  // Required fields depend on the account type. KRA / Tax ID is never required.
  let fieldsOk = !!p?.full_name && !!p?.phone;
  if (mt === 'individual') fieldsOk = fieldsOk && !!p?.national_id && !!p?.nationality;
  if (isOrg) fieldsOk = fieldsOk && !!p?.contact_person && !!p?.org_reg_country && !!p?.org_nature;
  if (mt === 'group') fieldsOk = fieldsOk && !!p?.official_chairperson && !!p?.official_secretary && !!p?.official_treasurer && !!p?.member_count;
  if (mt === 'corporate') fieldsOk = fieldsOk && !!p?.registration_number && !!p?.beneficial_owner_name;

  if (!fieldsOk || !docsOk || !agreementsOk) {
    redirect('/onboarding?step=review&err=incomplete');
  }

  await supabase
    .from('profiles')
    .update({
      onboarding_step: 'submitted',
      submitted_at: new Date().toISOString(),
      kyc_status: 'pending',
    })
    .eq('id', uid);

  await supabase.from('notifications').insert({
    member_id: uid,
    type: 'onboarding',
    title: 'Membership pack submitted',
    body: 'Your complete membership pack has been submitted to the AWIVEST committee for approval.',
  });

  revalidatePath('/onboarding');
  revalidatePath('/dashboard');
  redirect('/onboarding?step=submitted');
}
