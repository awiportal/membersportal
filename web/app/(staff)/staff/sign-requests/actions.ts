'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, describeServiceKey } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/roles';
import { sendMemberEmail } from '@/lib/email';
import { applySequentialSignature } from '@/lib/sequentialSign';
import { DOC_TYPE_SET } from './docTypes';

const BUCKET = 'sign-documents';
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// Confirm the caller is a signed-in Admin or Chairlady (isAdmin). The admin
// (service-role) client used for the privileged writes bypasses RLS, so this
// check is the security boundary.
async function requireAdminUser(): Promise<
  { userId: string; fullName: string | null } | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again and retry.' };
  const { data: me } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  if (!isAdmin((me as any)?.role)) {
    return { error: 'You need an Admin or Chairlady role to send documents for signing.' };
  }
  return { userId: user.id, fullName: ((me as any)?.full_name as string | null) ?? null };
}

export async function sendSignRequest(
  formData: FormData
): Promise<{ ok?: true; error?: string }> {
  const auth = await requireAdminUser();
  if ('error' in auth) return { error: auth.error };

  // 1) Validate the request fields.
  const title = String(formData.get('title') || '').trim();
  const doc_type = String(formData.get('doc_type') || 'other').trim();
  const note = String(formData.get('note') || '').trim() || null;
  const mode = String(formData.get('mode') || 'all').trim(); // 'all' | 'list'
  const file = formData.get('file');

  if (!title) return { error: 'Please give the document a title.' };
  if (!DOC_TYPE_SET.has(doc_type)) return { error: 'Please choose a valid document type.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a PDF to send.' };

  // PDF only: extension AND mime AND magic bytes must all agree.
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'pdf' || !(file.type || '').toLowerCase().includes('pdf')) {
    return { error: 'Only PDF files are accepted. Please upload a PDF.' };
  }
  if (file.size > MAX_BYTES) return { error: 'That file is too large. The maximum size is 15 MB.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    return { error: 'That file does not look like a valid PDF. Please upload a PDF.' };
  }

  // 2) Confirm the server actually holds a real service-role key.
  const keyInfo = describeServiceKey();
  if (!keyInfo.ok) {
    console.error('sendSignRequest: service-role key not configured:', keyInfo.message);
    return { error: 'Sending is not configured on the server yet. Please contact the administrator.' };
  }

  // 3) Resolve recipients FIRST so we do not upload/insert with an empty list.
  const admin = createAdminClient();
  let memberIds: string[] = [];
  if (mode === 'list') {
    memberIds = formData.getAll('member_ids').map((v) => String(v)).filter(Boolean);
  } else {
    const { data: actives } = await admin
      .from('profiles')
      .select('id')
      .eq('status', 'active')
      .eq('role', 'member');
    memberIds = ((actives ?? []) as any[]).map((r) => r.id);
  }
  memberIds = Array.from(new Set(memberIds));
  if (memberIds.length === 0) {
    return { error: 'No recipients found. Pick at least one member (or ensure there are active members).' };
  }

  // 4) Ensure the private bucket and upload the PDF.
  try {
    await admin.storage.createBucket(BUCKET, { public: false });
  } catch {
    /* bucket already exists — ignore */
  }
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { upsert: true, contentType: 'application/pdf' });
  if (upErr) {
    console.error('sendSignRequest: upload failed:', upErr.message);
    return { error: 'Could not upload the file. Please try again.' };
  }

  // 5) Insert the request, then a recipient row per member.
  const { data: reqRow, error: insErr } = await admin
    .from('sign_requests')
    .insert({
      title,
      doc_type,
      note,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || 'application/pdf',
      audience: mode === 'list' ? 'list' : 'all',
      created_by: auth.userId,
    })
    .select('id')
    .single();
  if (insErr || !reqRow) {
    console.error('sendSignRequest: request insert failed:', insErr?.message);
    return { error: 'Could not save the request. Please try again.' };
  }

  const rcptRows = memberIds.map((mid) => ({
    request_id: reqRow.id,
    member_id: mid,
    status: 'sent',
  }));
  const { error: rcptErr } = await admin.from('sign_request_recipients').insert(rcptRows);
  if (rcptErr) {
    console.error('sendSignRequest: recipient insert failed:', rcptErr.message);
    return { error: 'Could not assign the document to recipients. Please try again.' };
  }

  // 6) Best-effort in-app notifications + branded emails (never block the write).
  try {
    await admin.from('notifications').insert(
      memberIds.map((mid) => ({
        member_id: mid,
        type: 'agreement',
        title: 'Document to sign',
        body: `You have a new document to sign: ${title}.`,
      }))
    );
  } catch (e: any) {
    console.error('sendSignRequest: notification insert failed:', e?.message);
  }

  try {
    const { data: recips } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', memberIds);
    const byId: Record<string, any> = {};
    ((recips ?? []) as any[]).forEach((r) => (byId[r.id] = r));
    for (const mid of memberIds) {
      const p = byId[mid];
      try {
        await sendMemberEmail({
          to: p?.email,
          subject: 'A document is waiting for your signature',
          heading: 'Document to sign',
          bodyHtml:
            `<p style="margin:0 0 12px;">Hi ${p?.full_name || 'there'},</p>` +
            `<p style="margin:0 0 12px;">A new document, <strong>${title}</strong>, is waiting for your signature in the AWIVEST Investor Portal.</p>` +
            `<p style="margin:0;">Please sign in and open <strong>Documents to Sign</strong> to review and sign it.</p>`,
        });
      } catch {
        /* fail-soft per recipient */
      }
    }
  } catch (e: any) {
    console.error('sendSignRequest: email step failed:', e?.message);
  }

  revalidatePath('/staff/sign-requests');
  return { ok: true };
}

export async function countersignSignRequest(
  formData: FormData
): Promise<{ ok?: true; error?: string }> {
  const auth = await requireAdminUser();
  if ('error' in auth) return { error: auth.error };

  const recipientId = String(formData.get('recipient_id') || '').trim();
  const image = String(formData.get('countersign_signature_image') || '');
  const kind = String(formData.get('countersign_signature_kind') || '') || 'draw';
  const nameField = String(formData.get('countersigned_name') || '').trim();
  const countersigned_name = nameField || auth.fullName || 'Administrator';
  if (!recipientId) return { error: 'Missing document reference.' };

  const admin = createAdminClient();
  const { data: rcpt } = await admin
    .from('sign_request_recipients')
    .select('*')
    .eq('id', recipientId)
    .single();
  if (!rcpt) return { error: 'That document could not be found.' };
  if (rcpt.status !== 'signed') {
    return { error: 'This document is not ready to countersign yet.' };
  }

  const { error: updErr } = await admin
    .from('sign_request_recipients')
    .update({
      countersigned_by: auth.userId,
      countersigned_name,
      countersigned_at: new Date().toISOString(),
      countersign_signature_image: image || null,
      countersign_signature_kind: image ? kind : null,
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', recipientId);
  if (updErr) {
    console.error('countersignSignRequest: update failed:', updErr.message);
    return { error: 'Could not record the countersignature. Please try again.' };
  }

  // Best-effort notify + email the member that the document is fully signed.
  try {
    const [{ data: req }, { data: member }] = await Promise.all([
      admin.from('sign_requests').select('title').eq('id', rcpt.request_id).maybeSingle(),
      admin.from('profiles').select('email, full_name').eq('id', rcpt.member_id).maybeSingle(),
    ]);
    const title = (req as any)?.title || 'your document';
    try {
      await admin.from('notifications').insert({
        member_id: rcpt.member_id,
        type: 'agreement',
        title: 'Document fully signed',
        body: `${title} has been countersigned and is ready to download.`,
      });
    } catch {
      /* fail-soft */
    }
    try {
      await sendMemberEmail({
        to: (member as any)?.email,
        subject: 'Your signed document is ready',
        heading: 'Document fully signed',
        bodyHtml:
          `<p style="margin:0 0 12px;">Hi ${(member as any)?.full_name || 'there'},</p>` +
          `<p style="margin:0;">Your document, <strong>${title}</strong>, has been countersigned by the office and is ready to download from <strong>Documents to Sign</strong> in the portal.</p>`,
      });
    } catch {
      /* fail-soft */
    }
  } catch (e: any) {
    console.error('countersignSignRequest: notify step failed:', e?.message);
  }

  revalidatePath('/staff/sign-requests');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sequential (ordered) signing — ADDITIVE. Sends ONE document down an ordered
// chain of signers; each signs in turn and only the next signer is notified once
// the previous has signed.
//
// Audience fan-out: the FIRST signer of every chain is a member (signing as
// "investor"), and the SAME shared office-holder steps follow (e.g. secretary ->
// treasurer -> chairlady). The first-signer audience may be:
//   - 'all'        : every active member
//   - 'list'        : the picked members
//   - 'individual'  : one member (preserves the original single-chain behaviour)
// Every member gets their OWN sign_requests row (one chain each). When more than
// one member is targeted the rows share a batch_id so the console can group them
// and show an M-of-N rollup; a single member leaves batch_id null.
//
// Does not touch sendSignRequest / countersignSignRequest.
// ---------------------------------------------------------------------------
export async function sendSequentialSignRequest(
  formData: FormData
): Promise<{ ok?: true; error?: string }> {
  const auth = await requireAdminUser();
  if ('error' in auth) return { error: auth.error };

  // 1) Validate the request fields (same rules as sendSignRequest).
  const title = String(formData.get('title') || '').trim();
  const doc_type = String(formData.get('doc_type') || 'other').trim();
  const note = String(formData.get('note') || '').trim() || null;
  const file = formData.get('file');

  if (!title) return { error: 'Please give the document a title.' };
  if (!DOC_TYPE_SET.has(doc_type)) return { error: 'Please choose a valid document type.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a PDF to send.' };

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'pdf' || !(file.type || '').toLowerCase().includes('pdf')) {
    return { error: 'Only PDF files are accepted. Please upload a PDF.' };
  }
  if (file.size > MAX_BYTES) return { error: 'That file is too large. The maximum size is 15 MB.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    return { error: 'That file does not look like a valid PDF. Please upload a PDF.' };
  }

  // 2) First-signer audience + role. Default 'individual' preserves the original
  // single-chain behaviour (one chosen member -> office-holders).
  const rawFirstAudience = String(formData.get('first_audience') || 'individual').trim();
  const first_audience: 'all' | 'list' | 'individual' =
    rawFirstAudience === 'all' ? 'all' : rawFirstAudience === 'list' ? 'list' : 'individual';
  const first_role = String(formData.get('first_role') || 'investor').trim() || 'investor';

  // 3) Parse the DOWNSTREAM office-holder signers (the steps AFTER the member).
  // `signer_ids` / `signer_roles` are parallel arrays; pair by index BEFORE
  // dropping any blank rows so the id/role alignment is preserved.
  const rawIds = formData.getAll('signer_ids').map((v) => String(v).trim());
  const rawRoles = formData.getAll('signer_roles').map((v) => String(v).trim());
  const downstreamSigners: { signer_id: string; signer_role: string | null }[] = [];
  for (let i = 0; i < rawIds.length; i++) {
    const sid = rawIds[i];
    if (!sid) continue;
    downstreamSigners.push({ signer_id: sid, signer_role: rawRoles[i] || null });
  }
  if (downstreamSigners.length < 1) {
    return { error: 'Add at least one office-holder to sign after the member.' };
  }

  // 4) Confirm the server actually holds a real service-role key.
  const keyInfo = describeServiceKey();
  if (!keyInfo.ok) {
    console.error('sendSequentialSignRequest: service-role key not configured:', keyInfo.message);
    return { error: 'Sending is not configured on the server yet. Please contact the administrator.' };
  }

  const admin = createAdminClient();

  // 5) Resolve the first-signer member set FIRST so we never upload/insert with
  // an empty audience.
  let memberIds: string[] = [];
  if (first_audience === 'all') {
    const { data: actives } = await admin
      .from('profiles')
      .select('id')
      .eq('status', 'active')
      .eq('role', 'member');
    memberIds = ((actives ?? []) as any[]).map((r) => r.id);
  } else {
    memberIds = formData.getAll('first_member_ids').map((v) => String(v)).filter(Boolean);
  }
  memberIds = Array.from(new Set(memberIds));
  if (first_audience === 'individual') memberIds = memberIds.slice(0, 1);
  if (memberIds.length === 0) {
    return {
      error:
        first_audience === 'all'
          ? 'There are no active members to send this to.'
          : 'Pick at least one member to sign first.',
    };
  }

  // 6) Ensure the private bucket and upload the PDF ONCE. The single stored file
  // is reused by every member's chain.
  try {
    await admin.storage.createBucket(BUCKET, { public: false });
  } catch {
    /* bucket already exists — ignore */
  }
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { upsert: true, contentType: 'application/pdf' });
  if (upErr) {
    console.error('sendSequentialSignRequest: upload failed:', upErr.message);
    return { error: 'Could not upload the file. Please try again.' };
  }

  // 7) A batch groups a fan-out (>1 member). A single member leaves batch_id null
  // so it renders exactly like the original single-chain request.
  const batchId = memberIds.length > 1 ? crypto.randomUUID() : null;
  const audience: 'all' | 'list' | 'individual' = first_audience;

  // 8) Insert one request row per member (one chain each), keeping id<->member
  // alignment so the step builder cannot mis-pair.
  const requestByMember: { memberId: string; requestId: string }[] = [];
  for (const memberId of memberIds) {
    const { data: reqRow, error: insErr } = await admin
      .from('sign_requests')
      .insert({
        title,
        doc_type,
        note,
        file_path: path,
        file_name: file.name,
        mime_type: file.type || 'application/pdf',
        audience,
        flow: 'sequential',
        batch_id: batchId,
        created_by: auth.userId,
      })
      .select('id')
      .single();
    if (insErr || !reqRow) {
      console.error('sendSequentialSignRequest: request insert failed:', insErr?.message);
      return { error: 'Could not save the request. Please try again.' };
    }
    requestByMember.push({ memberId, requestId: (reqRow as any).id });
  }

  // 9) Build EVERY step across ALL chains, then bulk-insert them in one call.
  // Step 1 is the member (active). The office-holders follow, in order (pending).
  const allStepRows: any[] = [];
  for (const { memberId, requestId } of requestByMember) {
    allStepRows.push({
      request_id: requestId,
      step_order: 1,
      signer_id: memberId,
      signer_role: first_role || 'investor',
      status: 'active',
    });
    downstreamSigners.forEach((s, i) => {
      allStepRows.push({
        request_id: requestId,
        step_order: i + 2,
        signer_id: s.signer_id,
        signer_role: s.signer_role || null,
        status: 'pending',
      });
    });
  }
  const { error: stepErr } = await admin.from('sign_request_steps').insert(allStepRows);
  if (stepErr) {
    console.error('sendSequentialSignRequest: step insert failed:', stepErr.message);
    return { error: 'Could not set up the signing order. Please try again.' };
  }

  // 10) Best-effort notify + email ONLY the step-1 member on each chain (the
  // active signer). Never block the write.
  try {
    await admin.from('notifications').insert(
      memberIds.map((mid) => ({
        member_id: mid,
        type: 'agreement',
        title: 'Document awaiting your signature',
        body: `It is your turn to sign: ${title}.`,
      }))
    );
  } catch (e: any) {
    console.error('sendSequentialSignRequest: notify insert failed:', e?.message);
  }

  try {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', memberIds);
    const byId: Record<string, any> = {};
    ((profs ?? []) as any[]).forEach((p) => (byId[p.id] = p));
    for (const mid of memberIds) {
      const p = byId[mid];
      try {
        await sendMemberEmail({
          to: p?.email,
          subject: 'A document is waiting for your signature',
          heading: 'Document awaiting your signature',
          bodyHtml:
            `<p style="margin:0 0 12px;">Hi ${p?.full_name || 'there'},</p>` +
            `<p style="margin:0 0 12px;">A new document, <strong>${title}</strong>, needs to be signed in order and it is your turn first.</p>` +
            `<p style="margin:0;">Please sign in and open <strong>Documents to Sign</strong> to review and sign it.</p>`,
        });
      } catch {
        /* fail-soft per member */
      }
    }
  } catch (e: any) {
    console.error('sendSequentialSignRequest: email step failed:', e?.message);
  }

  revalidatePath('/staff/sign-requests');
  return { ok: true };
}

// A staff office-holder (Secretary/Treasurer/Chairlady/etc.) signs THEIR ordered
// step of a sequential request from the staff console. Delegates to the shared
// helper (which verifies it is their active turn and advances the chain). Same
// contract as the portal signSequentialStep; returns void.
export async function signSequentialStep(formData: FormData): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const step_id = String(formData.get('step_id') || '').trim();
  const signed_name = String(formData.get('signed_name') || '').trim();
  const signature_image = String(formData.get('signature_image') || '') || null;
  const signature_kind = String(formData.get('signature_kind') || '') || null;
  const signed_date = String(formData.get('signed_date') || '').trim() || undefined;

  if (!step_id || !signed_name) {
    revalidatePath('/staff/sign-requests');
    return;
  }

  await applySequentialSignature({
    stepId: step_id,
    userId: user.id,
    signedName: signed_name,
    image: signature_image,
    kind: signature_kind,
    signedDate: signed_date,
  });

  revalidatePath('/staff/sign-requests');
  revalidatePath('/sign-requests');
}
