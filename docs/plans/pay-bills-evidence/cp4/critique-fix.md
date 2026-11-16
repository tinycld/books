# Gate 2 critique, fix round — pay-bills, checkpoint 4 (Bill balance, payments, Pay bill)

Counts are distinct findings: 0 INVALID, 0 BLOCKING, 2 NOTE.

## State check

| Shot | Named state | Shows | Result |
|---|---|---|---|
| bill-1280-light.png | seeded partly paid bill, read view | Bill 1004, badge Partly paid, Balance due $850.00, Payments −$400.00, Payments block with one row | VALID |
| bill-1280-dark.png | same, dark | same | VALID |
| bill-390-light.png | same, phone | same | VALID |
| bill-390-dark.png | same, phone, dark | same | VALID |

## Earlier BLOCKING — closed

- Phone action bar (bill-390-light.png, bill-390-dark.png) — the bar now shows More and Pay bill (primary), as the reference does. The wide bar keeps Pay bill first and primary. Closed.

## Findings

### bill-1280-light.png
- Totals (right column) — the rule is above Total, and no rule is above Balance due; Total and Balance due have the same weight. The reference puts the rule above Balance due, so Balance due reads as the result of Total less Payments. Balance due is still the last line and bold — NOTE (carried, not changed)
- Payments block (left column, below Attachments) — the block is below the attachment drop area, far from the totals line "Payments −$400.00" that it explains. The reference shows isolated parts, so the position is not a reference decision — NOTE (carried, not changed)
- Delivered and correct: big figure BALANCE DUE $850.00; badge Partly paid in warning tone; totals line "Payments −$400.00" above Balance due; row "Bill payment 1001 · Sep 15, 2026 · $400.00" as a link; Pay bill primary in the action bar.

### bill-1280-dark.png
- Same two NOTEs as bill-1280-light.png (counted once). No legibility problem: badge, link, figures and muted labels are readable.

### bill-390-light.png
- Same two NOTEs (counted once). No other finding.
- Delivered and correct: Balance due under the title, badge, totals line, Payments row on one line with no wrap, bar More + Pay bill (primary).

### bill-390-dark.png
- Same two NOTEs (counted once). No legibility problem.

## Not findings
- Vendor is plain text in the built header card (a link in the reference), and the card has Terms and Mailing address: the existing bill read view, not this checkpoint's additions.
- More in the wide bar (not in the reference): the audit history row of added item D2.
- Line table and Attachments look: out of scope by the Gates line.
- Wide bar order More · Pay bill · Edit · Void · Copy · View journal entry: More is to the left of the primary action; Pay bill is the first action and primary.

## For gate 3
- Back link, all four shots — the label is now "Bill payment" (it was "Journal entries"). This agrees with the shots' origin (the bill payment's read view) and with added item D1. A screenshot cannot show the target; check that Back leads to that bill payment.
- Phone bar — check that Edit, Void, Copy and View journal entry are in More at 390.
