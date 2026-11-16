# Design critique: receive-payment, checkpoint 5

Result: 0 INVALID, 0 BLOCKING, 5 NOTE

## State check

| Shot | State shown | Result |
|---|---|---|
| invoice-1280-light | Read view of posted invoice 1001, partly paid (badge, balance, Payments row, Payments block, Receive payment) | VALID |
| invoice-1280-dark | Same, dark | VALID |
| invoice-390-light | Same, phone | VALID |
| invoice-390-dark | Same, phone, dark | VALID |
| customer-1280-light | Customer page, Transactions tab, invoice Partly paid and a Payment row | VALID |
| customer-1280-dark | Same, dark | VALID |
| customer-390-light | Same, phone cards | VALID |
| customer-390-dark | Same, phone cards, dark | VALID |

## Spec items seen in the shots

- Badge "Partly paid", warning tone: present at both widths and both schemes.
- Big figure "Balance due $750.00" is the open balance, not the total ($1,250.00).
- Totals: "Payments −$500.00" above "Balance due $750.00".
- Payments block: "Payment 1002 · Oct 25, 2026 · $500.00", one link, as the reference.
- Receive payment action: present at 1280.
- Customer page: Overdue $750.00 (the balance), chip "Payments", type "Payment", status "Applied" (success), invoice "Partly paid" (warning).

## Findings

### invoice-1280-light, invoice-1280-dark

- invoice-1280: action bar — Receive payment is the first and primary (filled) button; Edit is secondary. The reference shows Edit primary and Receive payment second. The plan puts `receive_payment` before `edit`, so the order is a plan decision; the primary emphasis is the part that differs from the reference. — NOTE
- invoice-1280: totals — no rule above the Balance due row. The reference has a rule above Total and a second rule above Balance due, which sets the result apart from the Payments row. — NOTE
- invoice-1280: totals — the totals values end about 13 px left of the Amount column values (1191 against 1204), and the totals rule ends at the Amount column edge. The new Payments and Balance due rows follow the rows above them, so this is probably the existing panel, not this slice. — NOTE

### invoice-390-light, invoice-390-dark

- invoice-390: action bar — the bar shows More and Edit (primary); Receive payment is not visible. This agrees with the reference, but the primary action is Edit here and Receive payment at 1280. The emphasis is not the same at the two widths. — NOTE
- invoice-390: totals — same missing rule above Balance due as at 1280 (counted above).
- Payments block, badge, link color: legible in light and dark. Nothing more found.

### customer-1280-light, customer-1280-dark

Nothing found.

### customer-390-light, customer-390-dark

- customer-390: filter chips — the new Payments chip is cut off at the right edge; only a sliver of it shows. The cut chip does signal that the row scrolls, but the new filter cannot be read without a scroll. — NOTE

## For gate 3

- At 390, confirm that More on the invoice read view holds Receive payment (lesson 46: a touch control for every action of the wide layout).
- At 390, confirm that the chip row of the Transactions tab scrolls to the Payments chip.
