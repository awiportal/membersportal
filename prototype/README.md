# AWIVEST Investor Portal — High-fidelity clickable prototype

A single-file, self-contained HTML prototype of the AWIVEST Investor Portal, built to mirror the live Next.js + Supabase app's design system, roles, and information architecture. It is intended for **board walkthroughs, stakeholder review, and UX sign-off** — every screen is clickable, every role is explorable, and the core office workflows are functional, with no backend required.

## How to view

- **Locally:** open `prototype/index.html` in any modern browser (Chrome, Safari, Edge). Requires internet for the Google Fonts + Font Awesome CDNs.
- **Share/deploy:** it is a static file — host it on Vercel, GitHub Pages, or any static host.

## What it covers

**Sign in as any of the four roles** (from the login screen or the "View as" switcher in the top bar):

- **Investor (Member)** — Dashboard with the fund card, Investment Portfolio, Financial Profile (MSI), Planning Centre calculators, Goal Tracker, Payments (M-Pesa STK), Dividends, Statements, **Opportunities (Express interest — records interest live)**, Online Forms (working draw-to-sign pad), KYC Verification (per-account-type upload with progress), Document Centre, Agreements (PandaDoc), Welfare, Profile, Notifications, Settings (2FA).
- **Secretary** — Staff Console: Approvals & Members (queue + full register), member review pack (KYC approve/reject), Agreements, Documents, KYC review, Reports & distribution, Settings.
- **Admin** — everything the Secretary can do, plus **Opportunities management**, **member lifecycle (exit / reinstate / remove)**, and **Role management**.
- **Chairlady (Superadmin)** — top authority: full oversight, Reports, Opportunities, and Role management.

Plus the **new-member onboarding wizard** (details → KYC → e-sign → review → submit), reachable from the login screen.

## Functional (not just visual) in this build

- **Opportunities — full admin CRUD.** Admin/Chairlady can **add** an opportunity (title, provider, indicative return, minimum, risk) and **remove** one; it appears immediately on the member Opportunities page. Members click **Express interest** and the interest count updates live in the admin table.
- **Member lifecycle / exits.** From a member's detail pack, staff can **Mark as exited** (queues a refund of the current balance, stamps an exit date, shows a refund banner), **Reinstate**, or **Remove** (two-step confirm; the member drops out of active totals but is retained in the audit trail). Two members ship pre-marked as exited to mirror the compiled statement.
- **Reports & fund distribution.** Driven by the **real aggregate figures** from the compiled statement (2018 – Jul 2026): fund under management, balance excl. exits, contributions, interest; a money-distribution donut + breakdown table by source; an exits summary; and a working **Export CSV** download.

## Fidelity notes

- Design tokens (brand purple `#7e2674`, lime `#a6cd35`, glassmorphism, Inter, dark/light theme) match the production `globals.css`.
- Navigation, role labels, and Live/Preview markers follow the live app and the System Documentation.
- **Data & privacy:** collective/aggregate figures are **real** (total KES 119,939,314; excl-exits KES 105,865,370; contributions KES 83,202,428; interest KES 37,157,396; 48 members, 2 exits). **Per-member names are anonymized** (AWI-001…048) — this file is safe to keep in a public repo. A private full-data build (real names/balances) is delivered separately, never committed here.

## Status

Design artifact with working office workflows. It does not connect to Supabase, PandaDoc, or M-Pesa; external actions (e-sign, STK push, uploads) are simulated to demonstrate the flow, while opportunities, interest, exits, removals, and CSV export operate against the in-browser data layer for the length of the session.
