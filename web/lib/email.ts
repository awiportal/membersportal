// Fail-soft transactional email via Resend.
//
// NEVER throws — a mail failure must not break the core action (membership
// approval, a welfare decision, a recorded withdrawal). Returns { ok:false } with
// a reason when RESEND_API_KEY / EMAIL_FROM are missing or the API errors, so
// callers can ignore or log it without surfacing an error to the user.
//
// Server env required (Vercel):
//   RESEND_API_KEY  — Resend API key
//   EMAIL_FROM      — verified sender, e.g. "AWIVEST <no-reply@mail.awivest.com>"

// Brand palette (kept in sync with the portal + the Supabase auth templates).
const PLUM = '#7A1E50';
const MAGENTA = '#B22C75';
const BRAND = PLUM;

// A centred, branded card matching the "Verify your AWIVEST account" email:
// plum wordmark, white rounded card on a light background, a centred heading,
// the message body, and a divided footer. Body content keeps its own alignment
// (left by default) so multi-paragraph notices stay readable; short emails such
// as the sign-in code centre their own content.
function wrap(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light only"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:28px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="480" style="width:480px;max-width:100%;background:#ffffff;border:1px solid #ece8f0;border-radius:16px;border-collapse:separate;">
        <tr><td style="padding:34px 40px 0;text-align:center;">
          <div style="font-size:24px;font-weight:800;letter-spacing:3px;color:${PLUM};">AWIVEST</div>
        </td></tr>
        <tr><td style="padding:14px 40px 0;text-align:center;">
          <h1 style="font-size:19px;font-weight:800;margin:0;color:#1a1420;">${heading}</h1>
        </td></tr>
        <tr><td style="padding:14px 40px 4px;color:#3a3540;font-size:14px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 40px 30px;">
          <div style="border-top:1px solid #efecf3;margin:8px 0 14px;"></div>
          <p style="color:#9a94a2;font-size:11.5px;line-height:1.6;text-align:center;margin:0;">
            AWIVEST &middot; African Women Investors<br/>
            &copy; AWIVEST. All rights reserved. This is an automated message from the Investor Portal.
          </p>
        </td></tr>
      </table>
    </td></tr></table>
  </div></body></html>`;
}

// A reusable, centred "code" block styled like the verify email: a dashed
// magenta border on a soft pink tint, with large, letter-spaced plum digits.
// Exported so the sign-in-code email (and any future code email) stays consistent.
export function codeBlockHtml(code: string): string {
  return `<div style="text-align:center;margin:18px 0 6px;">
  <span style="display:inline-block;border:2px dashed ${MAGENTA};background:#fbeaf2;border-radius:14px;padding:14px 12px 14px 24px;font-size:30px;font-weight:800;letter-spacing:12px;color:${PLUM};">${code}</span>
</div>`;
}

function toText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function sendMemberEmail(opts: {
  to?: string | null;
  subject: string;
  heading: string;
  bodyHtml: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = (opts.to || '').trim();
  if (!key || !from) return { ok: false, error: 'email-not-configured' };
  if (!to) return { ok: false, error: 'no-recipient' };

  const html = wrap(opts.heading, opts.bodyHtml);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: opts.subject, html, text: toText(html) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `resend-${res.status}${detail ? ': ' + detail.slice(0, 200) : ''}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'send-failed' };
  }
}
