# Gate 2 critique, round 2: apply-credit, checkpoint 5 (Lists, Receive payment and help)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE`

Scope of this round: the four `receive-payment-*` shots captured again after fix round 1 (the title line "Unapplied credit" on the notice). The `sales-credit-memos-*` shots were not captured again; their round-1 verdict in `critique.md` stands. Inputs read: the lane rules, the brief, the capture report (Round 2), the spec, the lessons, `memories-design.md`, the round-1 critique, 4 built PNGs, 4 reference PNGs.

## State check

| Shot | State it must show | Result |
|---|---|---|
| receive-payment-390-light | customer picked, notice above the open invoices, cards | VALID. Notice with title and one link, "Outstanding invoices", one invoice card (Invoice 1016, overdue). |
| receive-payment-390-dark | same, dark | VALID |
| receive-payment-1280-light | same, grid | VALID. Fox Hollow Vineyards picked, notice, grid with one row. |
| receive-payment-1280-dark | same, dark | VALID |

## Round-1 note, checked again

Round 1: "the notice is a link with no title or lead text". Fixed: the card now starts with the title "Unapplied credit" (the weight and size of the field labels), and the link "Credit memo 1003 · $100.00 unapplied" is below it. The card now says what it is, at both widths and in both themes.

## Findings

### receive-payment-390-light
- Notice card, title and link — the word "unapplied" is in the title and again at the end of the link ("Unapplied credit" / "… $100.00 unapplied"). The link text is spec text (§3.8), so the title is the part that repeats. — NOTE

Compared with the reference: the notice is above the open invoices; the link text, tone and underline, and the card's border and fill agree. The title line is an addition of the plan (Do step 1: "a title line and one link for each credit"); it takes nothing away that the reference decided. The invoice card has no credit field. The spacing between the header card, the notice and "Outstanding invoices" is even.

### receive-payment-390-dark
Nothing found. The title, the link, the "Overdue" tone and the card borders are legible.

### receive-payment-1280-light
- Notice card — with one credit, the card has the full content width and holds a title and one short link, so most of the card is empty. The reference has the same full-width card. — NOTE

The title aligns with the left edge of the header card's labels (Customer) and the link aligns with the title. The grid's header cells are Invoice, Due date, Original amount, Open balance, Payment: no credit column (spec §3.8: "no credit column"). No sideways scroll.

### receive-payment-1280-dark
Nothing found.

## Not shown by these shots

No change from round 1: the open row menu with "Apply to invoices", the Refunded and Void statuses, the customer page's Transactions tab, the notice's load-error state and the help topics have no screenshot, so they have no appearance verdict.

## For gate 3

Nothing visible.
