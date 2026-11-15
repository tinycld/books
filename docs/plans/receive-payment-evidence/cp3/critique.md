# Gate 2 critique: receive-payment, checkpoint 3 (phone cards and invoice lookup)

Result: 0 INVALID, 0 BLOCKING, 7 NOTE.

Scope judged: the outstanding cards, the applied-invoice cards, Find invoice no., and the phone band stack (Amount received last). The header, the action bar and the read actions (Edit, Void) belong to other checkpoints.

Reference shots read for comparison: populated (light, dark), empty, over, credit, no-open, find-miss (1280, 390), read (light, dark), read-credit, all light unless named. The dark references of empty, over, credit, no-open and read-credit were not opened; the built dark shots were judged on their own.

## State check

| Shot | State shown | Valid |
|---|---|---|
| populated-390-light / dark | Customer chosen, two cards, both ticked, Amount received follows ($3,448.87) | yes |
| empty-390-light / dark | No customer, "Choose a customer to see their open invoices." and the find field | yes |
| over-390-light / dark | Amount 100.00, card 1 at zero, card 2 at 2,111.77, sum refusal under the totals | yes (see note 2) |
| credit-390-light / dark | Amount 5000.00, both cards ticked, Amount to credit $1,551.13 with the credit note | yes |
| no-open-390-light / dark | Northwind Traders, the no-open-invoices text, Amount to apply $0.00 | yes |
| find-miss-1280-light | No customer, 1099 in the find field, "No open invoice 1099" under it | yes |
| find-miss-390-light | Same at 390 | yes |
| read-390-light / dark | Posted Payment 1002, one applied-invoice card, Amount applied | yes |
| read-credit-390-light / dark | Posted Payment 1003, nothing applied, Amount credited $250.00 with the note | yes (see note 5) |

The seeded customer has two open invoices (the reference fixture has four), so each list shows two cards. That is real data, not a finding.

## Findings

### populated-390-light / dark
- populated-390: card first line — the link reads "Invoice 1005" with no invoice date; the reference reads "Invoice 1006 · Sep 2, 2026". The spec text for the phone card is `tick box and "Invoice 1004" on the first line`, so the build follows the spec. The same applies to the read cards. — NOTE (1)
- populated-390: card first line — the tick box is about 10 px to the right of the left edge of the due date, the labels and the Payment input. The reference has the same inset. — NOTE (7)
- Otherwise nothing found. The card order is as the spec: tick box and invoice, due date (danger tone with "Overdue"), Original / Open balance pair, full-width right-aligned Payment input. Amount received is last in the band. Both schemes are legible.

### empty-390-light / dark
- nothing found.

### over-390-light / dark
- over-390: cards — the shot shows the sum refusal only. The reference also shows a card with the row refusal (red input border and "More than the open balance of $750.00" under the Payment input) and a card with a long invoice number that truncates. No built shot shows a card with a row refusal or a truncated long number, so those two card states have no evidence. — NOTE (2)
- The sum refusal wraps to two lines at 390, left-aligned under the totals, as the reference. Legible in dark.

### credit-390-light / dark
- credit-390: Amount received input — a typed amount shows "5000.00", but a followed amount (populated shot) shows "3,448.87" and the card inputs show "1,337.10". The grouping differs between a typed and a computed value on the same form. The reference shows the same ("1243.56"). — NOTE (3)
- Totals block: Amount to apply, the rule, bold Amount to credit and the note match the reference and the spec ("border-t border-border font-semibold").

### no-open-390-light / dark
- nothing found.

### find-miss-1280-light
- nothing found. The miss text is under the field in the danger tone; the field keeps a bounded width; "Choose a customer…" stays under it.

### find-miss-390-light
- nothing found.

### read-390-light / dark
- read-390: detail band — Customer and Payment date are side by side, and the customer link sits about 12 px lower than the date value, so the two values do not share a baseline. The reference stacks Customer, Payment date and Payment in one column. A long customer name ("Harborview Hospitality Group") can also crowd the date at this width. The read band is not on this checkpoint's Delivers line (checkpoint 2 owns it), so this is for the driver to route. — NOTE (4)
- Applied card: invoice link, "Due Oct 6, 2026", Original / Applied pair, then Amount applied. Matches the reference structure. Both schemes are legible.

### read-credit-390-light / dark
- read-credit-390: action bar — the shot holds the pointer over "View journal entry", so the button is in its hover state and the tooltip "View journal entry j" covers the bar edge. Capture artifact: move the pointer away (or click `payment-title`) before the shot. — NOTE (5)
- read-credit-390: Payment line — with no method and no reference the text starts in lower case: "deposited to 1200 Undeposited funds". It comes from the shared `paymentText`, outside this checkpoint. — NOTE (6)
- No "Applied to" heading when nothing is applied; the totals follow the band directly. That reads cleanly.

## For gate 3
- Nothing visible.
