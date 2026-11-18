# Design critique: vendor-credit-form, checkpoint 5

Scope: the bill read view's "Credits applied" total and Payments block rows with Remove, the Remove dialog on the bill, the Pay Bills notice. 12 built shots, 8 reference shots.

Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

## elsewhere-bill-1280-light / -dark

State check: VALID. A posted bill (Bill 1007, Ironclad Equipment Rentals, badge Paid) with one credit applied.

- Totals: "Credits applied −$30.00" is above "Balance due $0.00", after Total. The figures end on the Amount column edge. Agrees with spec §3.10 and the reference.
- Payments block: "Vendor credit 1002 · Nov 16, 2026 · $30.00" as a link with a Remove button beside it. Agrees with the spec text and the reference row.
- Light and dark: all text is legible; the link and the button border are clear in dark.
- Payments block, both schemes — the seeded bill has no bill payment, so the shots do not show a payment row and a credit row in one list, and not the totals order Total / Payments / Credits applied / Balance due that the reference shows. The build does not contradict the reference; the evidence does not show this case. — NOTE

## elsewhere-bill-phone-390-light / -dark

State check: VALID. The same bill at 390.

- Totals rows and the Payments block are complete; no text is cut. Remove goes below the link, as in the reference at 390.
- Nothing more found.

## remove-bill-1280-light / -dark

State check: VALID. The Remove confirmation is open on the bill read view.

- Title "Remove credit", body "Remove this credit from Bill 1007? The bill's balance goes up by $30.00 and the credit is unapplied again.", Cancel and a destructive Remove. Agrees with spec §3.9 and the reference dialog.
- Nothing found.

## remove-bill-phone-390-light / -dark

State check: VALID. The confirmation is a Sheet at 390 on the bill.

- Same structure as the reference sheet (handle, title, close, body, Cancel, Remove). No bad wrap.
- Nothing found.

## elsewhere-pay-bills-1280-light / -dark

State check: VALID. Pay Bills with open bills and the unapplied-credits notice.

- The notice is above the open bills, below the filters: one link row "Vendor credit 1001 · Pacific Power · $650.00 unapplied". Agrees with spec §3.10 and the reference notice (same box, same link style).
- Credit 1002 (Ironclad) is not listed. This is correct: Ironclad has no shown open bill ("of a vendor that has a shown open bill").
- No credit column in the grid. Agrees with "Nothing else on Pay Bills changes".
- Nothing found.

## elsewhere-pay-bills-390-light / -dark

State check: VALID. Pay Bills cards at 390 with the notice above "Pay all".

- Notice link — the text wraps and leaves the one word "unapplied" on the second line. The reference at 390 wraps the same way. — NOTE
- Nothing more found.

## For gate 3

Nothing visible.
