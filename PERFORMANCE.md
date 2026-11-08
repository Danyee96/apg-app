# Performance changes

The delivery list now limits aggregation to deliveries within the selected date/search range. With normal date ordering and no payment/balance filter, its second query aggregates only the requested page. Bilty previews are loaded in one batch instead of one query per delivery. Payment filters and balance-based sorting still calculate full matching totals. Minimum-outstanding comparisons explicitly bind a numeric value, fixing SQLite's comparison of aggregate values against text parameters.

The browser reuses number and date formatters across table cells. Localisation batches DOM changes per animation frame and processes changed subtrees rather than walking the entire workspace on every change.

Authenticated GET requests release the PHP session lock after authentication so a slow report does not serialize other reads from that session. Login, profile/password changes and other POST requests retain session handling.

Both supported Apache document roots enable text compression where mod_deflate is available. Content-hashed JS/CSS URLs receive immutable caching where mod_headers is available; HTML and API responses remain no-store. Each asset has its own content hash, so changing one script does not invalidate all cached assets. No private financial responses are cached by this change.

## Local measurements

On the local database with about 40,000 delivery documents and 123,000 delivery rows:

- Date-filtered list: about 597 ms before, 1–3 ms after.
- Full list: about 643 ms before, 324–405 ms after.
- Formatting 10,000 whole-rupee values in Node: 199 ms before, 4 ms after.

These are local query/formatting measurements, not production page-load guarantees. Network speed, hosting load and cold caches affect actual page load.

`python3 tests/delivery_list.py` checks totals, ordering, page clamping, date/status/balance filters and bilty previews against independently aggregated database records. Browser regression suites cover delivery entry, printing, Munshi ledgers, mobile layouts and language switching. Apache configuration syntax was checked with mod_headers and mod_deflate loaded.
