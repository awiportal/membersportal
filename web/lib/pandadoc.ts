/**
 * Server-only PandaDoc integration. NEVER import into a client component —
 * it reads the PANDADOC_API_KEY server env var.
 *
 * Flow for an embedded signature:
 *   createFromTemplate -> (poll to draft) sendSilently -> createSigningLink
 * Then poll isCompletedBy() to see whether a given recipient has signed.
 */

const BASE = 'https://api.pandadoc.com/public/v1';

function apiKey(): string | null {
  return process.env.PANDADOC_API_KEY || null;
}

export function pandadocConfigured(): boolean {
  return !!apiKey();
}

async function pd(path: string, init?: RequestInit): Promise<any> {
  const key = apiKey();
  if (!key) throw new Error('PandaDoc is not configured (PANDADOC_API_KEY is missing on the server).');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `API-Key ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const detail = json?.detail || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`PandaDoc ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return json;
}

/** Lightweight auth check — lists one document to confirm the key works. */
export async function ping(): Promise<void> {
  await pd('/documents?count=1');
}

export async function createFromTemplate(opts: {
  templateId: string;
  roleName: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}): Promise<string> {
  const recipient: Record<string, any> = { email: opts.email, role: opts.roleName };
  if (opts.firstName) recipient.first_name = opts.firstName;
  if (opts.lastName) recipient.last_name = opts.lastName;
  const body = {
    name: opts.name || 'AWIVEST Agreement',
    template_uuid: opts.templateId,
    recipients: [recipient],
  };
  const doc = await pd('/documents', { method: 'POST', body: JSON.stringify(body) });
  if (!doc?.id) throw new Error('PandaDoc did not return a document id.');
  return doc.id as string;
}

async function waitForStatus(id: string, targets: string[], tries = 10, delayMs = 1500): Promise<any> {
  let doc: any = null;
  for (let i = 0; i < tries; i++) {
    doc = await pd(`/documents/${id}`);
    if (targets.includes(doc?.status)) return doc;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return doc;
}

/** Move a freshly-created document to 'sent' (silently, no PandaDoc email). */
export async function sendSilently(id: string): Promise<void> {
  const doc = await waitForStatus(id, ['document.draft'], 12, 1500);
  if (doc?.status !== 'document.draft') {
    throw new Error(`Document is not ready to send yet (status: ${doc?.status || 'unknown'}). Please try again in a moment.`);
  }
  await pd(`/documents/${id}/send`, {
    method: 'POST',
    body: JSON.stringify({ silent: true, subject: 'AWIVEST Agreement for your signature' }),
  });
}

/** Create a short-lived signing link the recipient can open in a new tab. */
export async function createSigningLink(id: string, email: string): Promise<string> {
  const session = await pd(`/documents/${id}/session`, {
    method: 'POST',
    body: JSON.stringify({ recipient: email, lifetime: 900 }),
  });
  if (!session?.id) throw new Error('PandaDoc did not return a signing session.');
  return `https://app.pandadoc.com/s/${session.id}`;
}

/** Has a specific recipient completed their signature (or the whole doc)? */
export async function isCompletedBy(id: string, email: string): Promise<{ completed: boolean; status: string }> {
  const doc = await pd(`/documents/${id}/details`);
  const status: string = doc?.status || 'unknown';
  const recipients: any[] = doc?.recipients || [];
  const mine = recipients.find((r) => String(r?.email || '').toLowerCase() === email.toLowerCase());
  const completed = status === 'document.completed' || !!(mine && mine.has_completed === true);
  return { completed, status };
}

/**
 * Full signing summary for staff views: whether the member has signed their own
 * part (what unlocks their onboarding), whether the whole document is executed
 * by every party, and the per-signer breakdown.
 */
export async function getEsignSummary(
  id: string,
  memberEmail: string
): Promise<{
  status: string;
  memberSigned: boolean;
  fullyExecuted: boolean;
  signers: { email: string; name: string; role?: string; completed: boolean }[];
}> {
  const doc = await pd(`/documents/${id}/details`);
  const status: string = doc?.status || 'unknown';
  const fullyExecuted = status === 'document.completed';
  const recipients: any[] = doc?.recipients || [];
  const signers = recipients.map((r) => {
    const email = String(r?.email || '');
    const name = [r?.first_name, r?.last_name].filter(Boolean).join(' ') || email;
    return {
      email,
      name,
      role: r?.role || undefined,
      completed: fullyExecuted || r?.has_completed === true,
    };
  });
  const mine = signers.find((s) => s.email.toLowerCase() === memberEmail.toLowerCase());
  const memberSigned = fullyExecuted || !!(mine && mine.completed);
  return { status, memberSigned, fullyExecuted, signers };
}
