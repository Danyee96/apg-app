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

This is a functional review app. Goods and deliveries do not yet create automatic accounting vouchers. Some Financial Reports cards are explicitly awaiting implementation. Historical balances still require reconciliation; older Urdu font text may require conversion. All 21 recovered tables and 705,476 original ledger entries remain in the database, including incomplete source records accessible through Workspace settings → Browse imported backup.
