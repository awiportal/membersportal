import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Streams a member's own signed withdrawal letter via a short-lived signed URL.
// The staff queue has its own privileged view; this route is owner-only.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', _req.url));

  const { data: row } = await supabase
    .from('withdrawal_requests')
    .select('member_id, letter_path')
    .eq('id', params.id)
    .maybeSingle();

  if (!row || row.member_id !== user.id || !row.letter_path) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from('withdrawals')
    .createSignedUrl(row.letter_path, 60);
  if (error || !signed?.signedUrl) {
    return new NextResponse('Unable to open letter', { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
