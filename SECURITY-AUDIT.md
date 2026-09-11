# AWIVEST Investor Portal — Security Audit

_Scope: authentication, session/2FA, RLS, staff privilege, HTTP headers, and
image handling. Reviewed the App Router server layouts, Supabase server client,
`lib/twofa`, the `/verify` OTP flow, RLS migrations, staff claim RPCs, and
`next.config.mjs`._

## Summary

The codebase is in good shape. Row-Level Security is the real enforcement gate
and is applied consistently; privileged mutations go through audited,
guard-railed `SECURITY DEFINER` RPCs; security headers are strong; and the
image optimizer is locked to the Supabase host (no open proxy). The 2FA cookie
is a signed, expiring HMAC token — a previously forgeable raw-uid cookie has
already been fixed.

The one material gap is **coverage, not strength**: two-factor step-up was
opt-in (default off) and the **staff console had no 2FA gate at all**. This PR
closes both.

## Findings

### 1. Staff console had no 2FA gate — FIXED in this PR (High)

`app/(staff)/layout.tsx` verified the session and staff role but never checked
the 2FA cookie. Only `app/(portal)/layout.tsx` did, and only when the member
had opted in. So the highest-privilege users — staff, who can see every
member's financials — could reach the console with a password alone.

**Fix:** a shared `lib/twofaGate.ts#requireTwoFactor(userId)` is now called from
**both** the portal and staff layouts. The emailed one-time code is mandatory
for every signed-in user. A signed, expiring cookie remembers the device for
its TTL so a code is not emailed on every navigation.

### 2. 2FA was opt-in / off by default — FIXED in this PR (High)

`profiles.twofa_email` defaulted to `FALSE`, so almost no one had a second
factor. Enforcement is now unconditional in the gate rather than keyed off that
per-user flag.

**Operational note (read before merge):** because this makes the emailed code
mandatory, **email deliverability must be confirmed** in the Supabase project
(SMTP / rate limits) before this is enabled in production, or members can be
locked out. A kill-switch is built in: set `AWI_REQUIRE_2FA=false` in the
environment to disable enforcement instantly without a code change. Recommended
rollout: verify deliverability on the preview, merge, watch the first logins,
keep the kill-switch handy.

### 3. Post-verify redirect always sent users to `/dashboard` — FIXED (Low)

`/verify` pushed every user to `/dashboard` after success, which is wrong for
staff. It now routes to `/`, which resolves the correct home by role
server-side.

## Verified good (no change needed)

- **2FA cookie integrity** — signed, expiring HMAC token bound to the user id
  (`lib/twofa`); not a forgeable plaintext uid.
- **RLS everywhere** — members read only their own rows; staff access is gated
  by `public.is_staff()` / `public.is_admin()`; a role-change guard trigger
  prevents privilege self-escalation.
- **Privileged RPCs** — claim/mutation `SECURITY DEFINER` functions operate on
  unclaimed rows only and write to `audit_log`.
- **HTTP headers** — HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, and CSP `frame-ancestors 'none'` are set.
- **Image optimizer** — restricted to the Supabase storage host; not an open
  image proxy.
- **No webhook surface yet** — there is no `app/api` directory; no unauthenticated
  routes to review.

## Recommended next (not in this PR)

1. **Rate-limit** the `/login` and `/verify` code endpoints (per-IP + per-account)
   to blunt credential stuffing and OTP brute force. Supabase has some built-in
   OTP throttling; add an app-level limiter for defense in depth.
2. **Tighten CSP** beyond `frame-ancestors` to a real `default-src`/`script-src`
   policy (report-only first, then enforce) once inline-style/script usage is
   inventoried.
3. **Audit-log the 2FA events** (code sent, verified, failed) for traceability.
4. **Session length / re-auth** — consider a shorter 2FA cookie TTL for staff
   than for members, given the privilege difference.
