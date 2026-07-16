# AWIVEST Members Portal

A standalone investor portal for **African Women Investors (AWIVEST)**, replacing the WordPress plugin with a modern, portable platform that grows into the full **AWI Management System**.

## Stack
- **Frontend:** Next.js + TypeScript + Tailwind CSS (deployed on Vercel)
- **Backend:** Supabase — PostgreSQL + Auth + Storage + Row-Level Security + Edge Functions
- **Payments:** Safaricom Daraja (M-Pesa) + Flutterwave (cards/bank) — wired in during the payments phase

## Repository layout
- `awivest-investor-portal/` — legacy WordPress plugin (source of features + data to migrate)
- `AWIVEST-Investor-Portal-Manual.docx` — functional manual + flowcharts
- `supabase/` — database migrations & config (the new system of record)
- *(Next.js app scaffold lands here next)*

## Database
`supabase/migrations/` holds the schema. Apply it via the Supabase GitHub integration (merge to `main`), the Supabase SQL editor, or `supabase db push`.

## Security
Only `NEXT_PUBLIC_*` values reach the browser. The service-role key and all payment secrets live in Supabase/Vercel environment variables only — never committed to the repo.
