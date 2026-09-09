import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DocumentsClient from './DocumentsClient';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Row-level security on `documents` already limits the result to documents
  // shared with everyone (member_id is null) or addressed to this member.
  // We deliberately do NOT select file_path — the browser never sees storage
  // paths; downloads are minted server-side via a short-lived signed URL.
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, type, member_id, created_at')
    .order('created_at', { ascending: false });

  return <DocumentsClient docs={(docs ?? []) as any} uid={user.id} />;
}
