'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, describeServiceKey } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/roles';
import { sendMemberEmail } from '@/lib/email';
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
