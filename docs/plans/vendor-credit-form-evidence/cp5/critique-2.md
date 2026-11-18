# Design critique 2: vendor-credit-form, checkpoint 5 (after the fix round)

Scope: the bill read view's "Credits applied" total and Payments block rows with Remove, the Remove dialog on the bill, the Pay Bills notice. 12 recaptured built shots, 8 reference shots. A fresh critique; the fix made the "Credits applied" row derive from the stored bill.

Result: 0 INVALID, 0 BLOCKING, 2 NOTE (both known from critique 1).

## Fix check: bill totals

In all 8 bill shots (elsewhere-bill and remove-bill, both widths, both schemes) the totals show Account lines $30.00, Total $30.00, Credits applied −$30.00, Balance due $0.00. 30.00 − 30.00 = 0.00: the rows add up. The header figure BALANCE DUE $0.00 and the badge Paid agree with them. "Credits applied" is after Total and above Balance due (spec §3.10: "the totals gain "Credits applied −$30.00" above Balance due"). The look did not change from critique 1.

## elsewhere-bill-1280-light / -dark

State check: VALID. Posted Bill 1007 (Ironclad Equipment Rentals, Paid) with one credit applied.

- Totals: as the fix check. The figures end on the Amount column edge (1191 px), the same edge as the line Amount.
- Payments block: "Vendor credit 1002 · Nov 16, 2026 · $30.00" as a link, Remove beside it. Same structure as the reference row.
- Light and dark: all text is legible.
- Payments block and totals, both schemes — the seeded bill has no bill payment, so no shot shows a payment row and a credit row in one list, or the order Total / Payments / Credits applied / Balance due that the reference shows. The build does not contradict the reference; the evidence does not show this case. — NOTE (known)

## elsewhere-bill-phone-390-light / -dark

State check: VALID. The same bill at 390.

- Totals rows complete, no cut text. Remove is below the link, as in the reference at 390.
- Nothing found.

## remove-bill-1280-light / -dark

State check: VALID. The Remove confirmation is open on the bill read view.

- "Remove credit", body "Remove this credit from Bill 1007? The bill's balance goes up by $30.00 and the credit is unapplied again.", Cancel, destructive Remove. Agrees with spec §3.9 and the reference dialog. The totals behind the dialog still show all three rows.
- Nothing found.

## remove-bill-phone-390-light / -dark

State check: VALID. The confirmation is a Sheet at 390 on the bill.

- Same structure as the reference sheet (handle, title, close, body, Cancel, Remove). No bad wrap. The totals behind it show all rows.
- Nothing found.

## elsewhere-pay-bills-1280-light / -dark

State check: VALID. Pay Bills with 7 open bills and the unapplied-credits notice.

- Notice above the open bills, below the filters: "Vendor credit 1001 · Pacific Power · $650.00 unapplied", a link in the reference's box. Credit 1002 (Ironclad) is correctly absent: Ironclad has no shown open bill (spec §3.10: "of a vendor that has a shown open bill").
- No credit column (spec: "Nothing else on Pay Bills changes: no credit column").
- Nothing found.

## elsewhere-pay-bills-390-light / -dark

State check: VALID. Pay Bills cards at 390 with the notice above "Pay all".

- Notice link — the text wraps and leaves the one word "unapplied" on the second line. The reference at 390 wraps the same way. — NOTE (known)
- Nothing more found.

## For gate 3

Nothing visible.
