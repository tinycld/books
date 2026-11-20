# Gate 2 critique: apply-credit, checkpoint 5 (Lists, Receive payment and help)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE`

Judged: the unapplied-credits notice on Receive payment, and the Credit memos tab's statuses and chips. Inputs read: the brief, the capture report, the spec, the lessons, `memories-design.md`, 6 built PNGs, 4 reference PNGs.

## State check

| Shot | State it must show | Result |
|---|---|---|
| receive-payment-390-light | customer picked, notice above the open invoices | VALID. Fox Hollow, one notice line, one invoice card. |
| receive-payment-390-dark | same, dark | VALID |
| receive-payment-1280-light | same, grid layout | VALID. Scrolled: the top breadcrumb is cut by the frame. |
| receive-payment-1280-dark | same, dark | VALID |
| sales-credit-memos-390-light | Credit memos tab, populated, cards | VALID. Statuses Unapplied, Applied, Draft. No Refunded or Void row is seeded. |
| sales-credit-memos-1280-light | Credit memos tab, populated, table | VALID. Same rows. |

## Findings

### receive-payment-390-light
- Notice card, between the header card and "Outstanding invoices" — the notice is a link with no title or lead text. With one credit the card does not say what it is. The reference has the same shape (links only), so the reference decision holds. The brief's Do step 1 says "a title line and one link for each credit"; that is plan text, not spec text. — NOTE

Compared with the reference: the notice is above the open invoices, the link text is "Credit memo 1003 · $100.00 unapplied", the card has the reference's border, fill and link tone. The invoice card has no credit field. The structure of the reference is kept.

### receive-payment-390-dark
Nothing found. The link, the "Overdue" tone and the card borders are legible.

### receive-payment-1280-light
- Notice card — the same NOTE as at 390 (counted one time). At 1280 the one link is in a card of the full content width, so the card looks empty.

The grid's header cells are Invoice, Due date, Original amount, Open balance, Payment: no credit column (spec §3.8: "no credit column"). No sideways scroll.

### receive-payment-1280-dark
Nothing found.

### sales-credit-memos-390-light (no reference)
- Tab strip — the strip is at its start, so the selected tab "Credit memos" is out of view and no tab shows as selected. Only the chips and the "New credit memo" button tell the user which tab is open. The tab strip is not a part of this checkpoint. — NOTE

Chips: All, Unapplied, Applied, Refunded are in view in the spec's order; Draft and Void are in the chip scroller (a chip row, not a table). Unapplied is in the warning tone and Applied in the success tone (spec §3.5).

### sales-credit-memos-1280-light (no reference)
- Customer column, the two St. Jude rows — the name is cut ("St. Jude Community Hospital Fou…") while the space between the Customer and Balance columns is empty. The column widths are not a part of this checkpoint. — NOTE

Chips are exactly All, Unapplied, Applied, Refunded, Draft, Void (spec §3.5). The row with a part used (1002, balance $410.92 of $616.38) reads Unapplied, and the row with balance $0.00 (1003) reads Applied, as the spec says. The table does not scroll sideways.

## Not shown by these shots

These parts of the Delivers line have no screenshot, so they have no appearance verdict here:
- the open row menu with "Apply to invoices" (Sales lists and the customer page);
- the Refunded and Void statuses (no seeded row);
- the customer page's Transactions tab;
- the notice's load-error state ("Books could not load the customer's credits." with Retry);
- the help topics.

## For gate 3

Nothing visible.
