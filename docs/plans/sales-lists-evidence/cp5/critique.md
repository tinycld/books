# Design critique: sales-lists checkpoint 5 (list keys and help topic)

Scope: the focused row's look on each Sales tab and in the 320 px column. Each finding applies to the light and the dark shot unless it says otherwise.

## Root cause seen in all six shots

The focus fill is a solid slate band. Its colour is the same as the muted text colour, so each part of the focused row that draws in the muted colour is not visible: the second text line, the muted (Draft) badge label, and the row menu icon. The fix is one change (a quiet fill that keeps muted text legible); the findings below list what each shot loses.

## all-focus-1280 (reference all-1280)

State check: VALID. Second row focused, All sales table.

- all-focus-1280: focused row, Status cell — the Draft badge is an empty pill, its label is not visible — BLOCKING ("The Status cell is a `StatusBadge` with the label and tone that `lib/party-transactions.ts` gives each kind")
- all-focus-1280: focused row, right end — the "More actions" icon is not visible — BLOCKING ("Each row and card ends with a "More actions" button (44 px target)")
- all-focus-1280: focused row — the fill is the heaviest element on the screen, heavier than the primary New button; dark text on slate (light) and white text on grey-blue (dark) have low contrast — NOTE

## all-focus-mid-900 (reference all-mid-900)

State check: VALID. Second card focused, cards.

- all-focus-mid-900: focused card, second line — customer and date are not visible; the card shows "Invoice" and an empty line — BLOCKING ("A card on All sales shows two lines: type and number with the amount at the right, then customer and date with the status badge at the right")
- all-focus-mid-900: focused card, badge — empty pill, no "Draft" label — BLOCKING ("The Status cell is a `StatusBadge` with the label and tone …")
- all-focus-mid-900: focused card, right end — the "More actions" icon is not visible — BLOCKING ("Each row and card ends with a "More actions" button")
- all-focus-mid-900: toolbar — three rows (the Void chip wraps, Sort is alone on a third row); the reference has two rows. The chips are wider than the reference's. Not a part of this checkpoint — NOTE

## all-focus-phone-390 (reference all-phone-390)

State check: VALID. Second card focused, cards.

- all-focus-phone-390: focused card, second line — customer and date are not visible — BLOCKING ("… then customer and date with the status badge at the right")
- all-focus-phone-390: focused card, badge — empty pill, no label — BLOCKING ("The Status cell is a `StatusBadge` with the label and tone …")
- all-focus-phone-390: focused card, right end — the "More actions" icon is not visible — BLOCKING ("Each row and card ends with a "More actions" button")
- all-focus-phone-390: third toolbar row (the gate-2 weak point) — Sort shows only as a cut "S" at the right edge. The reference shows the same cut, so the approved direction has it. A user can miss that the row scrolls — NOTE

## invoices-focus-1280 (reference invoices-1280)

State check: VALID. Second row ticked (accent fill, header box shows the partial mark), third row focused.

- invoices-focus-1280: focused row, right end — the "More actions" icon is not visible — BLOCKING ("Each row and card ends with a "More actions" button")
- invoices-focus-1280: rows 2 and 3 — the focus fill is much heavier than the ticked row's `bg-accent`; the eye reads the focused row as the selected one — NOTE
- invoices-focus-1280 (dark): ticked row, Status cell — the Draft badge shows no outline on the accent fill; the label floats — NOTE

## invoices-focus-phone-390 (reference invoices-phone-390)

State check: VALID. Second card focused.

- invoices-focus-phone-390: focused card, second line — date and "Due <date>" are not visible — BLOCKING ("A card on a kind tab shows the number and the customer with the amount at the right, then the date (and "Due <date>" for an invoice) with the status badge at the right")
- invoices-focus-phone-390: focused card, badge — empty pill, no label — BLOCKING ("The Status cell is a `StatusBadge` with the label and tone …")
- invoices-focus-phone-390: focused card, right end — the "More actions" icon is not visible — BLOCKING ("Each row and card ends with a "More actions" button")

## beside-focus-1440 (reference beside-1440)

State check: VALID. Invoice 1015 open beside the 320 px column (its row has the accent fill), second row of the column focused.

- beside-focus-1440: focused names row, second line — the amount is not visible; only the Open badge shows — BLOCKING ("the list narrows to a 320 px column of two-line rows (number and customer, amount and status) with the open row marked")
- beside-focus-1440: column — the focus fill is much heavier than the open row's mark, so the focused row reads as the open document — NOTE

## For gate 3

Nothing seen.

CRITIQUE: 0 INVALID, 13 BLOCKING, 6 NOTE
