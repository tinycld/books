# Gate 2 critique: receive-payment checkpoint 3, re-capture after the "Pay all" fix

Scope: the six re-captured 390 shots (`populated`, `over`, `credit`, light and dark). Judged against the checkpoint 3 Delivers line (phone cards, Find invoice no.) and the matching reference shots.

## State check

| Shot | State shown | Result |
|---|---|---|
| populated-390-light | Customer chosen, two invoice cards ticked, Amount received follows ($3,448.87) | VALID |
| populated-390-dark | Same | VALID |
| over-390-light | Amount received $100.00, one card paid $2,111.77, refusal line under the totals | VALID |
| over-390-dark | Same | VALID |
| credit-390-light | Amount received $5,000.00, Amount to credit $1,551.13 with the "Kept as a credit" note | VALID |
| credit-390-dark | Same | VALID |

## Findings

### populated-390-light
- populated-390-light: "Pay all" row, above the first card — the tick box is not on a line with the card tick boxes (about 12 px to the left of them) and not on the left edge of the section (about 22 px to the right of it). It reads as a third, unrelated indent. — NOTE
- populated-390-light: Amount received input against the card Payment inputs — the same value shows with a thousands separator here ("3,448.87", it follows the rows) but a typed value shows without one ("5000.00" in the credit shot), while the card inputs always show one ("1,337.10"). — NOTE (the band is checkpoint 2; the reference also shows "1243.56")

### populated-390-dark
- populated-390-dark: "Pay all" row — the same tick box misalignment as light. — NOTE
- Legibility: nothing found.

### over-390-light
- over-390-light: "Pay all" row — the same tick box misalignment. The mixed (dash) state is clear. — NOTE
- Nothing else found. The refusal line wraps to two lines with "received" alone, as in the reference.

### over-390-dark
- over-390-dark: card "Invoice 1005", tick box — the border of the unticked box is faint against the card surface. — NOTE (the reference shows the same core checkbox)
- over-390-dark: "Pay all" row — the same tick box misalignment. — NOTE

### credit-390-light
- credit-390-light: "Pay all" row — the same tick box misalignment. — NOTE
- credit-390-light: Amount received input — "5000.00" with no thousands separator beside "1,337.10" and "2,111.77" in the cards. — NOTE (see populated-390-light)

### credit-390-dark
- credit-390-dark: the same two NOTEs as credit-390-light. Legibility: nothing found.

## Checked and not findings

- Card first line shows "Invoice 1005" without the invoice date; the reference shows "Invoice 1006 · Sep 2, 2026". The spec decides: "tick box and "Invoice 1004" on the first line". Not a finding.
- The "Pay all" control is not in the reference. It supplies the phone path for spec §3.4 "Pay all" (⌥A, also the header tick box); the card structure, the totals and the position of Find invoice no. are kept. Not a finding.
- Card content matches spec §3.3: tick box and invoice link, due date (danger tone with "Overdue"), Original and Open balance as a label-value pair, full-width Payment input.
- Amount received is last in the band (spec §3.2).
- The built shots show less data than the reference (two invoices, no long invoice number, no row-level "More than the open balance" error). Wrapping of a long invoice number and the row error cannot be judged from these shots.
- The "Draft" badge on a new payment is header chrome of checkpoint 2, not this checkpoint.

## For gate 3

- None visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 9 NOTE
