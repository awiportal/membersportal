# AWIVEST Investor Portal — Architecture

**Status:** v1.0 · September 2026
**Companion docs:** `PRD.md` (what & why), `ARCHITECTURE-ESSENTIALS.md` (one-page quick ref), `AGENTS.md` (contributor/agent rules).

---

## 1. System overview

The portal is a **Next.js (App Router) + TypeScript** application deployed on **Vercel**, backed by **Supabase** (Postgres, Auth, Storage, Row-Level Security, Edge Functions). Payments run through **M-Pesa (Safaricom Daraja)** with **Flutterwave** as an alternate rail. Membership agreements are e-signed via **PandaDoc**.

```
                         ┌───────────────────────────────────────────┐
                         │                Browser                     │
                         │  Next.js (React, App Router, Tailwind)     │
                         │  Member shell  ·  Staff shell              │
                         └───────────────┬───────────────────────────┘
                                         │ HTTPS (session cookie)
                 ┌───────────────────────▼────────────────────────┐
                 │            Next.js server (Vercel)              │
                 │  Server Components · Route Handlers · Actions   │
                 │  supabase-server (service role, server only)    │
                 └───┬───────────────┬──────────────┬─────────────┘
                     │               │              │
        ┌────────────▼───┐   ┌───────▼──────┐   ┌───▼───────────┐
        │   Supabase     │   │  PandaDoc    │   │  Daraja /     │
        │ Postgres+Auth  │   │  e-sign API  │   │  Flutterwave  │
        │ Storage + RLS  │   │  + webhook   │   │  + callbacks  │
        └────────────────┘   └──────────────┘   └───────────────┘
```

**Trust boundary:** the browser only ever holds an authenticated Supabase session; all privileged operations (service-role queries, webhook verification, payment initiation) happen server-side. Row-Level Security is the last line of defence even if the UI is bypassed.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), React, TypeScript |
| Styling | Tailwind CSS + design tokens (brand purple `#7e2674`, lime `#a6cd35`), Inter, glassmorphism, dark/light theme |
| Backend-as-a-service | Supabase: Postgres, Auth, Storage, RLS, Edge Functions |
| Hosting | Vercel (SSR + edge), preview deploys per PR |
| Payments | M-Pesa Daraja (STK push + callback), Flutterwave (alt) |
| E-signature | PandaDoc (document create + webhook status) |
| Charts | Lightweight in-repo SVG components (AreaChart, Donut) |

---

## 3. Repository structure (App Router)

```
app/
  (portal)/            # member-facing route group  -> Shell
    dashboard/
    portfolio/
    financial-profile/
    planning/ goals/
    payments/ dividends/ statements/ opportunities/
    forms/ kyc/ documents/ agreements/ welfare/
    profile/ notifications/ settings/
  (staff)/             # staff route group           -> StaffShell
    staff/ (approvals & members)
    staff-kyc/ staff-documents/ staff-agreements/
    staff-opportunities/ staff-reports/ staff-roles/ staff-settings/
  onboarding/          # multi-step wizard
  api/                 # route handlers: webhooks (pandadoc, mpesa), server actions
components/
  Shell.tsx StaffShell.tsx ThemeToggle.tsx
  charts/ (AreaChart, Donut)  LoadDemoData.tsx
lib/
  supabase/ (client.ts, server.ts)
  roles.ts   # role enum, helpers: isStaff/isAdmin, ROLE_META
  nav.ts     # member + staff navigation definitions
  onboarding.ts  msi.ts  goals.ts  planning.ts
  pandadoc.ts  twofa.ts
supabase/
  migrations/  # SQL: tables, enums, RLS policies
prototype/
  index.html   # self-contained clickable prototype (this build)
  README.md
PRD.md ARCHITECTURE.md ARCHITECTURE-ESSENTIALS.md AGENTS.md
```

Route groups `(portal)` and `(staff)` map to the two shells and to the navigation trees in `lib/nav.ts`. Role gating for `(staff)` routes is enforced server-side and mirrored in the client guard.

---

## 4. Data model (Postgres)

Core tables (columns abbreviated; see `supabase/migrations`):

- **profiles** — `id (uuid, = auth.users.id)`, `full_name`, `email`, `phone`, `member_no`, `account_type` (individual|group|corporate|other), `role member_role`, `status` (pending|active|inactive|exited|removed), `kyc_status` (unverified|in_review|verified|rejected), `onboarding_state`, `exit_date`, timestamps.
- **member_finances** — `profile_id`, `contributions`, `interest_2018_2023`, `interest_britam`, `interest_jubilee_mmf`, `interest_jubilee_fif`, `interest_other`, `total`, `withdrawals`, `as_at`. Imported from the compiled workbook; the reporting source of truth.
- **kyc_documents** — `profile_id`, `doc_type`, `storage_path` (private bucket), `status`, `reviewed_by`, `reviewed_at`.
- **documents** — `id`, `title`, `type`, `visibility` (all|member), `member_id?`, `storage_path`, `published_by`, `created_at`.
- **agreements** — `profile_id`, `pandadoc_id`, `status` (draft|sent|awaiting_signature|completed), `updated_at`.
- **opportunities** — `id`, `title`, `provider`, `indicative_return`, `minimum`, `risk`, `published_by`, `created_at`; **opportunity_interest** — `opportunity_id`, `profile_id`, `created_at`.
- **payments** — `profile_id`, `channel` (mpesa|flutterwave), `amount`, `ref`, `status`, `created_at`.
- **dividends** — `period`, `amount`, `status`, `paid_at`.
- **audit_log** — `actor_id`, `action`, `target_type`, `target_id`, `meta jsonb`, `created_at`.

Enums: `member_role (member|secretary|admin|superadmin)`, plus status enums above.

### 4.1 Row-Level Security (representative)
- `profiles`: a member can `select/update` only `where id = auth.uid()`; staff (`secretary|admin|superadmin`) can `select` all; role changes restricted to `admin|superadmin`.
- `member_finances`, `kyc_documents`, `payments`: member sees only own rows; staff read per role.
- `documents`: visible where `visibility='all'` OR `member_id = auth.uid()`; staff manage.
- `opportunities`: readable by all authenticated; writable by `admin|superadmin`.
- Helper: a SQL function `current_role()` reads the caller's `profiles.role` for policy predicates.

---

## 5. Auth, roles & RBAC
- Supabase Auth issues the session; `profiles.role` is the authorization source.
- `lib/roles.ts` exposes `isStaff()`, `isAdmin()`, and `ROLE_META` (labels/icons). The client uses these to render nav and guard routes; **the server re-checks** on every privileged action, and **RLS enforces** at the data layer.
- **2FA** (`lib/twofa.ts`): time-boxed, HMAC-signed one-time tokens; verified server-side before elevation.

---

## 6. Storage & signed URLs
- Buckets: `documents` (member statements/policies) and `kyc` (identity docs) — both **private**.
- Access is via short-lived Supabase **signed URLs** minted server-side after an RLS/role check; raw object paths are never exposed to the browser.

---

## 7. Payments
- **M-Pesa (Daraja):** server initiates **STK push** to the member's phone; Safaricom calls back to `api/mpesa/callback`; the handler verifies and writes a `payments` row + updates balances/audit.
- **Flutterwave:** alternate card/bank rail with its own verified callback.
- Credentials (consumer key/secret, shortcode/passkey, callback secret) live in server env; never client-side.

---

## 8. E-signature (PandaDoc)
- `lib/pandadoc.ts` creates a membership agreement from a template for the onboarding member.
- PandaDoc posts status to `api/pandadoc/webhook`; the handler verifies the signature secret and updates `agreements.status`.
- Onboarding e-sign also supports an in-app draw-to-sign step for forms.

---

## 9. Security
- **RLS-first** (see §4.1) — the UI is never the only gate.
- Server-only secrets; service-role key never shipped to the client.
- Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy).
- Public/onboarding forms protected by honeypot + CAPTCHA and rate limiting.
- Webhooks (PandaDoc, M-Pesa) verify shared secrets/signatures before mutating state.
- All staff mutations written to `audit_log`.
- **No production PII in the repository** (this repo is public) — see `AGENTS.md`.

---

## 10. Environments & configuration
- **Local:** `.env.local` with Supabase URL/anon key + service role (server), PandaDoc + M-Pesa sandbox keys.
- **Preview:** Vercel preview per PR + a Supabase preview/staging project.
- **Production:** Vercel prod + production Supabase; secrets set in Vercel/Supabase dashboards.
- Never commit `.env*`. Rotate any leaked key immediately.

Required env (names indicative): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PANDADOC_API_KEY`, `PANDADOC_WEBHOOK_SECRET`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_SECRET`, `TWOFA_SIGNING_SECRET`.

---

## 11. Deployment & CI
- Push to a feature branch → Vercel preview deploy → PR review → merge to `main` → production deploy.
- DB changes ship as SQL migrations under `supabase/migrations` and are applied to staging before production.

---

## 12. Data import (reconciliation)
- The compiled member workbook (2018 – Jul 2026) is the canonical financial source. An import maps each member row into `member_finances` (contributions + interest columns + total + withdrawals).
- Aggregate control totals for validation: total **119,939,314**, excl-exits **105,865,370**, contributions **83,202,428**, interest **37,157,396**, withdrawals **14,073,944**.

---

## 13. The prototype
- `prototype/index.html` is a **single, self-contained** clickable model of the full experience (all four roles, every page), using an in-memory data layer that mirrors the tables above and the **real aggregate** distribution figures. It carries **no real member PII** (names anonymized) and exists for design/stakeholder review — it is not the runtime app.

---
*See `ARCHITECTURE-ESSENTIALS.md` for the condensed quick reference.*
