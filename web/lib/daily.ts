// Server-only Daily.co REST helpers.
//
// SECURITY: this module reads the DAILY_API_KEY secret from process.env and must
// NEVER be imported into a client component. Keep imports of it in server
// components, route handlers, and server actions only.
//
// No npm dependency is used — everything goes through the global fetch + the
// Daily REST API, and the live room is embedded via a plain <iframe> (Daily
// Prebuilt) so the app's type-check stays clean.

const DAILY_BASE = 'https://api.daily.co/v1';

export function dailyConfigured(): boolean {
  return !!process.env.DAILY_API_KEY;
}

async function daFetch(path: string, init?: RequestInit): Promise<any> {
  const key = process.env.DAILY_API_KEY;
  if (!key) {
    throw new Error('DAILY_API_KEY is not configured on the server. Add it in Vercel > Settings > Environment Variables and redeploy.');
  }
  const res = await fetch(`${DAILY_BASE}${path}`, {
    ...(init || {}),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...((init && init.headers) || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore body read errors */
    }
    throw new Error(`Daily API ${(init && init.method) || 'GET'} ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export async function createRoom(opts?: { namePrefix?: string }): Promise<{ name: string; url: string }> {
  const prefix = (opts && opts.namePrefix) || 'awivest';
  const json = await daFetch('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: `${prefix}-${Date.now().toString(36)}`,
      privacy: 'public',
      properties: { enable_recording: 'cloud' },
    }),
  });
  return { name: json.name as string, url: json.url as string };
}

export async function getRoom(name: string): Promise<any> {
  return daFetch(`/rooms/${encodeURIComponent(name)}`);
}

export async function listRecordings(
  roomName: string,
): Promise<Array<{ id: string; room_name: string; status: string; duration?: number; start_ts?: number }>> {
  const json = await daFetch(`/recordings?room_name=${encodeURIComponent(roomName)}`);
  const data = Array.isArray(json?.data) ? json.data : [];
  return data.map((r: any) => ({
    id: String(r?.id ?? ''),
    room_name: String(r?.room_name ?? roomName),
    status: String(r?.status ?? 'ready'),
    duration: typeof r?.duration === 'number' ? r.duration : undefined,
    start_ts: typeof r?.start_ts === 'number' ? r.start_ts : undefined,
  }));
}

export async function getRecordingAccessLink(id: string): Promise<string> {
  const json = await daFetch(`/recordings/${encodeURIComponent(id)}/access-link`);
  return json.download_link as string;
}
