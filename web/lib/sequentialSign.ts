import { createAdminClient } from '@/lib/supabase/admin';
import { sendMemberEmail } from '@/lib/email';
import { mergeCustomFieldValues, parseCustomFields, type CustomField } from '@/lib/customFields';
import {
  mergePositionalValues,
  parseFieldLayout,
  signerKeyForStep,
  type PlacedField,
} from '@/lib/fieldLayout';

// Shared logic for applying ONE ordered signature to a sequential sign request.
// Plain module (NOT 'use server') so it can be imported by the portal server
// action and any future caller. All writes go through the service-role admin
// client; the CALLER is responsible for authenticating the user — this helper
// additionally verifies that the step belongs to that user and is their turn.

// Today's date as YYYY-MM-DD in East Africa Time (Africa/Nairobi). en-CA yields
// an ISO-style date string.
function todayInNairobi(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

export async function applySequentialSignature(opts: {
  stepId: string;
  userId: string;
  signedName: string;
  signedDate?: string;
  image?: string | null;
  kind?: string | null;
  customFieldValues?: Record<string, string>;
  positionalValues?: Record<string, string>;
}): Promise<{ ok?: true; error?: string; completed?: boolean }> {
  const admin = createAdminClient();

  const { data: step } = await admin
    .from('sign_request_steps')
    .select('*')
    .eq('id', opts.stepId)
    .single();
  if (!step) return { error: 'That signing step could not be found.' };

  // Only the assigned signer may sign, and only while it is their active turn.
  if ((step as any).signer_id !== opts.userId || (step as any).status !== 'active') {
    return { error: 'It is not your turn to sign this document yet.' };
  }

  const requestId = (step as any).request_id as string;
  const currentOrder = (step as any).step_order as number;

  // Custom signer fields (additive): validate every required field has a value,
  // then merge the submitted values into this step's field definitions. A step
  // with no custom fields ([]) skips all of this and behaves exactly as before.
  const fieldDefs = parseCustomFields((step as any).custom_fields);
  let mergedFields: CustomField[] = fieldDefs;
  if (fieldDefs.length > 0) {
    const res = mergeCustomFieldValues(fieldDefs, opts.customFieldValues || {});
    if (!res.ok) return { error: res.error };
    mergedFields = res.merged;
  }

  // Positional PDF fields (additive): if the request carries a visual field
  // layout, merge THIS signer's typed values (keyed by field id) into it,
  // validating required boxes. Signature boxes are stamped from this step's
  // signature at completion, so they only require that a signature was captured.
  // A request with no layout (or none for this signer) is a no-op and behaves
  // exactly as before.
  const signerKey = signerKeyForStep(currentOrder, (step as any).signer_role as string | null);
  let mergedLayout: PlacedField[] | null = null;
  {
    const { data: reqLayout } = await admin
      .from('sign_requests')
      .select('field_layout')
      .eq('id', requestId)
      .maybeSingle();
    const layout = parseFieldLayout((reqLayout as any)?.field_layout);
    const mine = layout.filter((f) => f.signer_key === signerKey);
    if (mine.length > 0) {
      const res = mergePositionalValues(layout, signerKey, opts.positionalValues || {}, !!opts.image);
      if (!res.ok) return { error: res.error };
      mergedLayout = res.merged;
    }
  }

  const nowIso = new Date().toISOString();
  const image = opts.image || null;
  const signedDate = opts.signedDate || todayInNairobi();

  const { error: updErr } = await admin
    .from('sign_request_steps')
    .update({
      signed_name: opts.signedName,
      signed_at: nowIso,
      signed_date: signedDate,
      signature_image: image,
      signature_kind: image ? opts.kind || 'draw' : null,
      custom_fields: mergedFields,
      status: 'signed',
      updated_at: nowIso,
    })
    .eq('id', opts.stepId);
  if (updErr) {
    console.error('applySequentialSignature: step update failed:', updErr.message);
    return { error: 'Could not record your signature. Please try again.' };
  }

  // Persist this signer's merged positional values onto the request's layout.
  // Best-effort: the signature is already recorded; a failed layout write only
  // loses the stamped typed values, so log rather than block the chain.
  if (mergedLayout) {
    const { error: layoutErr } = await admin
      .from('sign_requests')
      .update({ field_layout: mergedLayout })
      .eq('id', requestId);
    if (layoutErr) {
      console.error('applySequentialSignature: field_layout update failed:', layoutErr.message);
    }
  }

  // Load the request title for messaging (best-effort).
  const { data: req } = await admin
    .from('sign_requests')
    .select('id, title')
    .eq('id', requestId)
    .maybeSingle();
  const title = (req as any)?.title || 'a document';

  // Advance to the next step, if any.
  const { data: nextStep } = await admin
    .from('sign_request_steps')
    .select('*')
    .eq('request_id', requestId)
    .eq('step_order', currentOrder + 1)
    .maybeSingle();

  if (nextStep) {
    const { error: actErr } = await admin
      .from('sign_request_steps')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', (nextStep as any).id);
    if (actErr) {
      console.error('applySequentialSignature: activate next step failed:', actErr.message);
    }

    // Best-effort notify + email the next signer that it is now their turn.
    try {
      await admin.from('notifications').insert({
        member_id: (nextStep as any).signer_id,
        type: 'agreement',
        title: 'Document awaiting your signature',
        body: `It is your turn to sign: ${title}.`,
      });
    } catch (e: any) {
      console.error('applySequentialSignature: next-signer notify failed:', e?.message);
    }
    try {
      const { data: nextProfile } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', (nextStep as any).signer_id)
        .maybeSingle();
      await sendMemberEmail({
        to: (nextProfile as any)?.email,
        subject: 'A document is waiting for your signature',
        heading: 'Document awaiting your signature',
        bodyHtml:
          `<p style="margin:0 0 12px;">Hi ${(nextProfile as any)?.full_name || 'there'},</p>` +
          `<p style="margin:0 0 12px;">It is now your turn to sign <strong>${title}</strong> in the AWIVEST Investor Portal.</p>` +
          `<p style="margin:0;">Please sign in and open <strong>Documents to Sign</strong> to review and sign it.</p>`,
      });
    } catch (e: any) {
      console.error('applySequentialSignature: next-signer email failed:', e?.message);
    }

    return { ok: true, completed: false };
  }

  // No next step -> the whole request is now fully signed.
  const { error: compErr } = await admin
    .from('sign_requests')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', requestId);
  if (compErr) {
    console.error('applySequentialSignature: complete update failed:', compErr.message);
  }

  // Best-effort notify + email ALL signers that it is ready to download.
  try {
    const { data: allSteps } = await admin
      .from('sign_request_steps')
      .select('signer_id')
      .eq('request_id', requestId);
    const signerIds = Array.from(
      new Set(((allSteps ?? []) as any[]).map((s) => s.signer_id).filter(Boolean))
    );
    if (signerIds.length) {
      try {
        await admin.from('notifications').insert(
          signerIds.map((sid) => ({
            member_id: sid,
            type: 'agreement',
            title: 'Document fully signed',
            body: `${title} has been fully signed and is ready to download.`,
          }))
        );
      } catch (e: any) {
        console.error('applySequentialSignature: completion notify failed:', e?.message);
      }
      try {
        const { data: profs } = await admin
          .from('profiles')
          .select('id, full_name, email')
          .in('id', signerIds);
        for (const p of (profs ?? []) as any[]) {
          try {
            await sendMemberEmail({
              to: p.email,
              subject: 'A signed document is ready',
              heading: 'Document fully signed',
              bodyHtml:
                `<p style="margin:0 0 12px;">Hi ${p.full_name || 'there'},</p>` +
                `<p style="margin:0;">The document <strong>${title}</strong> has now been signed by everyone in order and is ready to download from <strong>Documents to Sign</strong> in the portal.</p>`,
            });
          } catch {
            /* fail-soft per signer */
          }
        }
      } catch (e: any) {
        console.error('applySequentialSignature: completion email step failed:', e?.message);
      }
    }
  } catch (e: any) {
    console.error('applySequentialSignature: completion messaging failed:', e?.message);
  }

  return { ok: true, completed: true };
}
