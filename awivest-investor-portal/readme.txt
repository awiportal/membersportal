=== AWIVEST Investor Portal ===
Contributors: awivest
Tags: investor, portal, kyc, membership, documents, mpesa, pandadoc
Requires at least: 5.8
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 2.11.7
License: GPLv2 or later

A secure, self-contained investor portal for AWIVEST covering registration with
unique Investor IDs, KYC, online forms with save-progress, e-signatures
(PandaDoc or internal), a secure document center, investment opportunities,
statements, M-Pesa contributions, dividend tracking, reporting, and an admin
dashboard.

== Description ==

This single plugin replaces a stack of membership/form/upload plugins. It adds
its own database tables, a dedicated "AWIVEST Investor" role, and protected file
storage outside public reach.

= Phase 1 - Core =
* Investor registration + auto-generated Investor ID (AWV-YYYY-0001)
* Login by email OR Investor ID; password reset via WordPress core
* Member dashboard: Investor ID, account status, KYC status, announcements
* KYC / document upload with drag-and-drop, validation (PDF, JPG, PNG, DOCX), size limit
* Secure document center with per-investor and global visibility
* Internal digital signature capture (draw with mouse/finger)
* Submission tracking (pending / approved / rejected + admin comments)
* Email notifications; admin portal; audit log

= Phase 2 - Forms & e-signing =
* Online forms with SAVE PROGRESS and submit: Investor Registration, KYC,
  Beneficiary, Risk Assessment, Compliance Declaration
* Admin review (approve / reject + comment) of submitted forms
* PandaDoc API integration for legally-binding e-signing, with REST webhook to
  capture signed status; automatic fallback to the internal signature module
* Document categories (general / statement / report / agreement)

= Phase 3 - Opportunities & reporting =
* Investment opportunities: admins publish, investors express interest
* Statements & Reports tab for investors (documents typed statement/report)
* Reports & analytics dashboard with CSV export (investors, submissions,
  payments, dividends)

= Phase 4 - Payments & dividends =
* M-Pesa (Safaricom Daraja) STK-push contributions with callback reconciliation
* Contribution history per investor
* Dividend tracking: admins declare/pay, investors view totals
* Analytics: contributions received, dividends paid, interest pipeline

= Welfare module =
* Welfare enrollment form (one record per member, admin-approved)
* Welfare claim form (many per member; each with approve / reject / mark-paid lifecycle)
* Exit form (member requests to leave; admin processes)
* Welfare statement: live summary (claims filed, claims paid) plus admin-published
  statement documents (Documents > type "welfare_statement")
* Dedicated admin Welfare page for enrollments, exits, and claim review

== Installation ==

1. In WordPress admin go to Plugins > Add New > Upload Plugin.
2. Choose awivest-investor-portal.zip and click Install Now, then Activate.
3. Activation auto-creates a page at /investor-portal/ containing [awivest_portal]
   and creates all database tables.
4. Go to AWIVEST > Settings to set the notification email, max upload size, and
   (optionally) PandaDoc and M-Pesa credentials.
5. Ensure your site uses HTTPS (free AutoSSL is available on GoDaddy cPanel).

== Configuration notes ==

PandaDoc: add API Key + Template ID in Settings. Set the webhook in PandaDoc to
  {site}/wp-json/awivest/v1/pandadoc-webhook?secret=YOUR_SECRET
M-Pesa: add Consumer Key/Secret, Shortcode, Passkey, and Environment in Settings.
  Set the Daraja STK callback URL to
  {site}/wp-json/awivest/v1/mpesa-callback
Both integrations stay dormant (with a friendly notice) until configured, so the
core portal works immediately without them.

== Frequently Asked Questions ==

= Where are uploaded files stored? =
In wp-content/uploads/awivest-secure/ with an .htaccess "Deny from all" rule.
Files are streamed only after a logged-in user passes ownership/visibility checks
via a nonce-protected download link.

= How do I completely remove all data? =
Add define( 'AWIVEST_REMOVE_DATA', true ); to wp-config.php before deleting.

== Changelog ==

= 2.11.7 =
Compatibility fix for the Financial Profile consent step. On some themes the "Start my Financial Profile" button appeared unresponsive: the theme hid the native consent tick-box, and because that box was a browser-"required" field - which cannot be focused when hidden - the browser silently refused to submit the form. This makes the consent step work on any theme.
* The consent tick-box is now forced to stay visible and tickable regardless of theme styling (appearance, size, visibility and click handling are restored).
* Consent is now confirmed on the server rather than relying on the browser's built-in "required" check, so the button always submits and, if the box was not ticked, a clear "Please tick the consent box" message is shown - it can no longer be blocked silently.
* The consent form, tick-box and button now carry stable IDs for reliable styling and targeting.
No database changes and no data migration are needed.

= 2.11.6 =
Member Success Index (MSI) - Phase 1, final step: admin analytics, a full data export and annual-review automation. This completes MSI Phase 1 - members now have the full guided Financial Profile, planning tools, scores, segments and recommendations, and administrators get an aggregate view of member financial health plus a yearly refresh reminder.
* Admin analytics - a new "Financial Profiles" page under the AWIVEST menu shows de-identified, aggregate insights across members' latest submitted profiles: headline averages (financial wellness, commitment/MCIS, total monthly investing capacity, average net worth), completion stats, and breakdowns by wellness band, risk profile, MCIS tier and both member segments.
* CSV export - one click downloads the full dataset (one row per member's latest profile) with all scores and every questionnaire answer, driven by the same question registry as the wizard, for offline analysis. Nonce-protected and limited to administrators; export responsibly under the Kenya Data Protection Act (2019).
* Annual-review automation - the daily background task now finds members whose profile is about a year old and emails them a friendly reminder to refresh it, so their scores, goals and recommendations stay current. Runs in small batches, reminds each member at most once per review cycle, and resets automatically when a member updates their profile. A new review_notified_at column tracks this (added automatically on upgrade - no data migration needed).

= 2.11.5 =
Member Success Index (MSI) - Phase 1, step 6: member segmentation, the Member Commitment & Investment Intent Score (MCIS), and a personalised recommendations engine. When a member finishes their Financial Profile they now see, alongside their Financial Wellness Score and risk profile, a commitment level and a tailored set of next steps.
* MCIS - a second score (0-100) that gauges how investment-ready and committed a member is, shown on a seven-tier ladder: Explorer, Starter, Builder, Committed, Investor, Champion and Strategic Partner. It is built from profile completeness, spare investing capacity, goals set and funded, time horizon and current investing activity.
* Member segments - each member is placed into a life-stage segment (Young Builder, Family Builder, Pre-Retiree or Retiree) and a financial-standing segment (Emerging Saver, Growing Saver, Wealth Builder or Established Investor) for future member analytics.
* Personalised recommendations - a short, prioritised list of plain-language next steps drawn from the member's whole profile: build an emergency fund, cut expensive debt, protect the family, set a goal, put spare capacity to work, diversify, or plan for retirement - including risk-appropriate, illustrative product ideas (money market, SACCO, unit trusts, bonds, equities, property). Clearly framed as guidance, not financial advice.
* MCIS, tier and both segments are saved with each yearly assessment (the score table already carried these columns), so progress can be tracked over time. No data migration is needed.

= 2.11.4 =
Member Success Index (MSI) - Phase 1, step 5: risk profile, investment preferences and expectations join the Financial Profile, and three more parts of the Financial Wellness Score switch on. The guided profile now includes a Risk Appetite step, an Investment Preferences step, a Time Horizon step and a Retirement step, plus an insurance question under Your Family.
* Investor risk profile - four short questions place each member on the AWIVEST scale (Conservative, Moderate, Balanced, Growth or Aggressive). The result appears on the results screen and is used to pre-fill the illustrative planning return in the member's goals and calculators, so the numbers reflect how they actually invest.
* Investment preferences - preferred sectors, the types of investments currently held, an ethical/socially-responsible preference, and how easily they want to access their money (multiple-choice questions with tick-the-box answers).
* Time horizon and return expectations - how long they plan to invest and the return they hope for, with a friendly reality-check against the AWIVEST assumptions on the results screen.
* Retirement - whether they have a pension/retirement plan, how much they have set aside, and a target retirement age.
* Three more Financial Wellness sub-scores now compute from the new answers: Diversification (how spread out their investments are), Retirement (having a plan and progress towards a salary-multiple target) and Insurance (breadth of cover). Any a member skips still redistribute fairly, exactly as before, and light up when they come back and answer.
* Tick-the-box (multi-select) questions are now supported throughout the questionnaire, and still work without JavaScript. No data migration is needed - the score tables already carried these columns.

= 2.11.3 =
Member Success Index (MSI) - Phase 1, step 4: standalone Planning Tools go live. A new "Planning Tools" tab gives approved members four friendly calculators to plan with - all using the AWIVEST planning assumptions and clearly labelled as illustrative estimates, not guaranteed returns or advice.
* Retirement calculator - projects your savings at retirement from your current pot and monthly contributions, works out the pot needed to fund the monthly income you want (adjusted for inflation and a conservative drawdown return), and tells you whether you are on track or the monthly amount to close the gap.
* Investment growth calculator - shows how a starting amount plus monthly investing could grow over a chosen number of years, including total contributed, growth earned, and the value in today's money after inflation.
* Goal / SIP calculator - works out the monthly investment needed to reach a target by a chosen date, given what you have saved so far.
* Inflation impact calculator - shows how much something will cost in future and how the buying power of cash shrinks over time.
* All calculators work entirely without JavaScript (reliable on any phone), store no data, and can be used any time - independent of the yearly Financial Profile. No data migration is needed.

= 2.11.2 =
Member Success Index (MSI) - Phase 1, step 3: the Goal Planner and Goal Tracker go live. Inside the Financial Profile, members now have a "My Goals" tab where they can add as many goals as they like - a home, a car, a business, children's education, retirement, travel, an emergency fund and more. Each goal shows, in plain language, how much is still needed, the monthly amount suggested to stay on track, its projected value by the target date, how far along it is, and an estimated chance of reaching it. A compact goal tracker also appears on the member dashboard.
* Unlimited goals with category, priority, target amount, current savings, monthly contribution and target date; edit or remove any goal at any time.
* Per-goal projections use the AWI-approved KES planning assumptions - future value of savings plus contributions, the suggested monthly amount to close the gap, on-track progress, and a completion-likelihood estimate. An optional per-goal expected return lets members model a more or less ambitious plan (illustrative only).
* New "My Profile / My Goals" sub-tabs inside the Financial Profile, and a "Goal tracker" summary on the dashboard showing top goals with progress bars.
* Goals are saved to your account and persist across yearly reviews, so progress can be tracked over time. Works without JavaScript. All figures are guidance, not guaranteed returns. No data migration is needed.

= 2.11.1 =
Member Success Index (MSI) - Phase 1, step 2: the Financial Profile questionnaire and Financial Wellness Score go live. After consenting, approved members now complete a friendly, guided profile - About You, Your Family, Your Income and Current Investments - one short step per screen with a progress bar and Back / Continue. Answers save as members go, so they can leave and return any time. On finishing, members see their Financial Wellness Score out of 100 (rated Excellent / Good / Average / Needs Improvement) with a breakdown of sub-scores, an estimate of their net worth and how much they could invest each month, and a few personalised quick wins.
* Guided profile wizard generated from the central question registry; works without JavaScript for reliable use on any phone.
* Financial Wellness Score with sub-scores for emergency fund, savings rate, debt, investing and income stability. Sub-scores that depend on questions coming in later updates (diversification, retirement, insurance) are shown as "not yet" and their weight is shared across the available ones, so the headline score stays fair and rises as more sections are added.
* Estimated net worth and monthly investment capacity, using the AWI-approved KES planning assumptions (illustrative only).
* Members can reopen and update their answers at any time, which recalculates the score.
* All planning figures are guidance, not guaranteed returns. No data migration is needed.

= 2.11.0 =
Member Success Index (MSI) - Phase 1 foundation. Begins the new Financial Profile: a friendly discovery, planning and goal-assessment system that members complete after approval and refresh once a year, so AWIVEST can see how members progress over time. This first release lays the groundwork the rest of the feature plugs into and is safe to install now (the member questionnaire itself is not exposed yet).
* New database tables for assessments (yearly snapshots), answers, goals and scores - including the Member Commitment & Investment Intent Score (MCIS) - created automatically on upgrade.
* A single "question registry" that will drive the wizard, scoring, CSV export and admin reports from one place.
* A "Complete your Financial Profile" card on the member dashboard plus a new "Financial Profile" tab, shown only to approved members so it never blocks activation.
* A member consent and privacy screen written to the Kenya Data Protection Act (2019): clear purpose, save-and-continue, and the right to skip, correct, download or delete.
* AWI-approved planning assumptions seeded and admin-editable (currency KES; illustrative annual returns Conservative 8%, Moderate 10%, Balanced 12%, Growth 15%, Aggressive 18%; inflation 6% - never presented as guaranteed).
* Groundwork for automation: a daily scheduler is registered now for the annual-review reminders added in a later update.
No data migration is needed and existing features are unchanged.

= 2.10.0 =
Brand colour and document viewing.
* Buttons across the member portal now use the AWIVEST brand colour (#B22C75) with clearly visible white text. This fixes buttons whose label only appeared on hover, including the Step 4 "Sign your forms" buttons and the download buttons in Submission Tracking.
* Every document now offers two actions. "View" opens the file in a new browser tab (images and PDFs display inline for a quick look) and "Download" saves a copy. This applies on the investor portal (submission tracking, documents and statements, and signed agreements) and on the admin member-detail page (uploaded KYC documents and signed agreement copies). For safety, only images and PDFs open inline; other file types always download.

= 2.9.0 =
Sign-up, onboarding and admin improvements.
* Investor ID is now issued only after an admin approves the membership. The registration email confirms the application has been received and is under review; the official Investor ID arrives with the approval email. Members see "Pending approval" in the portal until then.
* The document upload step now shows a green tick beside each uploaded document and a red cross beside those still outstanding, and confirms "uploaded successfully" after every upload.
* Sign-up and the verification email now remind members to check their spam/junk folder for the code, and outgoing mail carries a proper Reply-To address.
* Fixed "Export members to CSV" failing with "The link you followed has expired". Export now uses a secure form button, and if the security token ever expires it returns you to the Investors page with a clear prompt to try again instead of a dead-end error.
* Refreshed, more professional look for the member portal (cleaner cards, forms, buttons, tables and the document checklist).
Note on deliverability: emails going to spam is a domain/DNS matter, not a plugin bug. Set up authenticated SMTP plus SPF, DKIM and DMARC records for your domain so messages land in the inbox.

= 2.8.0 =
Reliability fix and simpler date of birth. Fixed a "critical error / cannot proceed" that could appear when saving personal details, uploading documents, or opening the signing page: if the active theme or another plugin prints a PHP notice early (for example WordPress 6.7's "translation loaded too early" notice with debug display switched on), the portal's page redirects could fail with "Cannot modify header information - headers already sent" and strand the member. All member-journey redirects (onboarding details, documents, review and submit, and the e-signing hand-off) now detect this and fall back to an automatic meta/JavaScript redirect plus a manual continue link, so members are never left on a blank or error page. Note: this is a server/theme condition, not something the plugin emits; on a live site debug display should be turned off. Also replaced the date-of-birth calendar picker with simple Day / Month / Year dropdowns that are easier for older members and remove all date-format confusion (the value is validated with checkdate and stored consistently).

= 2.7.0 =
Email verification at sign-up (one-time code). New members must now confirm a 6-digit code emailed to them before their account is created - this blocks bots and fake/mistyped email addresses at the very start of onboarding. Flow: a visitor fills the sign-up form, receives a code by email, and enters it on a verification screen; only then is the WordPress account and Investor ID created and the member signed in. The pending details are held securely for 15 minutes (the password is never stored in plain text), the code expires after 15 minutes, wrong entries are limited to 5 attempts, and a rate-limited "Resend code" option is provided. This works with your existing email setup - no extra configuration. (SMS/phone verification can be added next; it requires an SMS gateway such as Africa's Talking or Twilio with API keys.)

= 2.6.1 =
Fixes and hardening. (1) Fixed "Sorry, you are not allowed to access this page" when opening a member from the Submissions or Investors page - the per-member detail view now renders under the Investors page (which resolves the access-permission issue). All Review / View details links continue to work. (2) Reduced the chance of 503 errors during e-signing on shared hosting: the sign step now checks PandaDoc at most once every 30 seconds (instead of on every page load), and the PandaDoc request timeout was shortened so a slow response fails quickly and frees the server process instead of hanging. Note: 503 errors are produced by the web server (not the plugin) when the hosting account hits its resource limits or a security rule; if they persist on uploads or saves, check the hosting error log / mod_security and PHP limits with your host.

= 2.6.0 =
Better member data organisation and signed-document access. (1) Submissions page redesigned: instead of one row per uploaded file (overwhelming with many members), it now shows ONE row per member - Investor ID, name, each document with its type and status, an overall status, and a "Review" button. Built to stay tidy at 50+ members. (2) New per-member detail page (opened from the Review button, or the "View details" button on the Investors page): shows all of the member's onboarding personal details (ID/KRA/DOB, addresses, next of kin, beneficiary, nominee, statuses) together with every uploaded document, each with a view link and per-document Approve/Reject. (3) Members now see their own submitted details on their account: the Profile tab shows a read-only "My Registered Details" section plus their uploaded documents and statuses. (4) Signed agreements now appear for members: the onboarding agreement packet (previously tracked separately) is shown in the member's "My Agreements" tab, and both members and admins get a "Download signed copy" link that securely pulls the completed PDF from PandaDoc. No new required setup; no data migration needed.

= 2.5.0 =
Four improvements. (1) Anti-bot sign-up protection: registration now has a hidden honeypot field, a signed timing check (blocks instant/replayed submissions), and a per-IP hourly throttle - all automatic. You can also switch on a CAPTCHA (Cloudflare Turnstile or Google reCAPTCHA v2) under Settings > Human verification by entering a site key and secret key. (2) Guided document upload: the wizard now presents one required document at a time ("Document 1 of 3", etc.) and, after each upload, automatically advances to the next pending document and then on to signing. (3) Fixed "I have signed - refresh status": signing is now detected from the signer's completion (not only the overall document status, which lags right after signing), and the sign step auto-syncs when the member returns, so the packet is recognised as signed reliably. The message also now points to the webhook setting if completion is delayed. (4) Admin CSV export: the Investors page has an "Export members to CSV" button that downloads every member's full record - personal details, next of kin/beneficiary/nominee, status, onboarding stage, which documents are uploaded, signed status and dates. No database changes.

= 2.4.0 =
Combined member sign-up wizard (Agnes's redesign). New members now complete one guided flow instead of separate steps: (1) create account, (2) personal details - full name, ID/passport no., KRA PIN, date of birth, contacts, next of kin, beneficiary and nominee captured straight into the member record, (3) upload documents - passport photo, National ID/passport copy and KRA certificate (all three required), (4) sign all forms - one PandaDoc onboarding packet pre-filled from the typed data via merge tokens, (5) review & submit - saves one complete, signed KYC pack. A committee then Approves (account becomes active) or Returns the pack for corrections with a note, which reopens the wizard for the member to fix and resubmit. The Investors admin page shows a per-member onboarding checklist (details / docs / signed) and a "Return for corrections" action. The wizard replaces the old separate KYC tab and agreement-review step for new members. To auto-fill the packet, add merge tokens to your PandaDoc onboarding template: [Investor.FullName], [Investor.IDNumber], [Investor.KRAPIN], [Investor.DOB], [Investor.Phone], [Investor.Email], [Investor.PostalAddress], [Investor.PhysicalAddress], [Investor.NextOfKin], [Investor.NextOfKinPhone], [Investor.Beneficiary], [Investor.Nominee], [Investor.InvestorID], [Investor.Date]. Adds personal-detail, onboarding_stage and returned_reason columns to the investors table (applied automatically on upgrade).

= 2.3.1 =
Three member-facing fixes: (1) Password reset now works entirely inside the portal - the "Forgot password?" link opens an in-portal form that emails a secure reset link back to the portal (no more dead-end at wp-login.php). Members can request a reset by email or Investor ID and set a new password on a branded portal page. (2) The onboarding "Open & e-sign now" button and the "My Agreements" Sign now button now open the PandaDoc signing window in a new browser tab, so the member keeps their portal tab. (3) The Max Upload Size (MB) setting cap was raised from 64 to 1024, and the Settings field now shows your server's actual per-upload limit (PHP upload_max_filesize/post_max_size) so you know the real ceiling. No database changes.

= 2.3.0 =
Added a safer soft-delete: admins can now Archive a member from AWIVEST -> Investors instead of deleting them. Archiving hides the member from the active list and blocks their portal access, but keeps all their data; a "View archived" toggle lists archived members where you can Restore them (back to their previous status) or Delete permanently. Adds an investors.prev_status column. The permanent Delete (with full data removal) remains available.

= 2.2.9 =
Admin can now permanently delete an investor from AWIVEST -> Investors (Delete button per row). Deleting a member removes their submissions and all related data (KYC, documents, consents, agreements, form submissions, welfare, payments, dividends, interests), the files they uploaded, and their WordPress user account. Guarded: you cannot delete your own account or an administrator. Asks for confirmation first.

= 2.2.8 =
Admin now receives a full copy of submissions by email: online form submissions include every answer (with a link to Form Submissions), and KYC document submissions include the document type, file name, and a link to the Submissions review page. Sends to the notification admin email in Settings.

= 2.2.7 =
Added a "Signer Role Name" setting (Settings -> PandaDoc, default "Investor") so the PandaDoc signer role used when sending documents matches whatever your templates already use. Applies to both the onboarding packet and one-off agreements.

= 2.2.6 =
Fix: PandaDoc API errors are now shown as readable text (previously a structured error rendered as the word "Array"). When "Prepare & e-sign agreements" fails, the member/admin now sees PandaDoc's actual reason (e.g. template ID or signer role issue).

= 2.2.5 =
Onboarding agreements are now e-signed via PandaDoc as a single sign-once packet (no drawn signatures). Set an "Onboarding Packet Template ID" in Settings; approved members review the agreement documents, then e-sign the whole packet once (auto-sent, with an embedded "Open & e-sign now" option and a status refresh). Disagreeing still sets the account inactive and alerts an admin. Webhook completion unlocks full access. Adds consents.pandadoc_id column.

= 2.2.4 =
Onboarding agreements on approval, plus admin Document Edit/Delete actions, and a fix for the Agreements admin page 404.

= 2.2.3 =
PandaDoc e-signing completed: documents are auto-sent once drafted (with a background retry), a new Agreements admin page (Re-send / Refresh), and an in-portal "My Agreements" tab with embedded signing. No data changes.


= 2.2.2 =
Fix: corrected packaging error that produced invalid characters in the notifications file (site critical error). No feature changes from 2.2.1.


= 2.2.0 =
* Gated access: new members see only Dashboard, Profile and KYC until an admin
  approves them; all other tabs are blocked server-side. Pending dashboard note
  guides them to upload KYC. Approval emails the member that the account is active.
* Investors admin page now has explicit Approve / Reject / Deactivate / Reactivate.
* Online forms are now admin-managed (AWIVEST > Online Forms): create, edit, delete
  forms and fields without code; they render on the portal.
* Each form now captures a signature (draw or upload) before submit; the separate
  signature box was removed from the KYC page.

= 2.1.0 =
* Added the Welfare module: enrollment, claims (with per-claim review/payment),
  exit requests, welfare statement, and a dedicated admin Welfare page.

= 2.0.0 =
* Added Phase 2 (online forms + PandaDoc), Phase 3 (opportunities, statements,
  reporting + CSV export), and Phase 4 (M-Pesa, dividends, analytics).
* Added an upgrade routine that creates new tables on version bumps.

= 1.0.0 =
* Initial Phase 1 MVP release.
