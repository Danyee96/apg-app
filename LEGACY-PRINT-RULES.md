# Verified original goods-print rules

Evidence reviewed 2 November 2026 from the retained PTech Oracle Forms/Reports files and the recovered `legacy_*` tables. This document records financial field sources and formulas; it does not claim pixel-identical reproduction of the old report renderer.

## Delivery receipt and cash summary

`Forms/F002.fmx` binds **Print Rec Slip** to `Reports/R150.rep`, with `inh_no` set to the selected delivery header. The same form also references `R157.rep`, which includes cash received and discounts.

Both reports select delivery rows under the selected `INH.INHNO`, joined to the original account through `PLCODE/PMCODE/PWCODE`. They do not obtain their charge amounts from the original incoming row linked by `DNO`.

| Value | Original source/formula |
| --- | --- |
| Document number | Delivery header `INH.DOCNO` |
| Document date | `INH.DATED` |
| Receipt date / receiver / CNIC | `INH.REC_DATE1`, `REC_NAME1`, `REC_CNIC1` |
| Bilty number / quantity / party | Delivery `IND.BILLTYNO`, `QTY`, `PARTY_TO` |
| Bilty total (`BTOTAL`) | `NVL(BILLTY_AMT,0) + NVL(GODOWN_CHG,0)` |
| Loading | Delivery `IND.LOADING_AMT` |
| Suzuki kiraya | Delivery `IND.SUZUKI_KIRAYA` |
| Service total (`STOTAL`, R157) | `NVL(SUZUKI_KIRAYA,0) + NVL(LOADING_AMT,0)` |
| Total (`CF_SUBTOTAL`, R157) | `BTOTAL + STOTAL` |
| Discount (`TDISC`, R157) | Delivery `IND.DISC_AMT`, summed separately |
| Bilty cash (`BREC`, R157) | Delivery `IND.REC_BAMT` |
| Services cash (`SREC`, R157) | Delivery `IND.REC_SAMT` |
| Cash received (`CF_RECEIVED`, R157) | Sum of bilty cash plus sum of services cash |

The charge receipt lists the bilty, loading and Suzuki amounts separately. The cash-summary variant adds the actual cash and discounts. A discount is not cash received; an advance is not subtracted by either of these report queries. No unverified net-due formula has been introduced.

For imported deliveries the API now supplies a read-only `print_header` and `print_items` from these original records, preserving the original report's account join and detail order. For newly created deliveries, the current item charges and recorded delivery cash supply the equivalent fields. The existing operational rows are not rewritten.

## Incoming and booking sheets

- `R071.rep` calculates each incoming bilty total from bilty amount plus godown, rather than the nullable stored `IND.TOTAL` field.
- Its `CF_BALFORMULA` calculates **sum of bilty amounts minus truck amount**. Godown is not added to this truck balance.
- `Forms/F133.fmx` binds Booking printing to `R156.rep`. Its total formula uses loading, rent, bilty amount and local charges. The original booking query selects destination address and individual charge fields; truck amount and commission are not part of that printed total.
- The thermal builders now calculate incoming/booking print totals from these fields, including imported rows whose stored total was null/zero. This change is restricted to print presentation; stored totals and accounting postings are not migrated.

## Findings and verification limits

The initial working database has 123,034 imported incoming items and 7,083 booking items with a zero stored total despite nonzero charge fields. Among 123,457 linked original delivery lines, delivery loading differs from the linked arrival in 25,809 rows and Suzuki differs in 61,727 rows. Reading the incoming item alone therefore cannot reproduce the original delivery slip values.

The old receipt queries display `WORKING.UTITLE`, using the original Urdu font encoding. The new slip retains readable account names from `WTITLE` and a separate party-to value; old-font Urdu rendering is a separate conversion issue. Monetary source values checked in the recovered goods tables are whole rupees; the app represents them as integer paisa and formats two decimal places.

`tests/legacy_print.py` compares historical receipt output fields with independent queries over the recovered source rows, including receipts where arrival/delivery charges differ and receipts with discounts. Thermal browser/PDF tests additionally check both slip variants and paper widths. Physical printer output remains dependent on the configured device and driver.

## Evidence fingerprints (SHA-256)

- `Forms/F002.fmx`: `f07d4d93c544b004227a0cb3782b29436d2ee06740351cacd29ab8c13005d501`
- `Reports/R150.rep`: `fc16883f58d34fd8039602df18e59fe716cddc3fa0c8adf3fc0188c20be82c7a`
- `Reports/R157.rep`: `e3ab7e77bcbe544f8afde4d6c51ca80aaf76e9aae02137cfe0db46a91c80f01f`
- `Reports/R071.rep`: `7942436129d6a2baecafd58a1e8e6d88e9552fb38b91fb5b77199849b06a0bb6`
- `Reports/R156.rep`: `2229a5d690d29fa86971e745211411036f5e5052f09bdba92f1da52e193e9d64`

Original binaries, screenshots, customer records and credentials remain outside the public repository.
