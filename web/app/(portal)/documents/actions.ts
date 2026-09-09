"use server";

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Return a short-lived signed URL for a document the signed-in member is
 * allowed to see.
 *
 * Security boundary: we first read the row through the *user* client, so
 * row-level security decides whether this member may access it (shared docs,
 * their own docs, or admin). Only if that read succeeds do we mint a signed
 * URL with the service role — necessary because shared documents live outside
 * the member's own storage folder and the member client cannot read them
 * directly.
 */
export async function getDocumentDownloadUrl(id: string): Promise<{ url?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };

  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, file_path')
    .eq('id', id)
    .maybeSingle();
  if (error || !doc?.file_path) return { error: 'This document is not available.' };

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from('documents')
    .createSignedUrl(doc.file_path, 120);
  if (signErr || !signed?.signedUrl) return { error: 'Could not prepare the download link. Please try again.' };

  return { url: signed.signedUrl };
}
