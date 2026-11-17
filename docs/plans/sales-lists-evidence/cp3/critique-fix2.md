# Gate 2 critique: sales-lists checkpoint 3 (Filters and sort), after fix round 2

Scope: the status chips, the date-range menu, the customer picker, the sortable headers and the cards' Sort menu. Tick boxes, Batch actions and row menus (reference only) are later checkpoints and are not findings.

All 24 built shots (12 names, light and dark) were read against the 24 reference shots.

## The fix of this round

The search field is 44 px tall in every shot (1280: y 120 to 164, level with the chips and the range trigger; 900 and 390 the same). It agrees with "toolbar controls 44 px tall" (brief, reference choices confirmed).

## Per screenshot

| Shot | State check | Findings |
|---|---|---|
| all-1280 (light, dark) | VALID: All sales, table, rows, chip All, All dates, All customers, Date sorted descending | nothing found |
| all-mid-900 (light, dark) | VALID: All sales, cards, toolbar order search, chips, range, customer, Sort | nothing found |
| all-phone-390 (light, dark) | VALID: All sales, cards, three toolbar rows (search; chips that scroll; range and customer) | nothing found |
| invoices-1280 (light, dark) | VALID: Invoices, table, Invoices chips, Date sorted descending | nothing found |
| invoices-phone-390 (light, dark) | VALID: Invoices, cards with "Due <date>", three toolbar rows | nothing found |
| invoices-sorted-1280 (light, dark) | VALID: No. header with the up arrow, drafts ("—") first, then 1001 upward | nothing found |
| payments-phone-390 (light, dark) | VALID: Payments (Receive payment, chips All / Applied / Credit left / Draft / Void), cards | nothing found |
| sort-menu-phone-390 (light, dark) | VALID: Sort menu open, ten items (Date, No., Due date, Balance, Total, each in both directions), check on the chosen item | nothing found |
| range-menu-1280 (light, dark) | VALID: range menu open, five presets then All dates, check on All dates | nothing found |
| customer-picker-1280 (light, dark) | VALID: picker open, search field, "All customers" first with the check, customers by name | nothing found |
| no-match-1280 (light, dark) | VALID: chip Overdue, This quarter, Northwind Traders, "No invoices match" with a Clear filters button | nothing found |
| no-match-phone-390 (light, dark) | VALID: same filters, "No invoices match" with Clear filters | nothing found |

The notes already recorded were seen again and are not repeated: the phone Sort trigger at the right edge of row 3; the `px-4` chips that wrap the customer picker at 1280; PickMenu's first-item highlight beside the check; a long customer name that cuts a card's date; the off-screen active tab on payments-phone; the customer trigger's focus ring in no-match-1280.

Differences from the reference that are not findings: the built rows are seeded e2e rows; the built no-match shots have no search text (a filter is set, so the state is the same); the picker lists customers by display name (the spec's order).

Light and dark: all text, badges, chips, menus and the picker are legible in both schemes; the built dark shots agree with the dark reference.

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE
