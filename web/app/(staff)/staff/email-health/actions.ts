'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import { sendMemberEmail } from '@/lib/email';

// Staff-only test: sends a real transactional email through the SAME
// sendMemberEmail path the approval / welfare / withdrawal flows use, so the
// result (success or the exact Resend error) reflects the live configuration.
export async function sendTestEmail(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const to = (String(formData.get('to') || '').trim() || (user.email ?? '')).trim();
  if (!to) redirect('/staff/email-health?err=' + encodeURIComponent('No recipient address'));

  const res = await sendMemberEmail({
    to,
    subject: 'AWIVEST test email',
    heading: 'Test email',
    bodyHtml:
      '<p>This is a test message from the AWIVEST email health check.</p><p>If you received this, transactional email (Resend) is working.</p>',
  });

  if (res.ok) redirect('/staff/email-health?sent=' + encodeURIComponent(to));
  redirect('/staff/email-health?err=' + encodeURIComponent(res.error || 'send-failed'));
}
