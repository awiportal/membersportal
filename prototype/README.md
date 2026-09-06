# AWIVEST Investor Portal — High-fidelity clickable prototype

A single-file, self-contained HTML prototype of the AWIVEST Investor Portal, built to mirror the live Next.js + Supabase app's design system, roles, and information architecture. It is intended for **board walkthroughs, stakeholder review, and UX sign-off** — every screen is clickable and every role is explorable, with no backend required.

## How to view

- **Locally:** open `prototype/index.html` in any modern browser (Chrome, Safari, Edge). Requires internet for the Google Fonts + Font Awesome CDNs.
- **Share/deploy:** it is a static file — host it on Vercel, GitHub Pages, or any static host.

## What it covers

**Sign in as any of the four roles** (from the login screen or the "View as" switcher in the top bar):

- **Investor (Member)** — Dashboard with the real "Your AWIVEST fund" card (opening / 2026 contributions / current balance), Investment Portfolio, Financial Profile (MSI) results, Planning Centre calculators, Goal Tracker, Payments (M-Pesa STK), Dividends, Statements, Opportunities, Online Forms (with a working signature pad), KYC Verification (per-account-type upload with progress), Document Centre, Agreements (PandaDoc), Welfare, Profile, Notifications, Settings (2FA).
- **Secretary** — Staff Console: Approvals & Members (queue + full register), member review pack (KYC approve/reject), Agreements, Documents, KYC review, Settings.
- **Admin** — everything the Secretary can do, plus **Role management**.
- **Chairlady (Superadmin)** — top authority: full oversight, Reports, and Role management.

Plus the **new-member onboarding wizard** (details → KYC → e-sign → review → submit), reachable from the login screen.

## Fidelity notes

- Design tokens (brand purple `#7e2674`, lime `#a6cd35`, glassmorphism, Inter, dark/light theme) match the production `globals.css`.
- Navigation, role labels, and the Live vs Preview markers follow the live app and the System Documentation (Aug 2026).
- Data is illustrative and lives entirely in the browser — 48 members (AWI-001…048) and the reconciled fund totals (opening KES 106,396,145 + 2026 contributions KES 7,027,118 = current KES 113,423,263).

## Status

Prototype / design artifact only. It does not connect to Supabase, PandaDoc, or M-Pesa; interactive actions (approve, upload, e-sign, STK push) are simulated to demonstrate the flow.
