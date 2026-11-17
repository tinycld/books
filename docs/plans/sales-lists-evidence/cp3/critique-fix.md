# Gate 2 critique, sales-lists checkpoint 3 (after the fix round)

Scope: the status chips, the date-range menu, the customer picker, the sortable headers, the cards' Sort menu. Tick boxes, Batch actions and row menus are not in this checkpoint, so their absence is not a finding. Each shot was read in light and dark, against its reference.

Result: 0 INVALID, 0 BLOCKING, 6 NOTE.

## Fix check: table header

`all-1280`, `invoices-1280`, `invoices-sorted-1280`, `range-menu-1280`, `customer-picker-1280`: the header is one line, about 44 px tall (y 228 to 272), labels centered on the line, the sort arrow on the label's baseline. It agrees with the reference. The fix holds.

## Per screenshot

### all-1280 (light, dark)
State check: valid. All sales, table, chip All, All dates, All customers, `DATE ↓`.
- all-1280: toolbar row 2 — the customer picker is alone on a second row, with empty space to its right — NOTE (known; the reference also puts the customer picker on row 2).

### all-mid-900 (light, dark)
State check: valid. All sales, cards, toolbar order search, chips, range, customer, Sort; no header.
- nothing found.

### all-phone-390 (light, dark)
State check: valid. Three toolbar rows: search, chips (scroll), range + customer + Sort (scroll).
- all-phone-390: toolbar row 3, right edge — only a sliver of the Sort trigger ("S") shows; the Sort menu is hard to find — NOTE (known weak point; the reference shows the same). Also applies to invoices-phone-390, payments-phone-390, no-match-phone-390.
- all-phone-390: first card, line 2 — a long customer name cuts the date ("· No…") — NOTE (card layout of checkpoint 2; the reference truncates the same way).

### invoices-1280 (light, dark)
State check: valid. Invoices, table, default sort, `DATE ↓`, chips All, Open, Overdue, Paid, Draft, Void.
- nothing found (the row-2 customer picker note of all-1280 applies).

### invoices-phone-390 (light, dark)
State check: valid. Invoices cards, three toolbar rows.
- nothing found (the Sort sliver note of all-phone-390 applies).

### invoices-sorted-1280 (light, dark)
State check: valid. `NO. ↑`, drafts ("—") first, then 1001 upward; no arrow on Date.
- nothing found.

### payments-phone-390 (light, dark)
State check: valid. Payments cards, chips All, Applied, Credit left, Draft, Void.
- payments-phone-390: tab strip — the active tab (Payments) is off screen, so no tab reads as active — NOTE (tab strip of checkpoint 2; the reference shows the same).

### sort-menu-phone-390 (light, dark)
State check: valid. Sort menu open on Invoices cards, ten items, check on "Date, newest first", row 3 scrolled to show the Sort trigger.
- nothing found. The menu agrees with the reference in items, order and position.

### range-menu-1280 (light, dark)
State check: valid. Date-range menu open, five presets then All dates, check on All dates.
- range-menu-1280: menu, first item — "This month" has the highlight while "All dates" has the check; two marks compete — NOTE (core `PickMenu` focus highlight; the reference shows the same).

### customer-picker-1280 (light, dark)
State check: valid. Picker open, search field, "All customers" checked, customers by display name, long names end with an ellipsis.
- nothing found.

### no-match-1280 (light, dark)
State check: valid. Search text set, "No invoices match", "Clear filters" core Button.
- no-match-1280: toolbar — the built shot sets only the search text; the reference sets a chip (Overdue), a range (This quarter) and a customer (Northwind Traders). No built shot shows a chosen chip other than All, a chosen range label, or a customer name in the picker trigger, so those looks are not verified by this evidence — NOTE. Also applies to no-match-phone-390.

### no-match-phone-390 (light, dark)
State check: valid. Search text set, "No invoices match", "Clear filters".
- nothing found (the notes of all-phone-390 and no-match-1280 apply).

## Light and dark
All shots are legible in both schemes. Chips, menu triggers, menu panels and the sort arrow use theme tokens with sufficient contrast.

## For gate 3
Nothing visible.
