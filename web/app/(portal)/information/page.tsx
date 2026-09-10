import { createClient } from '@/lib/supabase/server';
import InfoCenter from './InfoCenter';

export const dynamic = 'force-dynamic';

// Member-facing Information Center: the published feed the office maintains.
// One shared source (announcements), so every member sees the same items.
export default async function InformationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from('announcements')
    .select('*')
    .eq('published', true)
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="page-title">Information Center</div>
      <div className="sub">Announcements, news, events and updates from the AWIVEST office.</div>
      <InfoCenter posts={(rows ?? []) as any[]} />
    </div>
  );
}
