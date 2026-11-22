# Gate 2 critique: reconcile, checkpoint 3 (Transaction list and clearing)

Scope judged: the toolbar, the result line, the list (table and cards), the empty and no-match states, the read-only list. Not judged (checkpoint 4): the hint line, the header's action buttons, the phone Finish bar. The band is checkpoint 2.

Shots read: all 40 built shots (10 names, 390 and 1280, light and dark). Reference shots read: all 20 light ones, and the dark ones of `work` (390, 1280) and `batch-busy` (390, 1280). The other 16 dark reference shots were not read; the built dark shots were compared with the light reference for structure and judged on their own for legibility.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## State check

| Shot | 1280 light | 1280 dark | 390 light | 390 dark | Shows |
|---|---|---|---|---|---|
| work | valid | valid | valid | valid | Populated list, All tab, no filter, header box mixed. Rows are the seed's 2020 "Daily sweep" lines. |
| filtered | valid | valid | valid | valid | Deposits tab and the search "Reconcile seed", "Clear filters" link, one cleared row and one row not cleared. |
| no-match | valid | valid | valid | valid | "No transactions match these filters." with the Button "Clear filters". |
| empty | valid | valid | valid | valid | "No transaction on 1010 Business Savings up to Sep 30, 2026 waits to be cleared." |
| read-only | valid | valid | valid | valid | No boxes, no header box, a check mark on the cleared row, filters present. |
| refused | valid | valid | valid | valid | Result line "Journal entry JE-29 is void." in danger color, the row not checked, the band not changed. |
| batch-busy | valid | valid | valid | valid | Spinner in place of the select-all box, rows dimmed. |
| batch-done | valid | valid | valid | valid | Result line "Cleared 1 transaction.", all boxes checked, header box checked. |
| card | valid | valid | valid | valid | Credit card words (Charges, Payments) in tabs and column headers; charges not signed on the phone. |
| balanced | valid | valid | valid | valid | Rows on both sides, "Clear matched (2)", the matched icon, signed amounts on the phone. |

## Findings

### work (4 shots)
Nothing found. Structure equals the reference: tabs, then search, Show and the toolbar actions on one line; table with the box, Date, Transaction, Payee, Memo, Payment, Deposit; rows 44 high; no sideways scroll. Phone: search on its own line, the bar with the select-all box, "Clear all shown" and "Oldest first", cards 64 high.

### filtered (4 shots)
Nothing found. The cleared row has the secondary surface in light and dark; the memo truncates with an ellipsis.

### no-match (4 shots)
Nothing found.

### empty (4 shots)
Nothing found.

### read-only (4 shots)
Nothing found. The check mark is in the box column on wide and on the phone, as in the reference.

### refused (4 shots)
Nothing found.

### batch-busy (4 shots)
- batch-busy-1280-dark, batch-busy-390-dark: the select-all cell (list header, phone bar) — the spinner is almost not visible on the dark background (a dark arc under the disabled dimming). The reference has the same look. — NOTE
- batch-busy-390-light, batch-busy-390-dark: the phone bar above the cards — the label "Clear all shown" goes away while the batch runs, so the bar shows only a spinner and "Oldest first". The reference does the same; a dimmed label would keep the bar stable and say what runs. — NOTE

### batch-done (4 shots)
Nothing found.

### card (4 shots)
- card-390-light, card-390-dark (also balanced-390-*): card line one, "Expense 1003  · Office Supply World" — the gap before "·" is wider than the gap after it. The reference has the same gap. — NOTE

### balanced (4 shots)
- balanced-1280-light, balanced-1280-dark: Transaction cell of the row of Oct 20, 2026 — "Journal entry JE…" cuts the entry number when the row has the matched icon, while the Payee cell beside it is empty. With numbers of the form "JE-21", each matched journal entry loses its number at this width. The reference cuts the same cell ("Journal entry 10…") and the column minimum of 150 is in the spec, so this is not a rule break. — NOTE

## Coverage (not findings)

- The built `work` shots show only rows that are not cleared (the seed's 260 "Daily sweep" lines sort first). The cleared row and the two-sided list are shown by `filtered` and `balanced`.
- No built shot shows "Clear matched" disabled while a batch runs (the reference `batch-busy` shows it): the seeded account of the built `batch-busy` shot has no matched row.
- No built shot shows "Clear filters" and "Clear matched" together at 390 (the reference `filtered-390` puts "Clear matched" on a third toolbar line).

## For gate 3

Nothing visible.
