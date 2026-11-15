# Gate 2 critique: receive-payment, checkpoint 2

Round: shots captured again after the fix round (money inputs, grid min widths, read view figures).

Scope: the wide form and the read view. Not judged (later checkpoints): Find invoice no. (cp3), phone cards (cp3), Edit and Void on the read view (cp4).

Result: 0 INVALID, 0 BLOCKING, 7 NOTE.

## State check

| Shot | Verdict | Shows |
|---|---|---|
| populated-1280-light / dark | VALID | Customer chosen, two rows ticked, Amount received $3,448.87 |
| empty-1280-light / dark | VALID | No customer, "Choose a customer to see their open invoices." |
| over-1280-light / dark | VALID | Rows add to $3,448.87 against $100.00, refusal line under the list |
| credit-1280-light / dark | VALID | $5,000.00 received, Amount to credit $1,551.13 with the note |
| no-open-1280-light / dark | VALID | "Northwind Traders has no open invoices. …", Amount to apply $0.00 |
| read-1280-light / dark | VALID | Posted Payment 1002, one applied invoice, View journal entry |
| read-credit-1280-light / dark | VALID | Posted Payment 1003, all credit: no applied table, Amount applied $0.00, Amount credited $250.00 with the note |
| loading-1280-light | VALID | Form with a three-row skeleton in the list |
| error-1280-light | VALID | "Books could not load this payment." with Retry |
| no-access-1280-light | VALID | "You need bookkeeper access to receive payments" |

## Fixed since the last round

- Amount received with no value: "0.00" is now drawn as a grey placeholder (empty, no-open, loading), the same tone as "Check or reference no.". It agrees with the header figure "—".

## Findings

- read-1280-light, read-1280-dark, read-credit-1280-light, read-credit-1280-dark: detail band — the Customer link (y≈189) is about 12 px lower than the Payment date and Payment values (y≈177), and the band keeps about 24 px of empty space below. The reference has the three values on one line in a shorter band. Not changed by the fix round. — NOTE
- populated, empty, over, credit, no-open, loading (all schemes): header band — the divider between row 1 and row 2 ends at x≈1030, but Deposit to in row 2 ends at x≈1088, so row 2 runs past the divider and under the Amount received column. The reference divider spans the full band. Not changed. — NOTE
- populated-1280-* against credit-1280-*: Amount received input — a followed amount shows a group separator ("3,448.87"), a typed amount shows none ("5000.00"). Row cells show "1,337.10". The same field has two formats. Not changed. — NOTE
- populated, empty, over, credit, no-open, loading (all schemes): header — a "Draft" badge shows on an unsaved new payment. The reference shows the badge only on "Draft payment". The spec allows a badge ("title …, status badge"). — NOTE
- loading-1280-light: outstanding list — the skeleton bars are a solid dark slate, heavier than the content they replace, and the last block of each row is as tall as an input. No header row and no totals, so the list jumps when rows arrive. (The reference has the same weight.) — NOTE
- populated, over, credit, no-open (all schemes): totals — the total values end at x≈1264, 8 px to the right of the Payment column's right edge (x≈1256). Spec: "right-aligned under the Payment column". The reference has the same offset. — NOTE
- read-credit-1280-light, read-credit-1280-dark: action bar — the shot holds a hover state: the tooltip "View journal entry j" shows above the button and the button has its hover fill. This is a capture artifact, not a layout defect. The key in the tooltip is a lower-case "j"; the spec key map writes "J". — NOTE

Nothing found: error-1280-light, no-access-1280-light.

read-credit: with no applied invoices the screen has no "Applied to" heading and no empty table; the totals sit directly under the band, right-aligned, and the stamp follows. This reads as complete. The spec has no text for this case, so no finding.

Dark mode: all text, links, the Overdue tone, the refusal line, the placeholder "0.00" and the credit note are legible in every dark shot.

Not shown by any built shot (cannot judge): the Deposit to trigger with the long "Undeposited funds (created when you post)" label (it wraps to two lines in the reference), the per-cell "More than the open balance of …" error, a partly ticked header tick box, and the grid at a width near its minimum (832 px), which the fix round changed.

## For gate 3

- Amount received shows "3,448.87" with a group separator when it follows the rows. Check that this text parses to cents (schema and `moneyInputCents`) and survives a focus and re-type.
- The read view's View journal entry tooltip shows the key as "j". Check that it agrees with the ⇧? sheet entry.
