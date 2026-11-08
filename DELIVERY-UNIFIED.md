# Unified Delivery Goods

Delivery Goods now contains document search, entry, subsequent collections, payment approvals and customer balances. Old cash-receiving links open this workspace. Desktop has aligned bilty and service grids; mobile stacks them with bilty identifiers. Initial confirmed full bilty collection determines walk-in classification. Payment and cleared statuses are calculated independently, with positive debts never offset by another row or service credit.

## Accounting and migration

New deliveries assess the bilty/customer receivable when saved, even with zero payment. Loading and Suzuki use independent receivable and clearing control accounts, not the customer account. These controls do not assume a revenue classification. Zero cash creates no receipt. Each later payment appends immutable receipt lines, with independent dates; editing assessed charges creates adjustment journals. Request keys and invoice versions prevent retries or stale edits from duplicating transactions. Operator cash proposals post only after super-admin approval; delivery billing is separate from cash approval.

The user authorized reclassification of older outstanding service balances. Migration adds balanced adjustment journals removing those service debts from customer accounts and assigning service control accounts. Original historical ledger rows, vouchers, imported delivery source values and receipts remain unchanged. Where old records contain only combined loading/Suzuki cash, the outstanding amount stays explicitly labelled legacy combined service balance. No historical split is invented. A new explicitly categorized payment can transfer that amount from the legacy control to the chosen service control before collection. Reopening imported deliveries adopts their receipt history without posting original charges or cash again. Unknown original dates are labelled unrecorded rather than presented as known dates.

Migration phases are idempotent and tracked by `delivery_unified_version` (6). Later schema/view upgrades never repeat the historical adjustment. Existing print routes retain original delivery source amounts and receipt dates. Category overpayments remain credits in that category and cannot clear another category's outstanding debt. Existing supported overpayment warnings remain nonblocking.

## Validation

Disposable-database checks: `tests/unified_delivery.py`, `tests/unified_delivery_browser.py`, `tests/cash_approvals.py`, `tests/delivery_cash.py`, `tests/delivery_edit.py`, `tests/delivery_approvals.py`, `tests/legacy_print.py`, `tests/integration.py`. Browser tests require Playwright. Coverage includes multiple bilties, partial/full/zero payments, repeated saves, dates, amendments, independent category credits, imported-source preservation, operator approvals, responsive layout and Urdu direction.

Take a verified production backup before deployment. To roll back financial migration, restore that backup together with the matching application version during a controlled maintenance window; do not delete adjustment journals or reset the migration marker independently.
