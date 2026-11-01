# APG project map

Initial inventory reviewed 1 November 2026; see the upgrade notes below for subsequent changes. This document records the implementation and local checks, rather than certifying historical accounting accuracy.

## Thermal printing

Printing uses dedicated escaped receipt snapshots, a separate `print-preview` dialog and a `thermal-print` root. Existing dialog/page print actions all route through the thermal preview. `beforeprint` also prepares narrow output for native browser printing. The browser remembers only the paper-width preference, not receipt data.

Structured builders cover shipment sheets, incoming/booking bilties, delivery receipts, vouchers, ledgers, financial reports and the chart of accounts. A safe DOM fallback converts visible read-only register rows and labels their pagination scope; forms are excluded. Data and totals retain their existing meaning. The preview supports 58 mm paper with 48 mm usable area and 80 mm paper with 72 mm usable area, with dynamic page lengths capped at 500 mm and additional pages for long records. Large amounts are fitted to prevent horizontal clipping.

`tests/printing.py` and `tests/thermal-print.mjs` exercise preview behavior, preserved source dialogs, paper preference, native printing, both financial report layouts, escaping, long/Urdu values, mobile layout and physical PDF widths. No printer jobs are submitted by these tests. Real printer/driver setup remains a device-side verification step. No database/schema migration is involved in this release.

## Navigation home

The first screen after sign-in is now Navigation, positioned before Dashboard. It lists authorized operation, finance and workspace tabs plus quick actions, with local search and a `/` focus shortcut. Its welcome area reads the signed-in profile and uses Asia/Karachi for the greeting and date. This page does not fetch business-wide dashboard data, so restricted accounts can use it without overview access. Dashboard remains a separate screen.

## User access upgrade

The existing login is retained as the protected super admin. `access.php` now owns the idempotent users-table migration, permission catalog and dependencies, role presets, account/session resolution, profile image validation, profile/password routes, and super-admin-only user management. The API invokes its authorization checks before business endpoints. All new user/profile/photo data stays in the existing private SQLite database.

Users & permissions adds user creation, individual permission editing, role presets, activation/deactivation and password resets. My profile adds photo/details editing and self-service password changes. User creation and access changes cannot be delegated to ordinary roles. The super admin cannot be disabled, demoted or reset using user management. The 18 business permissions support per-module read/create/manage access; role names are presets, with the stored individual permission list authoritative.

Every request checks current permissions, active status and a session version. Password resets and deactivation invalidate sessions; profile edits leave access unchanged. Shared lookups are narrowed, cross-kind shipment/bilty reads are restricted, and users without overview access receive a task-only home page. Photo uploads are decoded and re-encoded as 256px JPEGs in the database; they are not executable files or public uploads. All profile and access changes are audited.

`tests/access.py` exercises privilege boundaries, legacy sessions and migration compatibility, photo validation, deactivation, session invalidation, password changes, protected-super-admin rules and stale edits through a disposable HTTP server. Browser verification covers super-admin profiles, staff creation/custom permissions, role presets, mobile layouts, restricted navigation and deactivation. Original accounting regression coverage remains in `tests/integration.py`.

## November 2026 upgrade

The current UI uses a new teal-and-ink design with a live daily dashboard, actual seven-day shipment series, delivery queue, keyboard task/customer search, responsive navigation, redesigned login and entry screens, unsaved-modal protection, and improved error recovery. Hidden mobile navigation is inert, its open state manages keyboard focus, and reduced-motion preferences are respected.

Five report views were added: Trial Balance, Customer Balances, Day Book, Journal accounting lines, and new-app Voucher lines. They calculate from the existing historical ledger plus new vouchers and support dates, search, pagination and ledger drill-down. Ten of the 15 financial cards now have available views; five remain awaiting implementation. Historical reconciliation and automatic goods accounting remain outside this release.

Today in Asia/Karachi is the dashboard default. Backup metadata is read from the database. Operational pagination clamps to existing pages; reversed date filters are rejected. Requests from superseded list renders cannot overwrite current result data, and expired-session rendering safely returns to login. Missing database files return an actionable 503 response. PHP and SQLite remain the runtime; no schema or working-record changes are needed.

Verification includes real HTTP integration tests in `tests/integration.py`, the previous 38 API regression checks on a temporary copy, and browser workflows at desktop, 390px mobile and 768px tablet sizes. Browser checks included real HTTP login, task search, five report views, shipment creation, delivery, receipt vouchers, unsaved changes and session expiry, with no JavaScript errors or HTTP 5xx responses during normal workflows. Screenshots and synthetic test records were kept outside the repository.

The inventory and findings below describe the initial review snapshot; counts may change with business use. References below to ten unfinished financial reports and hardcoded working dates describe that earlier version.

## Purpose and runtime

APG is the Azad Pakistan Goods workspace for D. I. Khan. It combines goods arrivals, outgoing bookings, bilty inquiries, delivery handovers, customers, account heads, manually posted accounting vouchers, and recovered Oracle records.

The application is plain PHP 8.2+, vanilla JavaScript and CSS, and one SQLite database. There is no Composer, npm build, framework, external runtime API, or Oracle dependency. PHP needs PDO SQLite, mbstring and sessions. Application dates use Asia/Karachi; audit timestamps use SQLite's UTC defaults and are formatted in Karachi time by the browser.

Start from the project root with `php -S 127.0.0.1:8890 -t public`. Open http://127.0.0.1:8890. `Start.command` also starts the server and opens the browser. Existing credentials are retained in the database.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `public/index.php` | HTML shell, modal, account datalists, security headers and local asset loading |
| `public/app.js` | Navigation, API client, screens, forms, draft shipments, customer picker, printing and CSV export |
| `public/style.css` | Desktop/mobile layouts and print rules |
| `public/api.php` | Action-based JSON API, sessions, authorization, validation and business operations |
| `bootstrap.php` | Database connection, query helpers, integer money parsing, dates, pagination, transactions and audit |
| `storage/app.sqlite` | Working data, login, all recovered source tables and historical ledger |
| `storage/data-manifest.json` | Original recovery counts, hashes and provenance; not a live transaction manifest |
| `schema.sql` | Reference schema; does not recreate the populated recovery tables or data |
| `create_upload_package.py` | Consistent SQLite backup and data-inclusive ZIP with deployment instructions |
| `public/.htaccess`, `storage/.htaccess` | Apache public-root/private-storage protections |

## Screen and workflow map

The landing Dashboard is a task launcher; Overview is the daily metric screen. Overview defaults to the original backup date, 31 October 2026. Its daily arrival/delivery counts use the chosen date, while pending goods and latest shipments are broader queries.

Customers support search, groups, contact details, Urdu fields, active/inactive status and edits. Existing customer groups cannot change. Version numbers reject stale updates. New customer codes are generated under groups 115, 116, 117 or 118. New Account uses groups from recovered `legacy_MAIN`; customer account heads also appear in Customers.

Incoming and Booking forms use three steps: transport header, bilty list, review/save. Bilties remain in browser memory until the entire shipment is saved. A bilty requires an active customer, number, receiver and positive quantity. Duplicate bilty numbers are rejected within one shipment; there is no global uniqueness rule. Saved shipment operations create records; there is no saved-shipment edit/delete API.

- Incoming bilty total = bilty amount + godown. Loading and Suzuki charges remain separate.
- Booking bilty total = rent + loading + bilty amount + local charges. Truck amount and commission remain separate.
- Advance cannot exceed the bilty total. Money is stored as integer paisa and displayed as rupees.

Delivery selects pending incoming bilties, including across result pages, then records receiver details, discount, bilty cash and service cash. Saving links each bilty to one delivery and marks it delivered within a transaction. Dates cannot precede arrival. Discount plus bilty cash cannot exceed total less advance; service cash cannot exceed loading plus Suzuki. Zero or partial cash collection is allowed. Bookings do not enter this delivery workflow.

Accounts & vouchers creates receipts (RV), payments (PV) and journals (JV). Each voucher needs 2–50 lines, one positive side per line, active accounts and equal total debits/credits. Receipts/payments must include cash/bank accounts under `1-101-` or `1-106-` with the correct net direction. Posted vouchers have no editing, deletion or reversal workflow.

Ledger combines `historical_ledger` with new `voucher_lines` and voucher headers. Opening balance includes the account opening debit/credit and prior dated transactions. SQL window sums calculate running balances before pagination. Original and New app entries remain distinguishable. Full history begins at the stored history start.

Reports link to operational registers and ledger views. Financial Reports contains 15 cards: Ledger, Account Activity, Cash Book, Bank Book and Chart of Accounts have available views; the remaining 10 are placeholders. Cash/Bank Book currently selects an account ledger rather than producing a consolidated book. CSV exports and printing apply to the current rendered page, not the full result set.

Settings manages stations, shows recent audit activity, creates private SQLite snapshots, and opens the read-only imported-data browser. Imported tables are allowlisted by stored table name and paginated, with optional search across source fields.

## Data model and verified inventory

| Entity | Records at review |
| --- | ---: |
| Account heads | 1,221 |
| Customer account heads | 1,136 |
| Stations | 7 |
| Incoming shipments | 4,338 |
| Outgoing bookings | 624 |
| Bilties/items | 131,692 |
| Deliveries | 40,494 |
| Delivery-item links | 123,457 |
| Historical ledger entries | 705,476 |
| New vouchers / voucher lines | 0 / 0 |
| Recovered source tables | 21 |
| Total recovered source rows | 1,123,155 |

`accounts → items → shipments` associates customers with goods. `deliveries → delivery_items → items` records handovers; the item link is unique. `vouchers → voucher_lines → accounts` supplies new ledger entries. `historical_ledger` stores recovered ledger entries separately. `audit`, `meta`, `users`, and lazily created `auth_attempts` support operations.

All 21 `legacy_*` tables are preserved: ACPERIODS, AREAS, BAL, DM, GLLEVEL, IND, INH, INOTH, ITEMCAT, ITEMS, LOCATION, MAIN, PROPINFO, SM, SMS_LOG, STATION, STOCK, TRUCK, VRD, VRH and WORKING.

## Authentication and deployment

Session cookies are HTTP-only and SameSite Strict, with Secure enabled when PHP sees HTTPS. POST calls require the session CSRF token. Passwords are hashed. Failed login attempts are limited by IP to 10 in a 10-minute window. Initial administrator creation is restricted to loopback and only available with no existing user. All authenticated sessions have administrator access; role separation and password management are absent.

Only `public/` belongs in the web document root. `bootstrap.php` and `storage/` must be one level above it. `APG_STORAGE` can override private storage. Storage must be writable by PHP. SQLite foreign keys and a 5-second busy timeout are enabled; writes use `BEGIN IMMEDIATE` transactions. Backup uses `VACUUM INTO`; packaging uses SQLite's backup API. Later deployments must preserve the latest database rather than overwrite it with an older package. Hostinger runtime has not been verified.

## Findings and boundaries

1. Goods, advances, delivery cash and discounts do not automatically post accounting vouchers. Ledger balances therefore do not automatically reflect new goods activity.
2. Historical balances still require business reconciliation. Database consistency checks do not establish accounting correctness.
3. There are 167 historical ledger rows with null account codes and 37 without dates. These are retained in the source browser; undated entries cannot appear in date-filtered ledger periods.
4. There are 129 items marked delivered without a delivery-item link. Pending incoming count is 116. All 7,990 booking items currently carry `pending`, although the delivery operation only accepts incoming goods. These are imported-data/workflow distinctions needing reconciliation before changing statuses.
5. Ten financial-report cards remain unimplemented; dedicated statements, customer balance reports and financial summaries are incomplete.
6. Historical Urdu encoding may require conversion. User roles, password change/recovery, saved-entry corrections and voucher reversal workflows are absent.
7. Backup dates and the default working date are hardcoded in several UI/API locations. The upload ZIP filename is also fixed to 1 November 2026 even though package metadata uses the execution date.
8. Source-table preservation hashes are recorded in the manifest. This review checked counts and database integrity; it did not reconstruct or independently rehash the original RAR archive.

## Verification performed

- PHP 8.2.33 and required extensions available; local server started on port 8890. Live session endpoint and signed-out browser screen responded successfully.
- PHP syntax checks passed for all three PHP files; JavaScript syntax check passed.
- Read-only SQLite integrity check returned `ok`; foreign-key check returned zero violations. Source counts match the manifest.
- Ababeel Drug (`1-116-252`) contains 68 historical entries, 3 November 2017–26 January 2020, debit and credit each Rs 23,370.00. API pagination and totals were checked.
- 38 API requests passed against a separate consistent database copy: read endpoints, customer create/update/stale-update rejection, incoming/booking creation and totals, duplicate bilty rejection, delivery date and repeat-delivery rejection, receipt posting, incorrect cash direction and unbalanced voucher rejection, ledger inclusion, station creation and backup. Final copied-database integrity and foreign keys also passed.
- Browser checks rendered Overview, Incoming, Booking, Deliveries, Customers, Accounts, Reports, Financial Reports, Settings, Dashboard, ledger detail and imported backup, plus a mobile viewport. No browser JavaScript errors were captured.
- Authenticated tests used a synthetic session against the temporary database. Browser API calls were routed to a CLI harness executing the API with that copy; these were not full authenticated HTTP tests. Existing passwords were neither read nor reset. Successful/failed password login, production hosting, physical printing and exhaustive malformed-input testing were not exercised.

No application code or original business records were changed by this review. Temporary test artifacts are outside the project; this project map is the only added project file.
