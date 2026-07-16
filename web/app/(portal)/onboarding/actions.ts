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

  // Surface a real failure instead of spinning forever.
  if (updErr) {
    console.error('savePersonalData profiles.update failed:', updErr.message);
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
    // Not all documents uploaded yet — stay on the documents step.
    redirect('/onboarding?step=documents&err=docs');
  }

  await supabase.from('profiles').update({ onboarding_step: 'agreements' }).eq('id', uid);
  revalidatePath('/onboarding');
  redirect('/onboarding?step=agreements');
}

// Step 3 — record consent to the membership agreement packet.
// (PandaDoc e-signing replaces this with a legally-binding audit trail once configured.)
export async function saveAgreement() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const { data: existing } = await supabase
    .from('agreements')
    .select('id')
    .eq('member_id', uid)
    .limit(1);

  const payload = {
    status: 'completed' as const,
    provider: 'manual-consent',
    signed_at: new Date().toISOString(),
  };

  if (existing && existing.length) {
    await supabase.from('agreements').update(payload).eq('id', existing[0].id);
  } else {
    await supabase.from('agreements').insert({ member_id: uid, ...payload });
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

  // Server-side completeness guard (so the pack can't be submitted half-done,
  // even if someone jumps straight to ?step=review).
  const { data: p } = await supabase
    .from('profiles')
    .select('full_name,national_id,kra_pin,phone')
    .eq('id', uid)
    .single();
  const { data: kd } = await supabase.from('kyc_documents').select('doc_type').eq('member_id', uid);
  const have = new Set((kd ?? []).map((d: any) => d.doc_type));
  const docsOk = ['passport_photo', 'national_id', 'kra_pin'].every((r) => have.has(r));
  if (!p?.full_name || !p?.national_id || !p?.kra_pin || !p?.phone || !docsOk) {
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
