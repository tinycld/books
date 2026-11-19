# Gate 2 critique, round 2: refund-receipt-form, checkpoint 5 (Lists, customer page, help)

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

Scope: the 6 re-captured shots, their 6 anchors (credit-memo-form-evidence/cp5 `sales-tax-liability-*`, sales-lists-evidence/cp2 `all-phone-390-*`), the brief, the spec, the lessons, `memories-design.md`, `capture.json` and the round 1 critique were read. The other 14 shots of round 1 were not judged again.

## sales-tax-liability-refund

State check:
- 1280 light, 1280 dark, 390 light, 390 dark: VALID. Accrual, Nov 1 – Nov 30, 2026. "Denver city" is expanded and the row "2026-11-12 · Refund receipt 1001 · Harborview Hospitality Group" shows with negative figures (-1,304.70 / -821.70 / -483.00 / -23.23). The round 1 INVALID (rate rows collapsed) is resolved.

Findings:
- sales-tax-liability-refund-1280-light: nothing found.
- sales-tax-liability-refund-1280-dark: nothing found.
- sales-tax-liability-refund-390-light: nothing found.
- sales-tax-liability-refund-390-dark: nothing found.

Not findings:
- The refund row has the structure of the credit memo row above it and of the anchor ("date · kind number · customer", four right-aligned figures; two figure lines at 390).
- All four columns are in view at 1280. At 390 the phone layout shows two figures a line. No sideways scroll.
- The row label truncates with "…" at 390, as the anchor does.
- The report prints "-" (hyphen), not "−" (U+2212). The anchor does the same; the spec gives the "−" rule only for the Sales lists and the customer Transactions tab.
- The number 1001 (spec example "1003") is seed data.

## sales-lists-refund-receipts (390)

State check:
- 390 light, 390 dark: VALID. Refund receipts cards: the draft (St. Jude, −$118.05, Draft), the payout (1002 · Aspen Ridge Dental, −$205.46, Refunded) and the posted refund (1001 · Harborview, −$1,346.77, Refunded). The button "New refund receipt" and the chips All / Refunded / Draft / Void agree with the tab.

Findings:
- sales-lists-refund-receipts-390-light, -390-dark: tab strip — the active tab "Refund receipts" is out of view. The strip shows All sales, Invoices, Estimates, Sales receipts, and none of them is marked active. Only the button and the chips tell the user which tab is open. — NOTE.

Round 1 BLOCKING, resolved: each amount is on one line with its sign ("−$118.05", "−$205.46", "−$1,346.77"). The title takes the truncation ("St. Jude Community Hospital Fo…", "1001 · Harborview Hospitality …"). The three cards agree.

Not findings:
- The cards have a tick box and a row menu that the cp2 anchor does not have; the anchor is older than the batch and row actions.
- The filter row clips its third control at the right edge (a row of filters that scrolls, not a table).
- The "Refunded" success chip and the muted "Draft" chip are legible in light and dark.

## For gate 3

- sales-lists-refund-receipts-390: the tab strip does not scroll to the active tab when the screen opens on `books/refund-receipts` (see the NOTE above).
