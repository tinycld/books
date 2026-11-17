# Design critique: credit-memo-form, checkpoint 5

Scope: the Credit memo kind on the customer's Transactions tab (chip, rows, cards, statuses, empty text) and the Sales Tax Liability report with a credit memo row. 16 built shots, 8 reference shots. Widths 390 and 1280, light and dark.

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE`

Later (runner): this critique describes the first capture. The `customer-transactions-statuses-*` shots were captured again with text-day dates (N1 resolved); `critique-r2.md` judges the new shots.

## State check

| Shot | 390 light | 390 dark | 1280 light | 1280 dark |
|---|---|---|---|---|
| customer-transactions | valid | valid | valid | valid |
| customer-transactions-empty | valid | valid | valid | valid |
| customer-transactions-statuses | valid (see N1) | valid (see N1) | valid (see N1) | valid (see N1) |
| sales-tax-liability | valid | valid | valid | valid |

- `customer-transactions-*`: populated. Harborview Hospitality Group, Transactions tab, "Credit memos" chip active, one row or card: Credit memo 1001, Nov 10, 2026, −$1,346.77, Unapplied. The reference has a second (Draft) row; the seeded draft is of another customer (plan, seed pick), so one row is correct data.
- `customer-transactions-empty-*`: empty. Marisol Alvarez, "Credit memos" chip active, "No credit memos for this customer".
- `customer-transactions-statuses-*`: four rows or cards with Draft, Unapplied, Applied, Void, in that order.
- `sales-tax-liability-*`: Accrual, November 1 – November 30, 2026, Denver city expanded, row "2026-11-10 · Credit memo 1001 · Harborview Hospitality Group" with negative figures.

## Findings

### customer-transactions-390-light, -390-dark, -1280-light, -1280-dark
Nothing found.
- Chip "Credit memos" is after "Payments"; type "Credit memo"; No. 1001; Due date "—"; total with U+2212; Unapplied badge in the warning tone. Structure and hierarchy agree with the reference (table at 1280, cards at 390, total right-aligned, badge under the total on the card).
- 390: the chip row is scrolled to the active chip; the clipped first chip is the scroller's edge, not a defect.

### customer-transactions-empty-390-light, -390-dark, -1280-light, -1280-dark
- N2. All four: empty area under the chips — the text is semibold in the foreground color with a "Show all" button below it; the reference draws only muted regular text. The spec text is correct ("No credit memos for this customer"), and the build adds an action, loses nothing. Acceptable if this is the tab's existing filtered-empty state for every kind; make sure it is the same as the Payments / Estimates empty state — NOTE

### customer-transactions-statuses-390-light, -390-dark, -1280-light, -1280-dark
- N1. All four: Date cell (1280) and the card's second line (390) of every row — the text is "Invalid Date". Cause seen in `capture.json`: the faked memos have `"date": "2026-11-14 00:00:00.000Z"`, but the spec says "`date` text day" (§4.1), and the real row in `customer-transactions-*` draws "Nov 10, 2026". This is a defect of the capture data, not of the screen. Effect: this shot is the plan's only evidence for the Applied and Void rows, and it does not show their Date cell. Recapture with `"date": "2026-11-14"` (and the other three days) — NOTE
- Statuses otherwise correct: Draft (muted, empty No. cell, card title "Credit memo" with no number), Unapplied (warning), Applied (success), Void (muted). Badges are legible in light and dark. Totals −$320.00, −$250.00, −$142.50, −$80.00 are right-aligned on one edge.

### sales-tax-liability-390-light, -390-dark, -1280-light, -1280-dark
- N3. All four: the credit memo row's figures — the negative figures use a hyphen ("-1,304.70"), while the Transactions tab uses U+2212 ("−$1,346.77"). The spec requires the minus sign only on the Transactions tab; the report figures come from the core report formatter. A difference in glyph between two Books screens, no rule broken — NOTE
- 1280: the row label has the same form as its neighbours (date · kind and number · customer); the four figure columns are aligned with the headers; totals net correctly on screen ($224.00 / $0.00 / $224.00 / $10.77).
- 390: the label truncates after the number ("… Credit memo 1001 · Harborview Hos…"), so the kind and number stay readable; the figures keep the two-by-two layout of the other rows.
- 1280: the underline on the "Sales receipt 1001" row is the pointer's hover state after the expand click, not a style difference between rows.

## For gate 3
None visible.
