# AWIVEST Investor Portal — Product Requirements Document (PRD)

**Owner:** AWIVEST (Dr. Agnes Odinga, Founder & Chairlady)
**Status:** Living document — v1.0
**Last updated:** September 2026

---

## 1. Overview

AWIVEST is a women-led investment collective in Kenya. The Investor Portal is a secure, members-only web application where every investor can see their money, track goals, transact, and complete compliance, and where the office (Secretary, Admin, Chairlady) can onboard members, approve KYC, publish opportunities and statements, and report on the fund.

This PRD defines what the product must do, for whom, and to what standard. It is intentionally implementation-light; see `ARCHITECTURE.md` for how it is built.

### 1.1 Vision
> Give every AWIVEST member bank-grade visibility into their savings and returns, and give the office a single, auditable system of record — replacing spreadsheets and WhatsApp with one trusted portal.

### 1.2 Product principles
- **Trust first.** Every figure a member sees must reconcile to the compiled statement.
- **Least privilege.** Members see only their own data; staff powers are role-gated and enforced in the database, not just the UI.
- **Kenya-appropriate.** M-Pesa is a first-class payment rail; content and currency are KES-native.
- **Compliant by design.** Aligned to the Kenya Data Protection Act, 2019 (DPA).

---

## 2. Users & roles

| Role (DB enum) | Portal name | Who | Core powers |
|---|---|---|---|
| `member` | Investor | Any approved member | View own portfolio, statements, goals; pay in; e-sign; upload KYC; express interest in opportunities |
| `secretary` | Secretary | Committee officer | Review onboarding packs, KYC, documents, agreements; publish documents; run reports |
| `admin` | Admin | Operations lead | Everything Secretary can do + publish opportunities, manage members (exit/reinstate/remove), role management |
| `superadmin` | Chairlady | Dr. Agnes Odinga | Full administrative authority incl. role assignment and settings |

**Membership scale (as at Jul 2026):** 48 members total; 46 active; 2 exited (refunds processed).

---

## 3. Goals & non-goals

### 3.1 Goals (this phase)
1. Authenticated member portal with per-member financials reconciled to the compiled statement.
2. Self-service onboarding: details → KYC upload → e-sign → review → submit for approval.
3. Staff console for approvals, KYC review, documents, agreements, opportunities, member lifecycle, and reporting.
4. M-Pesa contributions and dividend visibility.
5. Fund distribution reporting from the 2018–Jul 2026 compiled statement.

### 3.2 Non-goals (this phase)
- Public marketing site (handled separately).
- In-app chat / messaging.
- Automated portfolio trading or robo-advice (planning tools are indicative only).
- Multi-currency (KES only for now).

---

## 4. Scope: live vs roadmap

**Live / in this build**
- Auth + role-based routing; member and staff shells
- Member dashboard, portfolio, financial profile (MSI), planning calculators, goal tracker
- Payments (M-Pesa STK flow), dividends, statements, opportunities (express interest)
- Online forms with draw-to-sign, KYC upload with progress, document centre, agreements
- Onboarding wizard
- Staff: approvals & member register, KYC review, documents, agreements, **opportunities (create/manage)**, **member exit/reinstate/remove (refund flow)**, reports & fund distribution, role management, settings

**Roadmap**
- Welfare module (contributions, claims, statements)
- Automated dividend declaration & disbursement
- Board/annual report generator
- SMS/email notification pipeline
- Member-to-office secure messaging

---

## 5. Functional requirements

### 5.1 Authentication & session
- FR-A1: Email/password auth via Supabase Auth; session persisted securely.
- FR-A2: Optional 2FA (TOTP/one-time token) — HMAC-signed tokens, time-boxed.
- FR-A3: On login, route by role: Investors → member dashboard; staff → staff console.
- FR-A4: Sign-out clears session; protected routes redirect unauthenticated users.

### 5.2 Onboarding
- FR-O1: Multi-step wizard — Personal details → KYC documents → E-signature → Review → Submit.
- FR-O2: Account types: Individual, Group (Chama), Corporate, Other — each with its own required-document checklist.
- FR-O3: Submission places the applicant in the staff approval queue; status = `pending`.
- FR-O4: Member cannot access full portal features until approved and KYC verified.

### 5.3 Member portal
- FR-M1: Dashboard shows current balance, contributions, interest, and growth trend; reconciles to statement.
- FR-M2: Portfolio breakdown by instrument/source (Contributions, Britam, Jubilee MMF, Jubilee FIF, pooled interest).
- FR-M3: Financial Profile (Money Strength Index / MSI) with indicative score and drivers.
- FR-M4: Planning Centre calculators (growth/retirement, target SIP, inflation) — indicative only.
- FR-M5: Goal Tracker — create/track goals with target, saved, deadline, priority.
- FR-M6: Payments — initiate M-Pesa STK push; see confirmation; history.
- FR-M7: Dividends — declared/paid history.
- FR-M8: Statements — downloadable statements; compiled statement breakdown by source.
- FR-M9: Opportunities — view published opportunities; **express interest** (recorded).
- FR-M10: Online Forms — complete + **draw-to-sign** signature pad + submit.
- FR-M11: KYC — upload required docs to a private bucket; see progress and status.
- FR-M12: Documents — access documents shared to all members or to the member specifically.
- FR-M13: Agreements — view PandaDoc agreement status.
- FR-M14: Profile, Notifications, Settings.

### 5.4 Staff console
- FR-S1: Approvals — queue of submitted packs; approve/reject with note; approval activates account + verifies KYC.
- FR-S2: Member register — searchable list with role, status, KYC; open member detail pack.
- FR-S3: KYC review — per-document approve/reject; verify activates account.
- FR-S4: Documents — publish statements/policies to all members or one member (private encrypted bucket).
- FR-S5: Agreements — send/re-send/refresh PandaDoc membership agreements.
- FR-S6: **Opportunities (Admin+)** — create, publish, and remove opportunities; see expressions of interest.
- FR-S7: **Member lifecycle (Admin+)** — mark member as **exited** (queues refund of current balance, sets exit date), **reinstate**, or **remove** (two-step confirm; audit trail retained). Exited/removed members drop out of active totals.
- FR-S8: Reports & fund distribution — collective KPIs, growth, money-distribution donut + breakdown table, exits summary; **CSV export**.
- FR-S9: Role management (Admin/Chairlady) — promote/demote roles; enforced in DB.
- FR-S10: Settings (Admin/Chairlady) — PandaDoc + M-Pesa credentials, general config.

### 5.5 Reporting & data
- FR-R1: Reports must be derived from the compiled statement (2018 – 30 Jul 2026):
  - Total fund **KES 119,939,314**; balance excl. exits **KES 105,865,370**.
  - Contributions **KES 83,202,428**; total interest **KES 37,157,396** (2018–2023 pooled 3,027,292; Britam 10,950,883; Jubilee MMF 17,883,723; Jubilee FIF 5,013,993; other 281,505).
  - Withdrawals (2 exits) **KES 14,073,944**.
- FR-R2: Every member statement must reconcile: contributions + interest by source = member total.

---

## 6. Non-functional requirements

- **NFR-Security:** Row-Level Security on all member data; UI role checks are secondary to DB policies. Secrets server-side only. Security headers, honeypot/CAPTCHA on public forms, signed webhook verification.
- **NFR-Privacy (DPA 2019):** Lawful basis + consent captured at onboarding; data minimisation; KYC in a private, access-controlled bucket; audit trail for staff actions; member right to access/erasure supported by the exit/remove flow (with retention for legal/audit).
- **NFR-Performance:** First meaningful paint < 2.5s on 3G-fast; dashboard data < 500ms server response at p95.
- **NFR-Availability:** Target 99.5% monthly (Vercel + Supabase managed infra).
- **NFR-Accessibility:** WCAG 2.1 AA target; keyboard-navigable; dark/light themes.
- **NFR-Auditability:** All staff mutations (approve, exit, remove, role change, publish) written to an audit log with actor, target, timestamp.
- **NFR-Localization:** KES currency, en-KE formatting; SMS/USSD-friendly copy where relevant.

---

## 7. Success metrics
- ≥ 90% of active members log in within 60 days of launch.
- 100% of member balances reconcile to the compiled statement (zero unexplained variances).
- Median onboarding completion < 15 minutes.
- ≥ 80% of contributions initiated via in-portal M-Pesa within 6 months.
- Zero member-data exposure incidents.

---

## 8. Milestones
1. **M1 — Core portal (live):** auth, member dashboard/statements, staff approvals/KYC, documents, agreements.
2. **M2 — Transactions & opportunities (current):** M-Pesa contributions, dividends, opportunities CRUD, member lifecycle, distribution reporting.
3. **M3 — Welfare & automation:** welfare module, automated dividends, notification pipeline.
4. **M4 — Governance:** board/annual report generator, advanced audit exports.

---

## 9. Risks & open questions
- **Data privacy on public code:** production member PII must never live in the repo; seed/demo data only (see `AGENTS.md`).
- **M-Pesa go-live:** requires Daraja production credentials + shortcode approval.
- **PandaDoc template governance:** who owns the master membership template and version changes?
- **Refund policy on exit:** confirm the exact refund calculation and approval chain for exited members.
- **Reconciliation source of truth:** the compiled workbook must be the single import into `member_finances`.

---
*Companion docs: `ARCHITECTURE.md`, `ARCHITECTURE-ESSENTIALS.md`, `AGENTS.md`. Interactive reference: `prototype/index.html`.*
