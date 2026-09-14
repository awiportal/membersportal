# AWIVEST Investor Portal — Architecture Essentials

> One-page quick reference. Full detail in `ARCHITECTURE.md`; product scope in `PRD.md`; contributor rules in `AGENTS.md`.

## What it is
A members-only investment portal for AWIVEST (women's investment collective, Kenya). Members ("Investors") see their money and transact; the office (Secretary / Treasurer / Admin / Chairlady) onboards, approves, publishes, reports, and collects e-signatures; an Auditor has read-only governance access.

## Stack in one line
**Next.js 14 (App Router, TypeScript) + Tailwind** on **Vercel (Hobby)**, backed by **Supabase** (Postgres / Auth / Storage / RLS), with an **in-house PDF e-signature** system (pdf-lib for stamping, pdf.js for in-browser rendering/field placement), **CloudConvert** (Word .docx → exact PDF), **Resend** (transactional email), and **Daily** (live video rooms). Payments (M-Pesa Daraja) are planned, not yet wired.

## Run it locally
```bash
npm install
cp .env.example .env.local   # fill Supabase + Resend + CloudConvert + Daily keys
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
| Server API routes | `app/api/sign/*` (in-house e-sign + `convert-docx` Word→PDF), `app/api/cron/*` (scheduled jobs) |
| Roles & guards | `lib/roles.ts` (`isStaff`, `isAdmin`, `isChairlady`, `isAuditor`, `isTreasurer`, `canViewStaffConsole`, `roleLabel`) |
| Navigation trees | `lib/nav.ts` |
| Supabase clients | `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (service role, server-only) |
| Financial profile / calculators | `lib/msi.ts`, `lib/planning.ts`, `lib/goals.ts` |
| E-signature (server) | `lib/pdfSignature.ts`, `positionedSignPdf.ts`, `signedPdf.ts`, `signedRequestPdf.ts`, `signedSequencePdf.ts`, `sequentialSign.ts`, `fieldLayout.ts` |
| PDF rendering (client) | `components/pdfjs.ts` + `public/pdf.worker.min.mjs` (served as a same-origin static asset) |
| Word → PDF | `lib/cloudconvert.ts` + `app/api/sign/convert-docx` |
| Auth / 2FA / MFA | `lib/twofa.ts` + `lib/twofaGate.ts` (email code), `lib/mfaGate.ts` (TOTP for Admin + Chairlady), `components/IdleTimeout.tsx` (20-min idle + return-after-away auto-logout) |
| Live meetings | `lib/daily.ts` |
| Email | `lib/email.ts` (Resend) |
| Scheduled jobs | `lib/cron.ts` + `app/api/cron/*` |
| DB schema & RLS | `supabase/migrations/*` |
| Clickable prototype | `prototype/index.html` |
| Legacy e-sign helper | `lib/pandadoc.ts` (superseded by the in-house signer) |

## Roles (DB enum `member_role`)
`member` = Investor · `secretary` = Secretary · `treasurer` = Treasurer · `auditor` = Auditor (read-only governance) · `admin` = Admin · `superadmin` = Chairlady.
UI gates via `lib/roles.ts`; **server re-checks**; **RLS is the real enforcement.**
`STAFF_ROLES` = secretary, treasurer, admin, superadmin. The **Auditor is NOT staff** — it is read-only, granted at the DB by the `auditor_read` SELECT policies; `canViewStaffConsole` = staff **plus** Auditor.
Withdrawal duties are segregated: any staff **review** (submitted → under_review), Chairlady **decides** (approve / reject), Admin or Chairlady **pay** (disburse / mark paid).

## Key tables
`profiles` · `member_finances` · `kyc_documents` · `documents` · `agreements` · `sign_requests` (in-house e-sign; `field_layout` = placed signature/field boxes) · `opportunities` (+ `opportunity_interest`) · `payments` · `dividends` · `app_settings` · `audit_log`.
`profiles.status`: `pending | active | inactive | exited | removed`.

## Non-negotiables
- **RLS on all member data.** Members read only their own rows.
- **Secrets server-side only.** Never ship the service-role key or any API secret to the browser — server-only keys must not carry the `NEXT_PUBLIC_` prefix.
- **No production PII in the repo** (it is public) — demo/seed data only.
- **Every staff mutation** (approve, exit, remove, role change, publish, sign) → `audit_log`.
- **Reconcile to the statement.** Member totals must equal contributions + interest by source. Exact cents, always.

## Control totals (compiled statement, 2018 – Jul 2026, KES)
Total **119,939,314** · excl-exits **105,865,370** · contributions **83,202,428** · interest **37,157,396** · withdrawals (2 exits) **14,073,944** · members **48** (46 active, 2 exited).

## Env vars
**Required (all secrets server-only — never `NEXT_PUBLIC_`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TWOFA_SIGNING_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CLOUDCONVERT_API_KEY`, `DAILY_API_KEY`, `CRON_SECRET`.
**Planned / legacy:** `MPESA_*` (Daraja payments — not yet wired), `SENTRY_DSN` (error monitoring), `PANDADOC_*` (legacy e-sign).

## Deploy
Feature branch → Vercel preview → PR → merge to `main` → prod. DB changes via migrations, staging before prod.

**Build notes (Hobby plan):**
- Vercel installs with `npm ci`, so `package-lock.json` must stay in sync with `package.json` — a new dependency without a lockfile update fails install (`tsc` does not catch this).
- The pdf.js worker ships as a static `/public/pdf.worker.min.mjs` asset and `components/pdfjs.ts` points `GlobalWorkerOptions.workerSrc` at it. Do **not** let webpack emit the worker via `new URL(..., import.meta.url)` — Terser then chokes on pdfjs v4's ESM worker ("'import'/'export' cannot be used outside of module code") and the build fails. Keep the `/public` worker in sync with the `pdfjs-dist` version on upgrade.
- A full `next build` (not just `tsc`) is required to catch webpack/Terser/lockfile issues.
