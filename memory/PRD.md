# MAK FIN PAY — Product Requirements & Status

## Original Problem Statement
A scalable, secure, multi-role (Admin / Distributor / Agent) fintech web application for wallet management and utility bill payments. Agents collect cash from customers and perform digital utility bill payments using pre-funded wallet balances.

## Core Roles & Hierarchy
- **Admin (Super)** — platform owner. Sets default commission. Approves recharges, marks bill-payments success or reverses with refund. Creates distributors / agents. Manages QR codes, KYC, audit.
- **Distributor** — onboards agents, earns markup on top of the base (admin-set) commission, can withdraw earnings.
- **Agent** — submits recharge requests, performs bill payments out of pre-funded wallet, KYC, withdraw.

## Implemented Features
- JWT auth (email + password) for all 3 roles, change-password flow with field-level validation.
- Hierarchical user creation (`POST /admin/users`, `POST /distributor/agents`).
- Immutable wallet ledger; never negative balances.
- Recharge approval workflow: QR + payment proof + UTR + last-4 + admin approve/reject.
- Bill-payment flow with tiered service charges, admin approve/reverse with wallet refund.
- Withdrawal flow (request → approve → debit ledger).
- Commission system: `base` (distributor's allocation) + `markup` (distributor's profit) = `total`. Admin-changed defaults atomically cascade to all default-mode distributors/agents.
- Comprehensive admin dashboards: financial KPIs filtered by Today/Yesterday/Last7/Last30/Lifetime/Custom; revenue split between admin and distributor earnings (invariant `total_revenue == admin_revenue + distributor_earnings`).
- Search/Filter bars on Admin Recharges + Transactions (status pills, date pills, agent filter, bank/QR filter, custom range, pagination, clear-all).
- Distributor list shows Earnings + clickable detail modal listing nested agents.
- KYC review, audit logs, QR code management.

## CHANGELOG
- **Feb 2026 — MAJOR: Master Distributor role (4-tier hierarchy: Admin → MD → Distributor → Agent):**
  - New role `master_distributor` added to auth + models. Admin creates MDs with a commission % (their default becomes admin's cut for the whole MD downline). MD creates distributors + direct agents; distributor-under-MD creates agents that inherit the MD chain automatically.
  - 3-way immutable recharge snapshot: `admin_revenue_amount + md_earnings_amount + distributor_earnings_amount == total_commission_amount` — invariant verified on approval and in every date-range aggregate. Historical records untouched (missing md fields treated as 0).
  - Cascade helpers: `cascade_md_downstream(md_id, new_md_pct)` refreshes every distributor + agent under an MD when the admin edits the MD's rate or the platform default changes. `cascade_distributor_agents` extended to preserve admin_pct + md_pct on agents.
  - New endpoints: `/api/master-distributor/users` (POST create dist/direct-agent), `/distributors`, `/agents`, `/recharges`, `/stats`, `/users/{uid}/markup` (PATCH), `/users/{uid}/freeze` (PATCH), and admin's `/api/admin/master-distributors/{uid}/downline` returning tri-section {distributors, direct_agents, distributor_agents}. `/api/admin/exports/master_distributor.pdf` streams landscape PDF.
  - MD earnings pipeline: `_md_lifetime_earnings` + `_md_earnings_for` + `_md_earnings_batch` + `get_md_available_for_withdrawal` mirror the distributor earnings model (lifetime − approved − pending; never negative). MD withdrawals plug into the existing withdrawal flow: bank-completeness gate applies, admin approve deducts on approval, reject leaves earnings intact.
  - Admin panel: new **Master Distributors** sidebar item (list + create + view detail + PDF export), Distributors table gains a **Created By** column (MD name or Admin), Commission page gains a **Master Distributor Commissions** section (default/custom + cascade), Withdrawals role-filter dropdown adds "Master Distributors", Overview shows 3-way revenue split card + "Total MD Earnings" card + Master Distributor Withdrawals sub-line + Master Distributors platform stat.
  - MD panel (new `/md` route tree): Overview (5 KPIs incl. Total Earnings), My Distributors (create + markup edit), My Agents (direct + via distributors + create direct-agent with KYC), Recharge Activity (read-only downline), Withdrawal (Available Earnings, Bank Details, request), Change Password.
  - Access control: MD cannot approve recharges/withdrawals/KYC, cannot edit QR codes, cannot access commission settings, backups, audit logs, or erase-reset. Full 403 coverage verified across 6 admin endpoints.
  - Tests: 37/37 pytest in `/app/backend/tests/test_master_distributor.py` PASS covering all 26 acceptance items. Full Playwright frontend sweep PASS.
  - Seed data left on preview: `mdtest@x.com` (1 distributor `disty@x.com` + 1 chain agent `agentz@x.com`, one ₹1,00,000 approved recharge with the exact spec math snapshot).

- **Feb 2026 — Server-side pagination + filters on ALL Admin table pages (P0 completion):**
  - Backend: `GET /api/admin/recharges`, `/admin/transactions`, `/admin/withdrawals`, `/admin/audit-logs`, `/admin/users` all accept `?paginated=true` + a full filter suite and return `{items, total, page, page_size}`. Legacy (no `paginated` flag) callers still get a plain array — internal dashboard KPI paths unbroken.
  - Filter params pushed server-side: `status`, `agent_id`, `qr_code_id`, `operator`, `role_filter`, `from_ts`, `to_ts`, `q` (case-insensitive regex across user_name/utr/card_last4 for recharges; user_name/customer_name/customer_phone/operator/card_last4 for transactions; user_name + all bank fields for withdrawals; action/target/ip for audit; full_name/email/phone for users). Query builders isolated in `_build_recharge_query` / `_build_transaction_query` / `_build_withdrawal_query` / `_build_audit_query` + shared `_add_created_at_range` helper.
  - Indexes added: `(user_id, created_at)`, `(status, created_at)`, `(role, created_at)`, `(operator, created_at)`, `(qr_code_id, created_at)`, `(action, created_at)`, and `(role, is_deleted, created_at)` on users — keeps pagination + filter fast at six-figure row counts.
  - Data-permanence guarantee verified: pymongo `list_indexes` across 9 operational collections (recharges/transactions/withdrawals/audit_logs/users/wallets/ledger/bank_details/kyc) shows zero `expireAfterSeconds`. No TTL, no capped collections, no cleanup jobs on operational data. The only auto-cleanup remains the backup-snapshot retention setting, scoped strictly to `db.backups` / GridFS bucket.
  - Frontend: `Recharges.jsx`, `Transactions.jsx`, `Withdrawals.jsx`, `Audit.jsx` full rewrites + `_UserList.jsx` (Distributors + Agents) extended with search + pagination. Each page: 350ms debounced search, `page` resets to 1 on ANY filter change, page-size selector (25/50/100, default 50) wired into shared `DataTable`'s `pagination` prop. Withdrawals gained a Role filter dropdown + Date pills + Search. Audit gained Search + Date pills.
  - `PaginationBar` (Shared.jsx) already implemented: real total ("Showing 51–100 of 48,213 records"), First/Prev/Page-indicator/Next/Last, `min-w-[72px]` on the size select so values aren't clipped. Testids: `pagination-bar`, `pagination-total`, `pagination-page-size`, `pagination-first/prev/next/last`, `pagination-indicator`.
  - New utilities: `lib/hooks.js#useDebounced`, `lib/filters.js#rangeWindowIso` (returns `{from_ts, to_ts}` ISO strings for server params).
  - Approve/reject/reverse action IDs unchanged — no regression to existing workflows.
  - Tests: 29/29 pytest in `test_pagination_filters.py` PASS — pagination shape, legacy array preservation, filter combos, page 1 vs page 2 disjoint ids, TTL-absence sanity, auth guards. Full Playwright UI sweep across all admin table pages PASS.

- **Feb 2026 — Admin Overview: 'Total Distributor Earnings' card:**
  - `GET /api/admin/stats/financial` now returns `total_distributor_earnings` = SUM of every non-soft-deleted distributor's live earnings balance via the existing `_distributor_earnings_batch` single-source-of-truth helper. Value is INVARIANT to date-filter toggles (same lifetime-live behaviour as Total Wallet Balance).
  - Includes all distributors regardless of status (Approved / Frozen / Rejected), excludes only soft-deleted (`is_deleted:false`).
  - Frontend: new Kpi card 'Total Distributor Earnings' with hint 'All time • Live balance', data-testid=`kpi-total-distributor-earnings`, placed immediately after 'Total Wallet Balance'. Shared `Kpi` component extended to forward a `data-testid` prop.
  - Tests: 14/14 pytest in `test_total_distributor_earnings.py` PASS + 8/8 Playwright UI (grid position, invariance across every date-filter toggle incl. custom 1900 window, visual parity with Total Wallet Balance).

- **Feb 2026 — Admin Overview: 'Withdrawals' Financial Overview card:**
  - `GET /api/admin/stats/financial` now returns `total_withdrawals_approved`, `agent_withdrawals_approved`, `distributor_withdrawals_approved`. Filter uses withdrawal's approval date (`reviewed_at`), matching the recharge_approved convention. Single `$group by role` aggregation guarantees agent + distributor == total.
  - Frontend: new KPI card in the Financial Overview grid (data-testid=kpi-withdrawals), positioned after 'Bill Payments'. Same visual style as the 'Total Revenue' card — dark-green mfp-kpi wrapper, ₹ amount in #CC5500 accent 3xl, two sub-lines with right-aligned amounts. Responds to the same Today/Yesterday/Last-7/Last-30/Lifetime/Custom filter toggles. Grid switched to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` so 6 cards wrap into 2 rows of 3.
  - Only APPROVED withdrawals counted; pending/rejected excluded.
  - Tests: 12/12 pytest in `test_withdrawals_financial_stats.py` PASS + full Playwright UI parity + math-integrity assertions + iteration_16 legacy-bank regression spot-check.

- **Feb 2026 — Withdrawal now requires ALL bank fields complete (legacy users too):**
  - Root cause: pre-fix `POST /api/withdrawals` only checked `if not bank` — a legacy record from before the phone_number field was added still passed the gate.
  - Fix: `REQUIRED_BANK_FIELDS` tuple + `_bank_missing_fields(bank)` helper. Applied in `POST /api/withdrawals` (HTTP 400 with the unified spec message) and exposed via `GET /api/bank` as `is_complete` + `missing_fields` (list of snake_case field names) so the frontend can gate the Submit button precisely.
  - `POST /api/bank` now hardens: every field must be non-empty after trimming; per-field 400 error strings ('Account Holder is required' etc.). Phone-format check (10 digits, optional +91/91 prefix normalisation) unchanged.
  - Frontend: `bankStatus.is_complete` gates the Submit button. Warning banner names the exact missing fields ('...Please fill in Phone Number...'). BankDetailsCard shows a rose 'MISSING' badge + rose border on each missing field, and the Save button is disabled until every field is filled client-side.
  - Legacy data safety: raw stored fields untouched by GET; users must enter their real phone number themselves. No retroactive rewriting.
  - Tests: 16/16 pytest in `test_bank_complete_validation.py` PASS + iteration_15 regression (11/11) PASS + Playwright UI tour of legacy/nobank/complete scenarios all PASS (iteration_16).

- **Feb 2026 — Bank Details relocated + Phone field added + Admin table expanded:**
  - **Bank Details form** moved from the standalone sidebar page into the RIGHT column of the Withdrawal page for both Agent and Distributor. Two-column layout `grid lg:grid-cols-2` — stacks on mobile. Reusable `BankDetailsCard` component.
  - **Sidebar cleanup** — 'Bank Details' menu item removed from both agent + distributor sidebars. Standalone `/agent/bank` and `/distributor/bank` routes and their page files deleted.
  - **New field: Phone Number** (required, 10 digits, digits-only). Server-side normalisation accepts optional `+91` or `91` prefix and strips it. Rejects any length ≠ 10 with `Phone Number must be exactly 10 digits`.
  - **Withdrawal-cannot-be-requested-without-bank UX** — inline amber warning banner + disabled Submit button until bank details are on file.
  - **Admin Withdrawals table** — each bank field is now its own column: Requester, Role, Amount, Account Holder, Account Number, IFSC, Bank Name, Phone, Status, Requested, Action. Uses the existing `DataTable` `overflow-x-auto` wrapper. Missing legacy fields fall back to `—` (no crash on pre-change rows).
  - **Immutable snapshot** — bank dict already snapshotted onto every withdrawal at submission time (unchanged behaviour); the new phone_number just flows through automatically. Historical accuracy preserved: editing bank later does NOT rewrite past requests.
  - Tests: 11/11 pytest in `test_bank_phone_withdrawal.py` PASS (iteration_15) — incl. valid 10-digit save, +91/91 prefix normalisation, 5 invalid-input rejection cases, historical-snapshot invariant after bank edit, `no bank → 400` regression, distributor bank + withdrawal flow. Frontend UI 100% pass — sidebar cleanup, two-column layout, phone validation UX, warning banner, admin columns + horizontal scroll all verified.

- **Feb 2026 — PDF export glyph + header-color fix:**
  - Bundled DejaVu Sans (regular + bold) TTFs under `/app/backend/fonts/`. Both include U+20B9 so the Indian Rupee ₹ renders as a real glyph instead of a tofu square.
  - All text in the report (title, subtitle, meta, table header, table body, footer) now uses DejaVu Sans / DejaVu Sans Bold. Idempotent registration via `pdfmetrics.getRegisteredFontNames()` guard.
  - Header cells now use a dedicated `cell_bold_white` Paragraph style (`textColor=colors.white`) so header text renders WHITE on the dark green background — fixes the black-on-green readability bug (Paragraph textColor was previously overriding the TableStyle TEXTCOLOR=white).
  - Currency strings use explicit `\u20B9` codepoint. Rest of the PDF (layout, columns, filename, endpoint, live data source, auth, click-guard) unchanged.
  - Tests: 25/25 pytest in `test_pdf_exports.py` PASS (iteration_14) — incl. rupee-glyph presence literal assertion, no-tofu/no-replacement-char assertion, WHITE header via content-stream `1 1 1 rg` operator inspection, bundled-font existence + fontTools cmap check, idempotent registration (3 consecutive requests), and iteration_13 regressions.

- **Feb 2026 — Admin PDF export (Distributors + Agents):**
  - New backend endpoint `GET /api/admin/exports/{role}.pdf` (role ∈ {distributor, agent}) — super-admin gated. Streams a branded landscape A4 PDF (MAK FIN PAY dark-green header + striped table + IST generated timestamp + total count + footer). Filename: `MAK_FIN_PAY_{Distributors|Agents}_YYYY-MM-DD.pdf`.
  - Uses the SAME live data source as the on-screen table (`_distributor_earnings_batch`, `_wallet_balances_for`, `_build_parent_name_map`) — numbers cannot drift.
  - Rendered by reportlab (Platypus SimpleDocTemplate + Table) inside a threadpool via `starlette.concurrency.run_in_threadpool` so the FastAPI event loop stays responsive.
  - Frontend: Outline-style "Export PDF" button (with FileDown icon) added to the LEFT of the primary "+ New" button on both `/admin/distributors` and `/admin/agents`. Click-guard with Loader2 spinner + "Preparing PDF…" label + disabled state + 800ms cool-down. Success/error toasts.
  - Dependency: `reportlab==5.0.0` pinned in `backend/requirements.txt`.
  - Tests: 10/10 pytest in `test_pdf_exports.py` PASS — valid PDF bytes, content assertion via pypdf, auth guards (401/403), path validation, realistic rapid-click dedup, and iteration_12 backup regression re-check.

- **Feb 2026 — Backup & Restore async + streaming rewrite (production-scale fix):**
  - Fixes Cloudflare "could not parse response" timeout on large datasets. Backup creation is now HTTP 202 + background asyncio task — never blocks the HTTP request.
  - **Streaming v3 format:** NDJSON (one JSON record per line), gzipped in ~1MB plaintext blocks, each block written directly to the Motor GridFS upload stream. Concatenated gzip members per RFC 1952. Peak RAM bounded by one block + one file's bytes.
  - **Cursor-batched collections + one-file-at-a-time:** `_run_backup_job` iterates each collection via `find().batch_size(500)` async cursor, emitting `{"t":"doc","c":<coll>,"d":<bson.json_util doc>}` per line. Files emitted as `{"t":"file","p":...,"sz":...,"b":<base64>}`. Manifest is the final line.
  - **Streaming restore:** `_restore_v3_stream` decompresses through a temp file, parses line-by-line, batches `insert_many` per 500 docs, re-uploads files via `put_object`. Pre-populates `restored_counts[name]=0` for every expected collection AND calls `delete_many({})` on expected-zero collections so restored state matches the snapshot exactly.
  - **v2 backwards compatibility:** Format auto-detected via first 64 bytes; old v2 backups restore via `_restore_v2_blob`.
  - **Async restore:** `POST /api/admin/backups/{id}/restore` returns HTTP 202 + spawns `_run_restore_job`. Safety backup runs through the same streaming pipeline (awaited inline). `restore_status` / `restore_error` / `restore_safety_backup_id` / `restore_result` tracked on the backup record.
  - **Status guards:** Download / Restore / Delete all return HTTP 409 if `status != 'completed'` or any in-progress flag set. Download streams via Starlette `StreamingResponse` iterating GridFS chunks.
  - **Daily APScheduler job** uses the SAME `_run_backup_job` awaited inline — single backup writer invariant preserved.
  - **Frontend:** `Backups.jsx` polls `/api/admin/backups` every 4s while any row is in-progress. Status badges (`In progress` / `Completed` / `Failed` / `Restoring…` / `Restore failed`) with Loader2 spinner. Action buttons (Download / Restore / Delete) visibly disabled while not completed. "Create Snapshot" button has click-guard + cool-down.
  - Tests: 11/11 pytest in `test_backup_restore_v3.py` PASS (iteration_12) — incl. SHA256 byte-equivalence round-trip under async pipeline, HTTP 202 < 500ms, NDJSON v3 format invariant, restore status tracking, tampered-bundle partial-restore detection, in-progress 409 guards (download + restore + delete).

- **Feb 2026 — Backup & Restore data-integrity fix (CRITICAL):**
  - **Dynamic collection enumeration:** Backups now call `db.list_collection_names()` and exclude only the backup-system collections (`backups`, `backup_settings`, `backups_fs.files`, `backups_fs.chunks`) and Mongo `system.*` collections. Any new collection added in the future is captured automatically — verified empirically by the test suite injecting a brand-new collection BEFORE backup and confirming it appears in the manifest with zero code change.
  - **Uploaded file binaries captured:** For every record in the `files` collection, the backup pipeline calls `get_object(storage_path)` to fetch the actual binary from Emergent Object Storage and base64-encodes it into `payload["files"]`. Restore re-uploads each binary via `put_object(...)` so document → file references resolve byte-for-byte. SHA256 round-trip verified.
  - **BSON-safe serialization:** Bundle uses `bson.json_util` to preserve ObjectId / datetime / Binary / nested types.
  - **Manifest + verification:** Bundle (`version: 2`) carries `manifest.collection_doc_counts`, `total_documents`, `file_count`, `file_total_bytes`. Restore counts every restored doc + file and compares against the manifest. Any mismatch → HTTP 409 with detailed mismatch info AND the `safety_backup_id` so the admin can roll back. Silent partial-restore eliminated.
  - **Safety backup uses same path:** Pre-restore safety backups go through `_create_backup` → `_dump_db_to_gz_bytes` (single backup writer). Equally complete. Manual + Automatic daily + Safety = one implementation.
  - **Backups themselves preserved during restore:** `BACKUP_EXCLUDED_COLLECTIONS` set protects the `backups` metadata collection from being wiped during restore — pre-existing backups stay intact across any number of restores.
  - **Frontend:** Success toast now reads "Restore complete — all data and files verified (N file(s))".
  - Tests: 8/8 pytest in `test_backup_restore.py` PASS — including dynamic enumeration future-proof check, file binary capture, SHA256 byte-equivalence round-trip on a real PNG, tampered-manifest partial-restore detection, safety backup integrity, single-backup-writer invariant.

- **Feb 2026 — Double-submission bug fix (recharge + withdrawals + bill-pay):**
  - Frontend click-guard pattern applied to 4 submit buttons: Agent Recharge (`recharge-submit`), Agent Withdrawal + Distributor Withdrawal (shared `withdraw-submit`), Agent Bill Payment (`bill-submit`). Pattern: `isSubmitting`/`busy` state + early-return guard + disabled attribute + disabled inputs + Loader2 spinner + "Submitting…"/"Processing…" label + 1.5s success cool-down + immediate error reset.
  - Backend idempotency guard on `POST /api/agent/recharges`: query existing pending/approved recharge with same (user_id, utr) → 409 with detail "This UTR has already been submitted. If you believe this is an error, please contact the admin." DuplicateKeyError caught as race-condition safety net. Rejected previous recharges do NOT block re-submission.
  - Partial unique index `(user_id, utr) where status in ('pending','approved')` added on `db.recharges`. Index creation wrapped in try/except so legacy duplicate UTRs from prior seed data do NOT fail startup; app-level check is the primary defense regardless.
  - Forward-only — existing duplicate records in DB untouched.
  - Tests: 9/9 pytest (`test_recharge_idempotency.py` new — incl. asyncio.gather parallel-POST race test confirms exactly 1 × 200 + 1 × 409) + Playwright rapid-click verified on all 4 buttons.

- **Feb 2026 — Agent Recharge validation rules (forward-only):**
  - Max recharge amount per request capped at ₹3,00,000 (boundary inclusive).
  - UTR / Reference must be exactly 12 numeric digits. Leading/trailing whitespace trimmed; embedded non-digits rejected.
  - Both rules enforced on backend (`POST /api/agent/recharges`) and frontend (`pages/agent/Recharge.jsx` — inline red errors, disabled submit button with opacity-50/cursor-not-allowed, paste-safe digit strip on UTR input).
  - Exact error strings: "Amount must be greater than 0" / "Maximum recharge amount is ₹3,00,000" / "UTR / Reference is required" / "UTR must contain only digits" / "UTR must be exactly 12 digits".
  - Historical recharge records untouched (no retroactive validation). Recharge approval flow + commission snapshot + ledger entry + wallet credit unchanged.
  - Tests: 15/15 pytest (`test_agent_recharge_validation.py` new) + full Playwright UX verification incl. amount edge cases (1, 300000, 300001, 0, -100), UTR edge cases (empty, whitespace, 11/13 digits, alphanumeric, spaces, valid 12-digit, trimmed), submit-button gate, and end-to-end ₹50,000 submission + admin approval regression.

- **Feb 2026 — SEO foundation (preview):**
  - Added real plain-text `public/robots.txt` (disallows /admin, /distributor, /agent; references sitemap).
  - Added `public/sitemap.xml` listing the two public routes (/, /login).
  - Added `public/llms.txt` summary for AI crawlers.
  - `public/index.html` now declares `<link rel="canonical">`, `og:url`, `og:type` pointing to non-www makfinpay.com.
  - `components/PageTitle.jsx` extended to manage `<meta name="description">`, `<link rel="canonical">`, `og:title/description/url` per route (unique copy for / and /login; default for authenticated routes).
  - Support ticket filed with Emergent for the www → non-www 301 edge redirect (out-of-band domain-layer config).

- **Feb 2026 — Credit Card Bill Payment tier boundary update (forward-only):**
  - Tier breakpoint moved from ₹25,000 → ₹50,000. New table: ₹0–₹50,000 → ₹15 ; ₹50,001–₹1,00,000 → ₹25 ; >₹1,00,000 blocked. ₹15/₹25 amounts and ₹1,00,000 hard max unchanged.
  - Boundary is inclusive on the low tier (₹50,000 = ₹15).
  - Single source of truth: backend `server.py` bill-payment endpoint + frontend `lib/billing.js#calcServiceCharge`. Tier table in `pages/agent/BillPay.jsx` updated to the two new rows.
  - Historical transactions remain frozen (no retroactive recalculation).
  - Tests: 13/13 pytest (`test_billpay_tier_boundary.py` new) + full Playwright boundary suite at 1, 24999, 25000, 25001, 49999, 50000, 50001, 75000, 99999, 100000, 100001.

- **Feb 2026 — Distributor Withdrawal regression fix (P0):**
  - `POST /api/withdrawals` now branches by role. Agents continue to validate against `wallets.balance`. Distributors validate against `get_distributor_available_for_withdrawal(dist_id) = lifetime_earnings − approved_withdrawals − pending_withdrawals` (no wallet, no ledger entry).
  - `POST /api/admin/withdrawals/{wid}/approve` re-verifies live earnings (`lifetime − approved`) at approval time for distributors; skips wallet ledger entry. Agent flow unchanged.
  - `POST /api/admin/withdrawals/{wid}/reject` skips wallet refund for distributors (no wallet was debited); pending reservation naturally releases.
  - `_distributor_earnings_for` and `_distributor_earnings_batch` now return LIVE balance = `lifetime − approved withdrawals`. All four UI render points (Distributor Overview KPI, Withdrawal page chip, Admin Distributors table, Admin View modal) read from these helpers → perfectly in sync.
  - `/api/distributor/stats` exposes new `available_for_withdrawal` field for the Withdrawal page chip.
  - Frontend `_Withdrawal.jsx` displays "Available Earnings" for distributors / "Available Wallet Balance" for agents (role-aware via `useAuth`).
  - Tests: 14/14 pytest (`test_distributor_withdrawal_bug.py` new) + 9/9 Playwright UI assertions. Agent regression confirmed: wallet flow unchanged.

- **Feb 2026 — Commission / Earnings immutability fix (CRITICAL financial correctness):**
  - Each approved recharge now permanently snapshots: `gross_amount`, `commission_percent_used`, `admin_commission_percent`, `distributor_markup_percent`, `total_commission_amount`, `admin_revenue_amount`, `distributor_earnings_amount`, `net_credit_amount`, `agent_id`, `distributor_id`. These ₹ values are never recalculated.
  - All read paths rewritten to SUM the immutable snapshots instead of recomputing from current commission %:
    - `_distributor_earnings_for(dist_id)` → MongoDB aggregation on `distributor_earnings_amount`.
    - `_recharge_revenue_breakdown()` → aggregation on `admin_revenue_amount`, `distributor_earnings_amount`, `total_commission_amount`.
    - `/api/distributor/stats` → uses `_distributor_earnings_for`.
  - Startup migration `_migrate_recharge_revenue_snapshot` backfills the snapshot columns on any pre-existing approved recharge (uses current agent base/markup ratio as estimate, marked `estimated: true`).
  - Verified full scenario from spec end-to-end:
    - R1 (1.0% total) on ₹100k → admin ₹500, dist ₹500 ✅
    - Admin changes Aman 0.5→0.75% → R1 split UNCHANGED ✅
    - R2 (1.25% total) → admin +₹750, dist +₹500 → cumulative admin ₹1250, dist ₹1000 ✅
    - Aman raises agent markup 0.5→0.75 → past totals UNCHANGED ✅
  - Invariant `admin_revenue + distributor_earnings == total_revenue` holds exactly via storage-level subtraction.

- **Feb 2026 — Danger Zone: in-app Reset Demo Data:**
  - New backend endpoint `POST /api/admin/system/reset-demo-data` (super-admin gated by `ADMIN_EMAIL` env; mandatory body `{confirm: "RESET"}`). Wipes users (non-admin), wallets (non-admin), ledger, transactions, recharges, withdrawals, kyc, bank_details, audit_logs, notifications, fraud_flags, non-QR files. Preserves admin + commission + QR codes (also un-soft-deletes all QRs). Writes `demo_data_reset` audit entry.
  - New frontend `DangerZone.jsx` component rendered at the bottom of Admin Overview, **only when** `user.email === makfinpay@gmail.com`. Red button → modal with kept-items list + typed-confirmation input. Confirm disabled until input exactly equals `"RESET"`. After success → 3s auto-redirect to `/admin` + window reload.
  - Works on any environment the backend is pointed at (preview today, production once redeployed).
  - Tests: 5/5 pytest (`test_reset_demo_data.py` new) + 12/12 Playwright UI assertions.

- **Feb 2026 — KYC system overhaul (P0 feature):**
  - Removed agent self-KYC page; `/agent/kyc` route + sidebar entry + `pages/agent/Kyc.jsx` file deleted; `/api/kyc` & `/api/kyc/mine` endpoints removed.
  - Admin & Distributor agent-creation forms now require Aadhaar + PAN **file uploads** (was text inputs). Backend `create_subuser` rejects agent creation without these.
  - Auto-created KYC record on agent creation (`db.kyc` + agent's `kyc_status='pending'`).
  - Login KYC gate: agent with `kyc_status='pending'` → 403 with explicit "pending KYC verification" message; `kyc_status='rejected'` → 403 with "KYC rejected" message. Inline amber alert (`data-testid='login-kyc-error'`) on the login page surfaces these instead of toasts.
  - Admin KYC Review page rewrite: Agent Name | Distributor | Phone | Address | Aadhaar (View link) | PAN (View link) | Status | Submitted | Action. Approve / Reject (modal with rejection-reason textarea) toggle based on status — re-approve & re-reject both supported. Both `db.kyc` and `db.users.kyc_status` updated atomically; audit log entries `kyc_approved` / `kyc_rejected` (with reason).
  - Admin Overview adds **Pending KYC** amber KPI card (`data-testid='kpi-pending-kyc'`) navigating to /admin/kyc.
  - Admin Agents list Status column reflects `kyc_status` for agents.
  - Migration: existing agents auto-marked `kyc_status='approved'` (no login disruption for the 23 pre-existing accounts).
  - Tests: 45/45 pytest (`test_kyc_overhaul.py` new with 11 cases + 34 legacy refreshed); 6/6 frontend KYC UI checks. Zero regressions.

- **Feb 2026 — Branding & Landing/Login refresh:**
  - Removed "M" circle icon from landing nav, landing footer, login left-panel and dashboard sidebar (all 3 roles). Text branding "MAK FIN PAY / DIGITAL UTILITY" (and "OPERATOR PORTAL" on login) kept.
  - Landing nav button "Agent Login" → "Login".
  - Removed floating wallet credit overlay card from hero image.
  - Added 3 services to landing services grid (now 11 cards): Travel Booking, Hotel Booking, POS Machine.
  - Contact details updated: phone `+91 97127 41212`, multi-line office address (Yasin Baug, Bhavnagar). Email unchanged.
  - "Ready to begin?" card: dropped `.mfp-card` (which forced cream bg) and inlined dark-green styling so heading + paragraph render with correct contrast.
  - Removed `<a id="emergent-badge">` block from `frontend/public/index.html` so the "Made with Emergent" badge no longer exists in the DOM on any page.

- **Feb 2026 — Code Quality Refactor pass:** P0/P1/P2 fixes applied per audit. No UI/behavior changes.
  - Backend: extracted `CommissionAllocation` dataclass; `_ensure_indexes / _seed_admin_user / _ensure_commission_settings / _migrate_commission_schema / _build_commission_migration` for startup; `_build_parent_name_map / _distributor_earnings_for` for user listing; `_recharge_revenue_breakdown / _transaction_metrics / _total_wallet_balance` for financial stats. Hardcoded admin password removed from regression suite (env var with hard-fail).
  - Frontend: `Landing.jsx` split into 10 section components (`pages/landing/sections.jsx`) with stable test-ids; `DashboardLayout` split into `SidebarContent` + `dashboardNav.js`; auth context `value` memoized + `login/logout` wrapped in `useCallback`; Admin Recharges / Transactions: `columns / reload / act / approve / reverse` memoized; shared filter utilities at `lib/filters.js`; `ChangePassword` extracts `validateChangePassword()` + `mapServerErrorToField()`; `DistributorRecharges` columns lifted to module scope.
  - Regression: 34/34 pytest backend cases pass. Frontend smoke (landing, login, sidebar, logout) clean.

## CRITICAL NOTE for Next Agent — Mobile Responsiveness (IN PROGRESS)
User previously asked to make the platform fully responsive for mobile (≤768 px) **without altering desktop/tablet layouts**. `DashboardLayout` + Sidebar already include mobile hamburger + slide-in drawer (drawer overlay, `min-h-[44px]` touch targets, etc.). **Pages still pending mobile audit:** Landing/Login + all Admin/Distributor/Agent inner pages — particularly tables (need horizontal scroll or card view) and modals/forms.

## P0 / P1 / P2 Backlog
### P0 — Mobile Responsiveness (RESUME HERE)
- Landing & Login: stack columns, ensure 16+ px font size to prevent iOS auto-zoom.
- Admin pages (Overview, Distributors, Agents, Recharges, Transactions, Withdrawals, QR Codes, Commission, KYC, Audit): wrap tables in `overflow-x-auto` or convert to card-view <md; collapse filter bars.
- Distributor + Agent pages: same treatment.
- Modals/Dialogs: full-screen on mobile, safe paddings.

### P1 — Operator integrations
- DTH bill payment (currently only Credit Card active).
- Electricity bill payment.
- Landline bill payment.

### P2 — Platform expansion (future)
- BBPS integration.
- Payment Gateway integration (UPI/Razorpay/etc.).
- WhatsApp / SMS / Email notifications.
- Fraud detection / monitoring workflows.
- Automated settlement system.
- FlutterFlow-ready mobile API.

### Tech debt (noted by testing agent — optional)
- Split `server.py` (≈1276 lines) into routers per domain.
- Migrate from deprecated `@app.on_event` to FastAPI `lifespan` handlers.
- Brute-force lockout (after 5 failed logins) per playbook.
- Normalise `/api/wallet` response shape (admin vs non-admin).

## Key API Endpoints
- `PUT /api/admin/settings/commission` — atomic cascading default-percent update.
- `PATCH /api/admin/users/{uid}/commission` & `/reset` — per-user commission overrides.
- `POST /api/agent/bill-payments` — tiered service-charge calc + wallet debit (status=pending).
- `POST /api/admin/transactions/{id}/approve` & `/reject` — success / reverse-and-refund.
- `GET  /api/admin/stats/financial?range=…` — date-filtered KPIs.

## Tech Stack
React + Tailwind + Shadcn UI + Lucide · FastAPI + Motor (Mongo) + PyJWT + bcrypt · MongoDB.

## Credentials
See `/app/memory/test_credentials.md`.
