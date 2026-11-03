# APG App

This folder is the standalone project. Copy the whole folder to move the app, including your login, customers, goods, vouchers and historical ledger data. It does not need any other folder in APG.

## GitHub source checkout

The GitHub repository contains application code and documentation. The working database, administrator login, customer records, ledger data, backups and deployment ZIPs are excluded from Git.

After cloning, securely copy the current `storage/app.sqlite` from your existing installation into `storage/` before starting. A source checkout alone cannot run the populated app. `schema.sql` is a reference and does not rebuild the recovered data. Keep database copies and data-inclusive upload packages private.

## Start locally

Double-click **Start.command**, or run:

```sh
php -S 127.0.0.1:8890 -t public
```

Open http://127.0.0.1:8890 and use your existing login. PHP 8.2+ with PDO SQLite, mbstring and sessions is required. Keep the server terminal open while using the app.

## Included files

- `public/` — the browser interface, API and public web-server settings.
- `bootstrap.php` — database connection and application helpers.
- `storage/app.sqlite` — the complete working database, login and all recovered historical records. This is required; do not omit it when moving the app.
- `storage/data-manifest.json` — source-table counts and verification information.
- `storage/.htaccess` — additional protection for private storage.
- `schema.sql` — database schema for development reference. Do not use it to replace the populated database.
- `Start.command` — macOS local launcher.
- `create_upload_package.py` — creates a consistent data-inclusive ZIP in this folder’s `releases/` directory. Requires Python 3 only when packaging.

No Oracle installation, source RAR backups, reference photos, viewer, migration files or external data files are needed. Historical tables already inside app.sqlite are retained because the app uses them for ledgers, account groups and the imported-data browser.

## Prepare an upload

Run `python3 create_upload_package.py`. The ZIP includes deployment instructions. Only the contents of `public/` belong in the public document root. Keep `bootstrap.php` and `storage/` one directory above it. PHP must have write access to private storage. Use HTTPS and verify hosting supports PDO SQLite.

On later code updates, do not overwrite a live database with an older local copy; doing so loses records entered on the live site. Copy or back up the latest database consistently before moving it. Hostinger deployment is not yet verified.

## Current scope

This is a functional review app. Goods and deliveries do not yet create automatic accounting vouchers. Five Financial Reports cards are explicitly awaiting implementation. Historical balances still require reconciliation; older Urdu font text may require conversion. All 21 recovered tables and 705,476 original ledger entries remain in the database, including incomplete source records accessible through Workspace settings → Browse imported backup.

## Hostinger GitHub deployment

The recommended document root is `public/`. If Hostinger publishes the entire repository into `public_html/`, the root `.htaccess` routes the domain to the public app and denies access to all other project paths. Redeploy the latest `main` commit after adding this file. PHP must support Apache-compatible rewrite rules, PDO SQLite, mbstring and sessions.

GitHub intentionally does not contain the working database. For the first deployment, use Hostinger File Manager or SFTP to securely upload your current local `storage/app.sqlite` to the deployed `storage/` directory. If the repository is in `public_html/`, this is `public_html/storage/app.sqlite`; the root and storage access rules deny web access to it. Prefer private storage outside the document root when your hosting configuration allows it, using `APG_STORAGE` to point PHP to that directory. Ensure PHP can write to the database and its directory. Never commit the database to this public repository.

After deployment, open the domain and sign in with the existing login. A 403 at the domain with a working `/public/` page indicates the wrong document root or missing root rewrite configuration. An API 500 after the page loads requires checking PHP error logs: a missing database, SQLite support or storage permissions are possible causes. Keep the existing live database on subsequent code deployments.

## Workspace upgrade — November 2026

The redesigned interface includes a daily dashboard with actual seven-day goods movement, a station delivery queue, task and customer-ledger search (`Ctrl+K` or `Command+K`), responsive navigation, improved entry forms and login, and safeguards for unsaved dialog changes. Dashboard dates now default to today in Asia/Karachi. Large lists keep their own horizontal scrolling on mobile.

Financial Reports now includes calculated Trial Balance and Customer Balances, Day Book accounting lines, original/new Journal lines, and new-app Voucher lines. These support dates, search, pagination, account-ledger drill-down, current-page printing and CSV export. Totals cover all matching results. Historical balances still require reconciliation; undated and unassigned legacy entries cannot form complete dated account balances. The remaining five dedicated reports are marked awaiting implementation.

This release keeps PHP/SQLite and the existing data format. No database migration, replacement upload or frontend build is needed. Deploy the latest code from `main` and preserve your existing `storage/app.sqlite`. Versioned asset URLs ensure browsers load the matching interface files. The application and database support current PHP hosting; a future Laravel/MySQL migration should be planned and verified separately.

### Verification

Run `python3 tests/integration.py` with PHP and the private database available. It creates a consistent temporary database copy, substitutes an isolated test login, starts a temporary local PHP server, exercises financial totals, ledger postings, access controls, search, pagination and deployment errors, then removes the copy. It does not change the working database. A browser is not needed for this test.

## Users, roles and profiles

Your original account remains the protected **Super admin**, with the same username and password. Open **My profile** to add a photo, full name, job title, email, phone and bio, or change your password. Photos are cropped and re-encoded as 256px JPEGs, stored privately inside the database; PHP GD is required for photo changes.

Open **Users & permissions → Add user** to create staff logins. Manager, Accountant, Operations, Viewer and Custom are starting presets; the individually checked permissions determine actual access. Eighteen controls cover dashboard summaries, incoming goods, bookings, deliveries, customers, vouchers, ledgers, account creation, financial reports, settings/audit, stations, backups and imported data. Creation permissions also grant their required viewing permissions. Only the super admin can create users, change access, deactivate accounts or reset another user's password. The protected super admin cannot be disabled, demoted or reset through user management.

Permissions are enforced in the API on every request. Restricted dashboards and lookup responses avoid disclosing unassigned business data. Permission revocation applies immediately; deactivation and password resets invalidate existing sessions. Users can edit their own profile and change their password with the current password, but cannot alter their own role or permissions. Access and profile changes are audited. Usernames remain stable so audit identities do not drift. Concurrent user-management edits use version checks.

On the first request after deployment, an idempotent transaction adds the profile/access columns to the existing `users` table and marks the original account as super admin. It preserves its password hash and supports its existing session. **Keep the live database; do not upload a replacement.** Deploy `access.php` alongside `bootstrap.php` and the `public/` files. A consistent private server backup should be retained before deployment. The upload packager includes the new access module.

Run `python3 tests/access.py` for isolated user-lifecycle and authorization checks, in addition to `python3 tests/integration.py` for accounting/report regressions. Both use disposable database copies and local HTTP servers; neither changes the working database.

## Personal navigation home

Navigation now appears above Dashboard and opens first after sign-in. It brings all permitted workspace tabs and quick actions into one searchable directory. The welcome area uses the signed-in profile name/photo, role, the current date, and a morning/afternoon/evening greeting in Asia/Karachi. Press `/` on this page to focus its search. Dashboard remains available as its own tab, and existing role restrictions apply throughout.

## Thermal slip printing

All existing print buttons now open a thermal preview. Delivery receipts, incoming/booking bilties, shipment sheets, receipt/payment/journal vouchers, account ledgers, financial reports and the chart of accounts use black-and-white receipt layouts with stacked details, dashed separators and clear totals. Wide desktop tables are never sent to the printer.

Choose **80 mm** (72 mm print area) or **58 mm** (48 mm print area), then **Print slip**. The paper choice is remembered in that browser. In the system print dialog select your thermal printer and matching paper width, use 100% scale and no margins, and disable browser headers/footers. The app cannot select a hardware printer or change its driver settings automatically. Long records flow onto additional slip pages, with generated page lengths capped at 500 mm. Paper width and usable area can still depend on the actual printer driver.

Ledger/report and paginated register slips explicitly identify the current-page record range. Their period totals still cover all matching records, as labelled. Goods and delivery slips preserve existing financial rules; printing creates no business records or accounting postings. Ordinary browser printing also uses the thermal layout and excludes editable forms. Photos, passwords and form fields are not part of the slip layouts.

`tests/printing.py` starts a disposable database/server and runs browser/PDF checks. With Playwright and a Chromium browser available, set `PLAYWRIGHT_MODULE` to your Playwright module path and, if needed, `CHROME_PATH` to the browser executable, then run `python3 tests/printing.py`. The test generates PDFs without submitting physical print jobs and verifies the 58/80 mm page widths. Set `APG_PRINT_OUTPUT` to a private temporary directory if you want to retain its PDF/screenshot artifacts; by default they are cleaned up with the test database. Physical hardware output has not been tested.

## Original-system print values

Goods print formulas and delivery field sources have now been traced to the retained original Oracle report files. Delivery print preview offers **Receipt slip · charges** (original R150) and **Cash summary · received** (R157). Historical receipts read the actual original delivery snapshot, rather than assuming its loading/Suzuki charges equal those on arrival. Incoming/booking print totals use the original component formulas instead of nullable imported totals. This is a read-only print correction; stored business transactions and ledger postings are unchanged.

See [LEGACY-PRINT-RULES.md](LEGACY-PRINT-RULES.md) for verified mappings, evidence hashes and remaining old-font rendering limits. Run `python3 tests/legacy_print.py` for independent source-data comparisons.

## System check and recovered totals

The 2 November system check found and corrected a missing-total import issue affecting goods views and valid delivery collection limits. Read APIs and validation now calculate totals from the verified component charges while preserving the original SQLite value as `stored_total`. No historical values are rewritten. Run `python3 tests/goods_totals.py` for the regression case and see [SYSTEM-CHECK.md](SYSTEM-CHECK.md) for checked behavior and remaining functional/data limits.

Saved incoming goods and bookings can be corrected by the super admin or users granted the matching **Edit incoming goods** / **Edit bookings** permission: open the entry, select **Edit entry**, update the shipment/bilty details, review and save. Existing bilty IDs, delivery links, recorded collections and original imported receipt snapshots are retained. Existing bilties cannot be removed through this editor; new bilties can be added. Each edit stores before/after JSON in `shipment_revisions` and logs the actor in `audit`. A version check prevents overwriting changes made after the editor was opened. Run `python3 tests/shipment_edit.py` to verify this workflow against a disposable database.

Delivery goods / counter cash supports multiple incoming bilties in one delivery: select **Deliver goods**, type an exact bilty number, choose the matching arrival and select **Add bilty**. Repeat for other bilties, enter per-bilty cash/discount/service charges, review combined totals and save once. Duplicate numbers show station, date, shipment and customer for choosing the right arrival. Adding/removing rows preserves other inputs. Up to 1,000 bilties can be saved per batch; already delivered bilties cannot be handed over again. Browser regression: `python3 tests/delivery_multi.py` with the same Playwright/Chrome environment used for print tests.

The edit permissions are independent of create permissions and include the matching view permission. Existing users do not gain edit permissions automatically; grant them in Users & permissions. The Manager preset includes both when applied.
