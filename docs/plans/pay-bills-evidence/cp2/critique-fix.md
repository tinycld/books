# Gate 2 critique after the fix round: pay-bills, checkpoint 2 (Pay Bills screen and save)

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

All 25 built shots were read with the 23 reference shots. Data differences are not findings. The NOTEs of the first critique (`critique.md`) are not repeated and not counted; those that the fix round did not touch (totals alignment, "Total" label column, hyphen as minus sign, row height without a vendor bill no., loading-390 figure position) look the same as before.

## State check

| Shot | Verdict | What it shows |
|---|---|---|
| populated-1280-light / -dark | VALID | Paid from picked, balance line, Check, start 1050, 7 rows ticked, totals row, check plan, balance lines |
| populated-390-light / -dark | VALID | Same state as cards, stacked band, figure under the title, sort chip, phone bar |
| overdue-1280-light | VALID | Due: Overdue, 4 shown rows paid, "3 selected bills are hidden by the filter", totals row: Open balance of shown rows, Payment of all paid rows |
| overdue-390-light | VALID | Due: Overdue, 4 cards ticked. The summary and the hidden note are below the 1900 px frame (the note at 390 is in filtered-empty-390) |
| refused-1280-light / -dark | VALID | Server line refusal under a row cell (danger border and text), values kept, no tooltip |
| refused-390-light / -dark | VALID | Same refusal under the card input, no tooltip |
| card-390-light | VALID | Cards with "Pay all", all ticked |
| filtered-1280-light / -390-light | VALID | Vendor filter "Office Supply World", 2 rows |
| filtered-empty-1280-light / -390-light | VALID | "No open bills match these filters." with "Clear filters", "0 open bills", summary with "7 selected bills are hidden by the filter", balance lines |
| empty-1280-light / -dark, empty-390-light / -dark | VALID | "No open bills. Bills you post show here until they are paid." with New bill |
| loading-1280-light / -390-light | VALID | Static skeleton: band and three rows |
| error-1280-light / -390-light | VALID | "Books could not load the open bills." with Retry |
| no-access-1280-light / -390-light | VALID | "You need bookkeeper access to pay bills" |

## Findings

### Fix round items
- overdue-1280-light: the hidden note is now shown, muted, under the selected line. It agrees with the reference `overdue` (position, tone). Nothing found.
- refused-*: the tooltip is gone in all four shots. Nothing found.
- filtered-empty-1280-light, filtered-empty-390-light: agree with the reference `filtered-*` (text, Button "Clear filters", count at the right, summary and balance lines below). The long vendor name in the chip truncates with an ellipsis inside the chip. Nothing found.

### populated-390-light, populated-390-dark (also card-390, overdue-390, refused-390, filtered-390, filtered-empty-390, empty-390)
- populated-390: filter area — with the sort chip, the Due row is full, and the count ("7 open bills") moves to a line of its own. The filter area is now three lines (Vendor; Due + Sort; count) before the first card. The reference had the count at the right of the Due chip. The count is still at the right, and the sort chip has a basis (lesson 46), so this is not a lost decision. — NOTE
- populated-390: sort chip — the label has a sort arrow ("Sort: Due date ↑") and then the menu chevron at the chip end; two small glyphs of different meaning are near each other. Legible in light and dark. — NOTE

### empty-390-light, empty-390-dark, filtered-empty-390-light
- empty-390: filter area — the sort chip shows when there are no cards to sort ("0 open bills"). The wide layout has no sort control in these states (no grid header). — NOTE

### All other shots
- populated-1280-light / -dark, overdue-390-light, refused-1280 / -390 (light and dark), card-390-light, filtered-1280-light, filtered-390-light, empty-1280-light / -dark, loading-*, error-*, no-access-*: nothing found beyond the recorded NOTEs of the first critique.

## For gate 3
- refused-* (all four): the faked refusal is keyed `lines.0`, and its text shows under the Bill 1008 row/card (Summit IT Services, the second Summit row in list order: Bill 1003 is Nov 27, Bill 1008 is Dec 15). The plan says a payment's lines are in list position order, so `lines.0` of the Summit payment would be Bill 1003. Find out whether the capture's `batchRefusal` refused a different operation (the match `/books_bill_payments/` can also match a `books_bill_payment_lines` operation) or the line-index mapping in `payBillsRefusalErrors` is off by one.
