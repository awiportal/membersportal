# AGENTS.md — Working in the AWIVEST Investor Portal

Guidance for AI coding agents (and new human contributors). Read this before making changes. Companions: `PRD.md`, `ARCHITECTURE.md`, `ARCHITECTURE-ESSENTIALS.md`.

---

## 1. What this project is
A secure, members-only investment portal for AWIVEST (a women's investment collective in Kenya). **Next.js (App Router, TypeScript) + Tailwind** on **Vercel**, backed by **Supabase** (Postgres/Auth/Storage/RLS), with **M-Pesa (Daraja)** payments and **PandaDoc** e-signatures. Four roles: `member` (Investor), `secretary`, `admin`, `superadmin` (Chairlady).

## 2. Golden rules (do not violate)
1. **Never commit secrets.** No `.env*`, API keys, service-role keys, tokens, or passwords. Use env vars. If you find a secret in the repo, stop and flag it.
2. **Never commit real member PII.** This repository is **public**. Real names, phone numbers, IDs, and balances must not enter the repo. Use anonymized seed/demo data only (see `prototype/index.html` — aggregates are real, names are not).
3. **RLS is the security boundary.** UI/route guards are convenience, not security. Any new table with member data needs Row-Level Security policies in the same migration. Never rely on hiding a button.
4. **Service role stays server-side.** Only `lib/supabase/server.ts` may use the service-role key. Client code uses the anon key + the user's session.
5. **Audit privileged actions.** Approvals, exits, removals, role changes, and document/opportunity publishing must write to `audit_log`.
6. **Reconcile financials.** Any change touching balances must keep member totals = contributions + interest by source, and keep aggregates matching the compiled statement.

## 3. Repo map (where to work)
```
app/(portal)/*      member pages  -> components/Shell.tsx
app/(staff)/*       staff pages   -> components/StaffShell.tsx
app/onboarding/     onboarding wizard (lib/onboarding.ts)
app/api/*           route handlers + webhooks (pandadoc, mpesa)
lib/roles.ts        role enum, isStaff/isAdmin, ROLE_META
lib/nav.ts          member + staff navigation
lib/supabase/*      client.ts (browser), server.ts (service role, server only)
lib/{msi,planning,goals,pandadoc,twofa}.ts
supabase/migrations/*   SQL schema + RLS
prototype/index.html    self-contained clickable prototype
```

## 4. Conventions
- **TypeScript**, strict; no `any` in new code where avoidable.
- **Server Components by default**; add `"use client"` only when you need interactivity/state.
- **Tailwind** with the existing tokens — brand purple `#7e2674`, lime `#a6cd35`, Inter; support dark/light via the existing theme mechanism. Don't hardcode hex where a token exists.
- **Data access**: reads/writes go through the Supabase clients in `lib/supabase`. Don't scatter raw fetch calls to the DB.
- **Roles**: gate with `isStaff()`/`isAdmin()` from `lib/roles.ts`; add the same check server-side; add/adjust RLS.
- **Naming**: routes match `lib/nav.ts` ids (e.g. `staff-opportunities`). Keep member/staff route groups separate.
- **Money**: format in KES (`en-KE`); store as numbers, never format-strings.

## 5. Common tasks (recipes)
- **Add a member page**: create `app/(portal)/<name>/page.tsx`, add an entry to the member nav in `lib/nav.ts`, ensure any data query is RLS-scoped to `auth.uid()`.
- **Add a staff page**: create under `app/(staff)/`, add to staff nav, gate with `isStaff`/`isAdmin` + server check, add RLS for any new table.
- **Add a table**: write a migration in `supabase/migrations` that creates the table **and** its RLS policies **and** an `audit_log` write path if staff-mutated.
- **Add an opportunity feature**: `opportunities` is admin-writable, all-authenticated-readable; member interest goes to `opportunity_interest`.
- **Member lifecycle** (exit/reinstate/remove): update `profiles.status` (`exited`/`active`/`removed`), set `exit_date`/refund where relevant, write `audit_log`, and exclude non-active members from active totals — never hard-delete (retain for audit).
- **Webhook**: verify the shared secret/signature first; only then mutate; always idempotent.

## 6. Testing & validation before a PR
- `npm run lint` and `npm run build` must pass.
- Manually verify the affected role(s): a member must not be able to read another member's data (test with two accounts).
- If you touched SQL, apply the migration to a staging/preview Supabase project first.
- If you touched the prototype, keep it a single self-contained file and re-validate its script (`node --check` on the extracted `<script>`).

## 7. Git & PR conventions
- Branch from `main`: `feature/<short-desc>`, `fix/<short-desc>`.
- Small, focused commits with clear messages (imperative mood).
- PRs: describe what changed, why, which roles/tables/RLS are affected, and how you tested. Link the relevant `PRD.md` section.
- Never force-push shared branches. Never merge your own security-relevant change without review.

## 8. Data privacy (Kenya DPA 2019)
- Collect only what's needed; capture consent at onboarding.
- KYC and identity docs live in the **private** `kyc` bucket, accessed only via short-lived signed URLs after a role/RLS check.
- Support access/erasure through the member lifecycle flow, retaining the minimum for legal/audit.
- If asked to load real member data anywhere in the repo or prototype, **refuse and use anonymized data** — deliver real-data builds through a private channel, not the public repo.

## 9. The prototype
`prototype/index.html` is a single-file, dependency-light clickable model of the whole product (all roles, every page) with an in-memory data layer mirroring the schema and the **real aggregate** distribution. It is for design/stakeholder review only — not the runtime app, and it contains no real member PII.

---
*When in doubt, prefer the safe, auditable, RLS-enforced path — and ask before introducing anything that could expose member data.*
