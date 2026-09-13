import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPendingAllowedPath } from '@/lib/pendingAccess';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === '/login';

  // Not signed in and trying to reach a protected page -> go to login
  if (!user && !isAuthPage && path !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  // Signed in and on the login page -> go to dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // --- Pending-member access gate -------------------------------------------
  // A signed-in member whose account is not yet approved (status !== 'active')
  // may only reach the onboarding-essential sections. Any other portal page is
  // bounced to the dashboard here, server-side, so it cannot be reached just by
  // typing the URL. Only restricted paths trigger the profile lookup, so the
  // common case adds no database work. Fail-open by design: a lookup error, a
  // staff role, or the AWI_REQUIRE_PENDING_GATE kill-switch all let the request
  // through untouched — this gate must never lock a member out.
  const gateOn = process.env.AWI_REQUIRE_PENDING_GATE !== 'false';
  const isStaffPath = path.startsWith('/staff');
  const isSystemPath =
    path === '/' ||
    path.startsWith('/login') ||
    path.startsWith('/verify') ||
    path.startsWith('/monitoring') ||
    path.startsWith('/api') ||
    path.startsWith('/auth');
  if (user && gateOn && !isStaffPath && !isSystemPath && !isPendingAllowedPath(path)) {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', user.id)
        .maybeSingle();
      const role = (prof?.role ?? '') as string;
      const isStaffRole = ['secretary', 'treasurer', 'admin', 'superadmin', 'auditor'].includes(role);
      const isActiveMember = prof?.status === 'active';
      if (prof && !isActiveMember && !isStaffRole) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        url.searchParams.set('locked', '1');
        return NextResponse.redirect(url);
      }
    } catch {
      // fail-open — never lock a member out on a transient lookup error
    }
  }

  return response;
}
