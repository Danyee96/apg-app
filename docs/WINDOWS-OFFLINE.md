# Windows offline application: implementation requirements

Status: design only. There is no offline Windows app, installer, sync service, or automatic-update release pipeline in this repository yet. Do not distribute a website wrapper as an offline-capable app.

## Existing application

The current application is PHP with a SQLite database and server-side session and permission checks. Business operations include incoming approvals, delivery allocation, customer balances, cash receipts, operator custody periods, expenses, vouchers, backups, and printing. These operations cannot safely be synchronized by copying or merging SQLite database files: IDs, unique constraints, accounting postings, receipt allocation, custody clearances, and edits can conflict across devices.

## Required behavior

- The Windows installer must include a compatible local runtime and provision a local data store outside the application installation directory. Do not package any real customer data, account passwords, private keys, or production database into the installer or public repository.
- Initial setup requires an online authenticated sign-in and a permission-scoped download. Offline sign-in, session expiry and revoked accounts require explicit policy; caching all user credentials or the production database is not an acceptable substitute.
- User-visible status must distinguish saved on this device, pending sync, syncing, synced, and conflict/rejected. Pending entries must survive app and device restarts and software updates. Other devices cannot see an entry until the server accepts it.
- Each device operation needs a durable UUID, authenticated device and user identity, schema/protocol version, causal dependencies, timestamp for display, and idempotent server handling. A retry after a lost response must return the original result without a duplicate receipt or voucher.
- The server must recheck current user permissions and apply each operation with its linked postings in one transaction. Stale edits, duplicate delivery of the same bilty, changed customer balances and closed munshi periods must become actionable conflicts; never silently overwrite, discard or double-post. Device-generated references must be mapped to server IDs without collision.
- Customer balances, deliveries and cash custody must be recomputed from accepted transactions, not summed from independently modified replicas. Initial opening balances must not be duplicated. Preserve established advance, discount, service allocation and customer correction rules.
- Define a permission-scoped server change feed with a monotonic cursor, tombstones and bootstrap/resume support. Downstream changes must update the local replica without overwriting unsent work. Schema changes need versioned migrations and tested rollback/recovery.
- A versioned, signed Windows release must be produced and hosted through an update channel. A Git push alone does not publish a Windows installer. The release process should build and test the web and Windows releases, deploy both only when explicitly authorized, and verify the published versions. For this project, a user request to “push” includes updating both web and Windows once the release mechanism exists.
- Updates must preserve the local database and unsynced queue. Offline users should continue to work on a compatible version; incompatible protocol or schema changes need a safe upgrade path, never automatic data loss.

## Acceptance checks before delivery

1. Install on a clean Windows PC using one installer, start from the desktop, authenticate and download only authorized data.
2. Disconnect the internet; create incoming goods, deliveries, payments and expenses; close/reopen and reboot; verify entries remain pending.
3. Restore connectivity; verify web and Windows show the same committed entries, customer balances, receipts, vouchers and operator totals exactly once. Restart/retry while network responses are interrupted.
4. Use two devices to edit the same records, deliver the same bilty, and collect/clear an operator period concurrently. Verify conflicts are visible and no money or entries are lost or duplicated.
5. Test partial payments, prior balances, advance/service refunds, temporary-customer promotion, permission changes, rejected submissions and repeated sync; verify all journals balance.
6. Upgrade from a prior installed version with pending unsynced entries. Test interrupted updates, restart, recovery and compatibility with the currently deployed web server.
7. Test backup/restore, local data protection, sign-out and account revocation, thermal and A4 printing, English/Urdu/RTL, and Windows sleep/reboot/network interruptions.
8. Verify the full workflow on a real Windows installation before handing an installer to operational users.
