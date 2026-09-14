# AWIVEST Members Portal — Project Status & Setup Checklist

_Last updated: 14 September 2026._

This document summarises what the portal does, what has been built recently, and **every remaining step** to get it fully live. It is written so any admin can finish setup without further engineering help.

Live app: https://membersportal-lac.vercel.app/ · Target domain: investors-portal.awivest.com

---

## 1. What the system does, by role

The portal has two surfaces: the **Member portal** and the **Staff Console**.

- **Investor (member):** register and complete KYC; sign forms; view balance, transactions, planning and compliance; request withdrawals; sign documents sent to them (individual or ordered), filling any custom fields; view and download completed signed PDFs; see published meetings and join them (link, or in-portal live room); watch meeting recordings that have been shared.
- **Secretary (staff):** withdrawal queue (first review); member records; create and send documents to sign (individual, ordered, or broadcast to all/selected members); schedule meetings, attach Zoom/Meet links, create in-portal live rooms; sign their own step in an ordered document.
- **Treasurer (staff):** disbursements and money-out views; sign their own step in ordered documents.
- **Admin:** member governance, disbursements, configuration, role management; full documents-to-sign builder and meetings/live-room controls.
- **Chairlady (superadmin):** approves withdrawals and gives the final countersignature; can do everything above.
- **Auditor:** read-only audit access.

## 2. What has been built recently (v3.2)

- **Documents to Sign v2 — sequential (ordered) signing:** e.g. Investor → Secretary → Treasurer → Chairlady. Auto-advances with notification + email; on the last signature the PDF is marked complete and downloadable with a signature certificate. (PR #206)
- **Broadcast signing:** send one document to **all active members** or a **selected list** — each member runs the full order; staff see an "M of N members completed" rollup. (PR #209)
- **Custom fill-in fields per signer:** Text/Date, optional or required; values printed on the certificate. (PR #211 — awaiting merge)
- **Meeting video links + member Meetings page:** attach Zoom/Google Meet links + passcode, publish to members with a Join button. (PR #207)
- **Live meetings hosted in-portal + cloud recording** (Daily): create a live room, join embedded in the app, record, list/download recordings. (PR #210)
- **Automated crons:** security alerts + notifications endpoints, protected by CRON_SECRET, driven by GitHub Actions.

## 3. Every remaining step before setup is complete

Do these in order. Items already done are marked DONE.

### A. Merge code and run migrations
- DONE: #206, #207, #209, #210 merged; migrations `20260913130000`, `20260913140000`, `20260913150000`, `20260913160000` applied.
- [ ] **Merge PR #211** (custom signer fields), then run migration **`20260914010000_signer_custom_fields.sql`** in Supabase.
- [ ] Merge this docs PR (manual v3.2 + this checklist).

### B. Environment variables in Vercel (Production) — then Redeploy
- [ ] **`DAILY_API_KEY`** — from a Daily.co account (Developers → API key). Server-only; do **not** prefix `NEXT_PUBLIC_`. Required for live meeting rooms; until set, "Create live room" is disabled.
- [ ] **`RESEND_API_KEY`** and **`EMAIL_FROM`** — after verifying the sending domain in Resend (issue #196). Required for all outgoing email (signing notifications, alerts).
- [ ] **Sentry DSN** — for error monitoring (issue #187).
- [ ] Confirm **`CRON_SECRET`** in Vercel matches the GitHub repo secret (see C).
- After any env change, **Redeploy** (Vercel → Deployments → latest Production → Redeploy).

### C. Cron workflows (GitHub Actions)
- [ ] GitHub → repo → Settings → Secrets and variables → Actions: confirm **`CRON_SECRET`** secret equals the Vercel value; confirm the base-URL variable points to production.
- [ ] Actions tab → run **security-alerts** and **notifications** workflows once → confirm **green** (a 401 = secret mismatch). If there is no "Run workflow" button, add `workflow_dispatch:` to each workflow's `on:` block via the GitHub UI.
- [ ] Contribution reminders stay OFF until you set `app_settings.contribution_reminders_enabled = true`.

### D. Security and data protection
- [ ] Enable **TOTP MFA** for staff (issue #188).
- [ ] Make the **`sign-documents` storage bucket private** (issue #94).
- [ ] Enable Supabase **Point-in-Time Recovery** and run one **test restore** (issue #160).
- [ ] Stand up a **staging** environment (issue #177).

### E. Domain, email and data cutover
- [ ] **Resend DNS** records + SMS provider (issue #154).
- [ ] **DNS cutover** to `investors-portal.awivest.com` (issue #158).
- [ ] Import **Agnes / historical member data** (issue #157).

### F. Product decisions (not blocking, decide when ready)
- [ ] Append-only ledger (issue #182).
- [ ] Payments / M-Pesa Daraja integration (issue #161).

## 4. How to test the new features

- **Ordered signing:** create a sequential document, upload a Word-exported PDF, add signers (and any custom fields), send. Sign as each role in turn; confirm auto-advance, required-field validation, completion, and the certificate on the downloaded PDF.
- **Broadcast:** send to "All active members"; confirm each member gets their own chain and the batch rollup updates.
- **Meeting link:** schedule a meeting, paste a Meet/Zoom link, tick "Show to members"; confirm it appears on the member Meetings page with a working Join button.
- **Live room:** with `DAILY_API_KEY` set, click "Create live room", join from a staff and a member account, record, then Refresh recordings and download.

## 5. Reference

- **Palette:** plum #7A1E50, magenta #B22C75, lime #a6cd35, green #61CE70.
- **Contact:** info@awivest.com · +254 748 475 347.
- **Migrations** live at repo root `supabase/migrations/`.
