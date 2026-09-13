'use server';

import { clientIp, rateLimitAllow } from '@/lib/rateLimit';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMemberEmail } from '@/lib/email';

// Server-side guard the login form calls before attempting a password sign-in.
//
// Per-IP fixed window only (NOT per-email): keying on the email would let anyone
// lock a specific member out by spamming their address. This is defense-in-depth
// over Supabase's own auth throttling and only covers the UI path — a raw API
// caller is limited by Supabase directly. Fail-open, so it can never block a
// real member.
export async function guardLogin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = clientIp();
  const allowed = await rateLimitAllow(`login:ip:${ip}`, 10, 300); // 10 / 5 min
  if (!allowed) {
    return {
      ok: false,
      error: 'Too many sign-in attempts from your network. Please wait a few minutes and try again.',
    };
  }
  return { ok: true };
}

// Roles that review and approve new members. Everyone in this set gets an
// in-app notification (their staff-console bell) and an email whenever a new
// member registers, so they can act quickly.
const APPROVER_ROLES = ['secretary', 'admin', 'superadmin'];

type RegistrationInfo = {
  fullName?: string;
  email: string;
  phone?: string;
  memberType?: string;
};

// Fired by the sign-up form right after a genuinely new account is created.
// Best-effort and fail-open: it must never block or slow the member's sign-up,
// so every failure is swallowed. Uses the service-role client because it writes
// notification rows for other users (the approvers) and reads their emails.
export async function notifyAdminsOfRegistration(info: RegistrationInfo): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: approvers } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .in('role', APPROVER_ROLES);

    const list = ((approvers ?? []) as { id: string; email: string | null; full_name: string | null }[])
      .filter((a) => a.id);
    if (list.length === 0) return;

    const who = (info.fullName || '').trim() || info.email;
    const detail = [
      info.email ? `Email: ${info.email}` : '',
      info.phone ? `Phone: ${info.phone}` : '',
      info.memberType ? `Type: ${info.memberType}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    // In-app notifications on the staff-console bell — one row per approver.
    await admin.from('notifications').insert(
      list.map((a) => ({
        member_id: a.id,
        type: 'registration',
        title: 'New member registration',
        body: `${who} has registered and is awaiting approval.${detail ? ' ' + detail : ''} Review in Staff → Members.`,
      })),
    );

    // Email each approver so they can act without waiting for a portal visit.
    await Promise.all(
      list
        .filter((a) => a.email)
        .map((a) =>
          sendMemberEmail({
            to: a.email as string,
            subject: 'New AWIVEST member awaiting approval',
            heading: 'New member registration',
            bodyHtml: `<p style="margin:0 0 12px;">Hi ${a.full_name || 'there'},</p>
<p style="margin:0 0 12px;">A new member has just registered and is waiting for approval:</p>
<p style="margin:0 0 14px;"><strong>${who}</strong>${detail ? `<br/>${detail}` : ''}</p>
<p style="margin:0;">Sign in to the staff console and open <strong>Members</strong> to review their details, verify KYC, and approve.</p>`,
          }).catch(() => undefined),
        ),
    );
  } catch {
    // fail-open — registration must succeed even if approver alerts fail
  }
}
