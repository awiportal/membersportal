import * as React from 'react';
import { createClient } from '@/lib/supabase/server';

// Per-request memoised auth + profile lookups.
//
// The (portal) and (staff) layouts each need the signed-in user and their
// profile, and so does almost every page beneath them. Previously each did its
// OWN supabase.auth.getUser() (a network round-trip to Supabase Auth to validate
// the session JWT) plus its OWN profiles read. React.cache collapses duplicate
// calls within a single server render to one, so each navigation drops 1-2
// redundant round-trips. Safe: cache is per-request, never cross-request.
//
// React.cache exists at runtime in the React Server Components build the App
// Router uses, but its type ships only in react/canary. We reference it via a
// localized cast so the stable @types/react type-checks without pulling in
// canary type overrides across the whole build.
const cache = (React as unknown as {
  cache: <T extends (...args: any[]) => any>(fn: T) => T;
}).cache;

export const getSessionUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getSessionProfile = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data;
});
