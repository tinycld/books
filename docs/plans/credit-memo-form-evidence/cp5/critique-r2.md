# Design critique r2: credit-memo-form, checkpoint 5, `customer-transactions-statuses-*`

Scope: the recaptured built-only shots (four faked credit memos on Harborview Hospitality Group, Transactions tab, Credit memos chip). No reference exists for this shot. The row look was compared with the reference `customer-transactions-{390,1280}-{light,dark}.png`.

The "Invalid Date" defect of the earlier capture is gone in all four shots: the dates read Nov 14, Nov 12, Nov 8 and Nov 5, 2026, newest first.

## State check

| Shot | Named state | Shows | Result |
|---|---|---|---|
| customer-transactions-statuses-390-light | Credit memos chip, 4 statuses, phone cards | Chip selected, 4 cards: Draft, Unapplied, Applied, Void | VALID |
| customer-transactions-statuses-390-dark | same | same | VALID |
| customer-transactions-statuses-1280-light | Credit memos chip, 4 statuses, table | Chip selected, 4 rows: Draft, Unapplied, Applied, Void | VALID |
| customer-transactions-statuses-1280-dark | same | same | VALID |

## Checks against the spec and the plan decisions (all four shots)

- Chip "Credit memos" after "Payments", selected: correct (spec §3.10).
- Type label "Credit memo": correct.
- Total with a minus sign in front (−$320.00, −$250.00, −$142.50, −$80.00), right-aligned, tabular: correct.
- Status tones: Draft muted, Unapplied warning, Applied success, Void muted: correct (spec §3.10; checkpoint tests).
- Due date cell "—" on every row (1280): correct (plan decision "Customer Transactions").
- Draft has an empty No. cell (1280) and the card title "Credit memo" with no number (390): correct.
- Row and card structure equal the reference: columns Date, Type, No., Due date, Total, Status; card with title and date on the left, total and badge on the right.

## Findings

### customer-transactions-statuses-390-light
nothing found

### customer-transactions-statuses-390-dark
- customer-transactions-statuses-390-dark: Draft and Void badges, right side of cards 1 and 4 — the muted badge text and border have low contrast on the dark background; the two differ only by their word. The reference draws Draft the same way — NOTE

### customer-transactions-statuses-1280-light
nothing found

### customer-transactions-statuses-1280-dark
- customer-transactions-statuses-1280-dark: Draft and Void badges, Status column, rows 1 and 4 — same low contrast of the muted badge as on the phone; equal to the reference's Draft badge — NOTE

## Not findings

- The Open and Overdue figures ($2,102.10, $1,337.10) do not show the faked memos: the fake replaces only the `books_credit_memos` list read, and the balance comes from a server view.
- The chip row at 390 is scrolled to its end, so "All", "Invoices" and "Estimates" are off screen and the selected chip is in view.

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
