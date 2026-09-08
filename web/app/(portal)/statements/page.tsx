import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StatementsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  // RLS returns statements shared with everyone (member_id null) plus this
  // member's own. Downloads open via short-lived signed links, never public.
  const { data: docRows } = await supabase
    .from('documents')
    .select('*')
    .in('type', ['statement', 'welfare_statement'])
    .order('created_at', { ascending: false });
  const docs = (docRows ?? []) as any[];

  const withUrls = await Promise.all(
    docs.map(async (d) => {
      const { data } = await supabase.storage.from('documents').createSignedUrl(d.file_path, 120);
      return { ...d, url: data?.signedUrl as string | undefined };
    })
  );

  return (
    <div>
      <div className="page-title">Statements</div>
      <div className="sub">Download statements and reports published to you. Files open via short-lived, signed links — never public.</div>

      <div className="card card-pad" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {withUrls.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No statements have been published to you yet.</div>
        ) : (
          withUrls.map((x) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <span className="ic" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--lime2)' }}>
                <i className="fa-solid fa-file-invoice-dollar" />
              </span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600 }}>{x.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>Published {x.created_at ? new Date(x.created_at).toLocaleDateString('en-GB') : ''}</div>
              </div>
              {x.url ? (
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                  <i className="fa-solid fa-download" /> Download
                </a>
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>Unavailable</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
