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

const BRAND = '#7e2674';

function wrap(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f5f8;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:${BRAND};color:#ffffff;padding:16px 22px;border-radius:12px 12px 0 0;font-weight:800;letter-spacing:.3px;">AWIVEST</div>
    <div style="background:#ffffff;padding:24px;border:1px solid #ececec;border-top:0;border-radius:0 0 12px 12px;color:#1a1420;line-height:1.5;">
      <h1 style="font-size:18px;margin:0 0 14px;color:#1a1420;">${heading}</h1>
      ${bodyHtml}
      <p style="color:#8a8a8a;font-size:12px;margin:24px 0 0;">AWIVEST LTD &middot; African Women Investors<br/>This is an automated message from the AWIVEST Investor Portal.</p>
    </div>
  </div></body></html>`;
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
