# Design critique: purchase-lists, checkpoint 3

Scope: the Delivers line of checkpoint 3 (sidebar entry, six list routes, header, tabs, New, table, cards, the 320 px column, search, chips, date range, vendor picker, sort, loading / empty / error states). Tick boxes, Batch actions and row menus (checkpoint 4) are not judged. The table minimum is 840 (ledger).

All 52 built files were read (26 shots, light and dark) and compared with the reference file of the same name.

Result: 1 INVALID, 0 BLOCKING, 4 NOTE.

## Per screenshot

Each line covers the light and the dark file unless it names one.

- `all-1280`: state check OK (All purchases, table, populated). Columns Date, Type, No., Vendor, Category, Amount, Status; vendor credits negative with a typographic minus; "—" for empty cells; header and cells aligned; Expenses entry active between Sales and Lists. Nothing found.
- `all-mid-900`: state check OK (cards at 900: list width 661 is below 840; no header; Sort menu in the toolbar). Nothing found (the clipped placeholder "Number, referenc" is the same in the reference).
- `all-phone-390`: state check OK (cards, search row, chip row, range + vendor row). Finding N1.
- `bills-1280`: state check OK (Date, No., Vendor, Due date, Balance, Total, Status; no Category). Nothing found.
- `bills-phone-390`: state check OK (number · vendor, amount; date · "Due <date>", badge). Finding N1.
- `bills-sorted-1280`: state check OK (Due date ascending, Aug 8 to Dec 10; arrow on DUE DATE, none on DATE). Nothing found.
- `expenses-1280`: state check OK (Date, No., Vendor, Category, Total, Status; "Split" in muted text, legible in dark). Nothing found.
- `expenses-phone-390`: state check OK. No category on a card. Finding N1.
- `bill-payments-1280`: state check OK (Reference no. column, "Pay bills" button, chips All / Paid / Void). Nothing found.
- `vendor-credits-1280`: state check OK (Balance and Total positive). Finding N4.
- `vendor-refunds-1280`: state check OK. Finding N2.
- `beside-1440-dark`: state check OK (320 px column of two-line rows, search only, row 1008 marked, the real bill read view beside it). Finding N3.
- `beside-1440-light`: **INVALID**. It shows the 320 px column with row 1008 marked, but the document pane is fully blank (no read view, no loading state, no error). The dark file of the same shot shows the read view. Not critiqued. See "For gate 3".
- `new-menu-1280`: state check OK (five items in order: New bill, Pay bills, New expense, New vendor credit, New vendor refund). Nothing found.
- `new-menu-phone-390`: state check OK (sheet "New" with the five items). Nothing found.
- `loading-1280`, `loading-phone-390`: state check OK (toolbar plus centered spinner). Nothing found.
- `empty-1280`, `empty-phone-390`: state check OK ("No bills yet" + "New bill"). Nothing found.
- `empty-all-1280`: state check OK ("No purchase transactions yet" + "New"). Nothing found.
- `error-1280`, `error-phone-390`: state check OK (banner "Purchase transactions could not load." + Retry). Nothing found.
- `no-match-1280`, `no-match-phone-390`: state check OK ("No bills match" + "Clear filters"; Draft chip and search text set). Nothing found.
- `range-menu-1280`: state check OK (This month, Last month, This quarter, This fiscal year, Last fiscal year, All dates ticked). Nothing found.
- `vendor-picker-1280`: state check OK (search field, "All vendors" ticked first, vendor names). Nothing found.
- `sort-menu-phone-390`: state check OK (Date, No., Due date, Balance, Total, each in both directions; current one ticked). Nothing found.

## Findings

- N1. `all-phone-390`, `bills-phone-390`, `expenses-phone-390` (light and dark): bottom right, card under the FAB — the FAB hides the card's amount ("$24.00", "$189.50", "$1,280.00"). The reference has the same overlap, but there the row menu slot moves the amount left and part of it stays visible; with no trailing slot in this checkpoint the full amount is hidden — NOTE.
- N2. `vendor-refunds-1280` (light and dark): toolbar, search field — the placeholder is clipped mid-word ("Number, reference or mem") because the field takes the least width of the row. The reference has the same clip — NOTE.
- N3. `beside-1440-dark`: document pane, top left — the read view shows a "← Expenses" back link while the list is visible beside it. The reference stand-in has no back link — NOTE.
- N4. `all-1280`, `bills-1280`, `vendor-credits-1280` and every state shot of Bills at 1280 (light and dark): toolbar, second row — the vendor picker is alone on a second toolbar row (the reference has Batch actions beside it; that button arrives in checkpoint 4). Until then the row holds one control — NOTE.

## For gate 3

- `beside-1440-light`: the document pane beside the list is blank after the row press (the capture waits only for `purchases-name-row-plbill000001057`). Either the capture is early and the pane draws no loading state while the bill loads, or the read view does not draw in this run. The dark run shows the read view.
