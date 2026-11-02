# System check — 2 November 2026

## Outcome

The deployed version matched the repository. The live session endpoint responded normally. Public requests to the database, Git metadata, bootstrap/access modules, user management and financial data were correctly restricted. Live SQLite integrity returned `ok`, with zero foreign-key violations.

The live database contained 1 user (the active super admin), 1,221 account heads, 4,962 shipments, 131,692 items, 40,494 deliveries and 705,476 historical ledger rows at the time of review. No live business records were created or changed by the checks.

## Issue found and fixed

A pending recovered bilty had Rs 4,250 in charge fields but a zero stored total. The same import issue affected 113 pending incoming bilties. Before the fix, goods screens could show zero and delivery validation could reject valid cash collections.

`goods_total()` now centralizes the previously verified incoming/booking component formulas. Read APIs use it for shipment details, bilty searches, delivery details and shipment-register sums; delivery collection limits use the same calculation. Original stored totals are retained in SQLite and returned separately as `stored_total` for provenance. No mass data update or ledger posting is performed. New shipment writes continue to store their calculated totals.

A regression test first reproduced the zero-versus-Rs-4,250 failure. After the fix it verified correct displayed totals, accepted valid collection, rejected overpayment and duplicate handover, and confirmed that neither original stored totals nor vouchers were changed unexpectedly.

## Verification

- PHP/JavaScript syntax and whitespace checks passed.
- 20 user-access checks passed, covering permissions, session revocation, super-admin protection and photos.
- 29 accounting/report integration checks passed.
- Original print values matched independent source queries for eight historical receipts and 20 source lines.
- Seven goods-total regression groups passed, including incoming and booking register sums.
- 26 browser workflow checks passed on desktop, 390px mobile and 768px tablet, including shipments, delivery, vouchers, customer search, reports and session expiry. No JavaScript errors or unexpected HTTP 5xx responses were captured.
- Thermal preview and physical PDF widths were checked at 58/80 mm; tests generated 23 PDFs without submitting physical print jobs.

All tests that write records run against disposable database copies.

## Remaining functional and historical limits

- Goods/delivery operations still do not automatically post accounting vouchers.
- Five dedicated financial-report cards remain awaiting implementation.
- Historical balances require reconciliation. The recovered ledger retains 167 entries with incomplete account codes and 37 without dates.
- The initial inventory identified 129 items marked delivered without a delivery-item link. Source inconsistencies are preserved rather than guessed or silently repaired.
- Legacy Urdu font conversion and physical printer/driver output still require separate verification.

Passing the checks above establishes the tested behavior; it does not certify historical accounting balances or untested hardware.
