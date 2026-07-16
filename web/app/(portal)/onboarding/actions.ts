'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const RELATIONS = ['next_of_kin', 'beneficiary', 'nominee'] as const;

function clean(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
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
      kra_pin: clean(formData, 'kra_pin'),
      date_of_birth: clean(formData, 'date_of_birth'),
      phone: clean(formData, 'phone'),
      postal_address: clean(formData, 'postal_address'),
      physical_address: clean(formData, 'physical_address'),
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

  const { data: docs } = await supabase
    .from('kyc_documents')
    .select('doc_type')
    .eq('member_id', uid);

  const have = new Set((docs ?? []).map((d: any) => d.doc_type));
  const required = ['passport_photo', 'national_id', 'kra_pin'];
  if (!required.every((r) => have.has(r))) {
    redirect('/onboarding?step=documents&err=docs');
  }

  await supabase.from('profiles').update({ onboarding_step: 'agreements' }).eq('id', uid);
  revalidatePath('/onboarding');
  redirect('/onboarding?step=agreements');
}

// Step 3a — sign one agreement (typed full-name signature)
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

// Step 3b — advance past agreements once all required forms are signed
export async function continueFromAgreements() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

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

  // Server-side completeness guard.
  const { data: p } = await supabase
    .from('profiles')
    .select('full_name,national_id,kra_pin,phone')
    .eq('id', uid)
    .single();
  const { data: kd } = await supabase.from('kyc_documents').select('doc_type').eq('member_id', uid);
  const have = new Set((kd ?? []).map((d: any) => d.doc_type));
  const docsOk = ['passport_photo', 'national_id', 'kra_pin'].every((r) => have.has(r));

  const { data: agrDocs } = await supabase
    .from('agreement_documents')
    .select('id,required')
    .eq('active', true);
  const { data: accs } = await supabase
    .from('agreement_acceptances')
    .select('agreement_id')
    .eq('member_id', uid);
  const signedSet = new Set((accs ?? []).map((a: any) => a.agreement_id));
  const agreementsOk = (agrDocs ?? []).filter((d: any) => d.required).every((d: any) => signedSet.has(d.id));

  if (!p?.full_name || !p?.national_id || !p?.kra_pin || !p?.phone || !docsOk || !agreementsOk) {
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
