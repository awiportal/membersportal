# AWIVEST Investor Portal — Architecture Essentials

> One-page quick reference. Full detail in `ARCHITECTURE.md`; product scope in `PRD.md`; contributor rules in `AGENTS.md`.

## What it is
A members-only investment portal for AWIVEST (women's investment collective, Kenya). Members see their money and transact; the office (Secretary/Admin/Chairlady) onboards, approves, publishes, and reports.

## Stack in one line
**Next.js (App Router, TypeScript) + Tailwind** on **Vercel**, backed by **Supabase** (Postgres/Auth/Storage/RLS), with **M-Pesa (Daraja)** payments and **PandaDoc** e-sign.

## Run it locally
```bash
npm install
cp .env.example .env.local   # fill Supabase + PandaDoc + M-Pesa (sandbox) keys
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
npm run lint                 # lint
```
DB: apply SQL in `supabase/migrations` to your Supabase project.

## Where things live
| Need | Path |
|---|---|
| Member pages | `app/(portal)/*` → `components/Shell.tsx` |
| Staff pages | `app/(staff)/*` → `components/StaffShell.tsx` |
| Onboarding wizard | `app/onboarding/` + `lib/onboarding.ts` |
| Webhooks / server routes | `app/api/*` (pandadoc, mpesa) |
| Roles & guards | `lib/roles.ts` (`isStaff`, `isAdmin`, `ROLE_META`) |
| Navigation trees | `lib/nav.ts` |
| Supabase clients | `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (service role, server-only) |
| Financial profile / calculators | `lib/msi.ts`, `lib/planning.ts`, `lib/goals.ts` |
| E-sign / 2FA | `lib/pandadoc.ts`, `lib/twofa.ts` |
| DB schema & RLS | `supabase/migrations/*` |
| Clickable prototype | `prototype/index.html` |

## Roles (DB enum `member_role`)
`member` = Investor · `secretary` = Secretary · `admin` = Admin · `superadmin` = Chairlady.
UI gates via `lib/roles.ts`; **server re-checks**; **RLS is the real enforcement.**

## Key tables
`profiles` · `member_finances` · `kyc_documents` · `documents` · `agreements` · `opportunities` (+ `opportunity_interest`) · `payments` · `dividends` · `audit_log`.
`profiles.status`: `pending | active | inactive | exited | removed`.

## Non-negotiables
- **RLS on all member data.** Members read only their own rows.
- **Secrets server-side only.** Never ship the service-role key or payment/PandaDoc secrets to the browser.
- **No production PII in the repo** (it is public) — demo/seed data only.
- **Every staff mutation** (approve, exit, remove, role change, publish) → `audit_log`.
- **Reconcile to the statement.** Member totals must equal contributions + interest by source.

## Control totals (compiled statement, 2018 – Jul 2026, KES)
Total **119,939,314** · excl-exits **105,865,370** · contributions **83,202,428** · interest **37,157,396** · withdrawals (2 exits) **14,073,944** · members **48** (46 active, 2 exited).

## Env vars (indicative)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PANDADOC_API_KEY`, `PANDADOC_WEBHOOK_SECRET`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_SECRET`, `TWOFA_SIGNING_SECRET`.

## Deploy
Feature branch → Vercel preview → PR → merge to `main` → prod. DB changes via migrations, staging before prod.
