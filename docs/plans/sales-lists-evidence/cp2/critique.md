# Design critique: sales-lists, checkpoint 2 (Sales tabs, rows and states)

Scope: the Delivers line (sidebar entry, six list routes, header, tabs, New button, search field, table or cards, loading / empty / error states, document beside a 320 px column). Chips, date range, customer picker, Sort, tick boxes, Batch actions and row menus are later checkpoints and are not findings.

All 44 built shots were read (22 shots, light and dark). Light and dark of each shot show the same layout; a finding applies to both schemes unless it names one.

Result: 0 INVALID, 0 BLOCKING, 6 NOTE.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| all-1280 | valid | valid | All sales table, 7 columns, rows |
| all-mid-900 | valid | valid | All sales cards, no table |
| all-phone-390 | valid | valid | All sales cards, phone shell |
| invoices-1280 | valid | valid | Invoices table, "New invoice" |
| invoices-phone-390 | valid | valid | Invoices cards |
| estimates-1280 | valid | valid | Estimates table, "New estimate" |
| sales-receipts-1280 | valid | valid | Sales receipts table |
| payments-1280 | valid | valid | Payments table, "Receive payment", header "Amount" |
| payments-phone-390 | valid | valid | Payments cards |
| credit-memos-1280 | valid | valid | Credit memos table, positive Total and Balance |
| beside-1440 | valid | valid | 320 px names column, open row marked, invoice read view beside it |
| loading-1280 | valid | valid | Header, tabs, LoadingState |
| loading-phone-390 | valid | valid | Same on phone |
| empty-1280 | valid | valid | "No invoices yet" + New invoice button |
| empty-phone-390 | valid | valid | Same on phone |
| empty-all-1280 | valid | valid | "No sales transactions yet" + New button |
| no-match-1280 | valid | valid | Search text set, "No invoices match" + Clear filters |
| no-match-phone-390 | valid | valid | Same on phone |
| error-1280 | valid | valid | Banner "Sales transactions could not load." + Retry |
| error-phone-390 | valid | valid | Same on phone |
| new-menu-1280 | valid | valid | New menu open, five items |
| new-menu-phone-390 | valid | valid | New menu as a sheet, five items |

## Findings

### all-1280, invoices-1280, estimates-1280, sales-receipts-1280, payments-1280, credit-memos-1280
- all shots: search field, below the tab strip — the field is about 40 px tall (y 120 to 160); the reference field is 44 px (y 120 to 164), and the brief's confirmed reference choices say "toolbar controls 44 px tall". The checkpoint's Do 5 says the field "keeps its own height", so this is not blocking here. When checkpoint 3 puts the 44 px chips beside it, the row will hold two heights. — NOTE
- Otherwise nothing found: columns match the spec table of each tab, header and cells align, "—" draws for empty cells, the credit memo amount shows the typographic minus on All sales and positive on Credit memos, long customer and memo text ends with an ellipsis, no sideways scroll.

### all-mid-900
- nothing found. Cards replace the table, as in the reference.

### all-phone-390
- cards 2, 3, 7 ("St. Jude Community Hospital Foundation of the Gr…") and card 1 ("… · No…"), second line — a long customer name pushes the date out of the line; the date is cut or not shown. The reference cuts the line the same way, so no reference decision is lost, but the list's sort key (the date) is the part that disappears. A line that truncates only the customer and keeps the date would read better. — NOTE
- The shell's New FAB covers the amount and badge of one card (Credit memo 1001). The brief confirms "the shell's New FAB stays on the list routes"; not a finding.

### invoices-phone-390, payments-phone-390
- nothing found (search field height: see the first note).

### beside-1440
- document pane, bottom action bar — the read view's actions wrap: More, Edit, Void, Copy, Create credit memo, View journal entry on one line and "Download PDF" alone on a second line. The pane is about 795 px wide here, narrower than the same read view as a page at 1280. The action bar belongs to the read view (spec non-goal: "No change to the behavior of a document form or read view"), so no rule is broken, but a single orphan button looks unfinished. — NOTE
- names column: 320 px wide, title, New invoice, tab strip (scrolls sideways) and search field kept, two-line rows, the open row (1002 · Northwind Traders) marked with the accent background in light and dark. Matches the reference decision. Nothing else found.

### loading-1280, loading-phone-390
- nothing found.

### empty-1280, empty-phone-390
- nothing found. The action is a filled core Button (lesson: "Empty-state actions use a core Button").

### empty-all-1280
- empty state, "New" button — it opens the same five-item menu as the header's "New ⌄" but has no chevron, so it reads as a direct action. The reference draws it the same way. — NOTE

### no-match-1280, no-match-phone-390
- nothing found.

### error-1280, error-phone-390
- banner, top edge — the banner touches the tab strip's bottom line (no gap above it), while the search field in the other states has a 12 px gap there. The reference has the same flush edge. — NOTE
- The search field does not draw in the error state; the reference's error shot also has no toolbar. Not a finding.

### new-menu-1280, new-menu-phone-390
- nothing found. Menu at 1280 and sheet at 390 match the reference; five items in the spec's order.

### Dark scheme, all row shots
- status column, Draft / Void / Closed / Expired badges — the muted tone has low contrast on the dark background (label and outline are both faint) next to the clear Open / Overdue / Paid badges. It is the shared `StatusBadge` muted tone and the reference shows the same. — NOTE

## Not judged in this checkpoint
- The gate-2 weak point of the brief (the third toolbar row scrolling sideways at 390) cannot be judged: the date range, customer picker and Sort are not built yet.

## For gate 3
- none visible.
