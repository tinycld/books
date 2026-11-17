# Gate-2 design critique, round 2 — credit-memo-form, checkpoint 4

Scope: the shots the fix changed (`from-invoice-1280-*`, `from-invoice-phone-390-*`, `errors-1280-*`, `errors-390-*`), light and dark. Subject: the invoice link row's gaps. The row's place (above the date row) is a plan decision and is not judged. `critique-r1.md` was not in the evidence folder; the round-1 figures come from the driver's prompt.

Measurements are read from the screenshots (± 2 px).

## Fix check: link row gaps

| Shot | Above the row (Email value → button top) | Below the row (button or refusal text → date label) | Band's own gap between rows |
|---|---|---|---|
| from-invoice-1280 | ~22 px | ~22 px | ~20–24 px |
| errors-1280 | ~22 px | ~18 px (under the refusal text) | ~20–24 px |
| errors-390 | ~22 px | ~18 px (under the refusal text) | ~20–24 px |
| from-invoice-phone-390 | ~22 px | ~22 px | ~20–24 px |

Round 1 found ~38 px above and ~26 px below. The row now has the band's row gap on both sides. The refusal text sits ~10 px under the button, in `text-xs` destructive, left-aligned with the link. The finding is closed.

## Per screenshot

### from-invoice-1280-light
State check: VALID. New credit memo from an invoice: customer, Bill to, Email, link row "For invoice 1003" + "Remove link", date, tax, seven copied lines, totals $2,111.77.
Findings: nothing found.

### from-invoice-1280-dark
State check: VALID. Same state, dark.
Findings: nothing found. Link, outline button and labels are legible.

### from-invoice-phone-390-light
State check: VALID. Same state at 390, lines as cards.
- from-invoice-phone-390-light: band, "Remove link" — the button is ~32 px high on a phone; the reference button is ~44 px. A small touch target next to a link — NOTE.

### from-invoice-phone-390-dark
State check: VALID. Same state, dark.
- Same NOTE as the light shot (button height). No new finding.

### errors-1280-light
State check: VALID. Shows the server's link refusal "Choose a posted invoice of this customer." under the link row; no summary, as the plan says ("The summary holds only the root refusal"). The single-error content is the stated capture choice.
- errors-1280-light: bottom right, above the action bar — a "Save draft ⌘S" tooltip is drawn over the "Credit amount" total label. It is a hover artifact of the capture (the dark shot does not have it), not a layout defect — NOTE (capture again with the pointer moved away if the shot is kept as evidence).

### errors-1280-dark
State check: VALID. Same state, dark.
Findings: nothing found. The destructive text is legible on the dark band.

### errors-390-light
State check: VALID. Link refusal under the link row at 390.
- Same NOTE as from-invoice-phone-390-light (button height). No new finding.

### errors-390-dark
State check: VALID. Same state, dark.
Findings: nothing found beyond the same NOTE.

## Notes that apply to all eight shots (not caused by the fix)

- Band, left edge — the link text and its refusal text start ~2 px left of the field labels (x 357 against 359 at 1280; 33 against 35 at 390). The reference has the same offset — NOTE.
- Band, bottom — ~42 px of empty space under the date/tax row against ~20 px above the band's first label. It is the shared band's space under its last field row (the reference shows the same space under that row) — NOTE.

## For gate 3

Nothing.

## Count

CRITIQUE: 0 INVALID, 0 BLOCKING, 4 NOTE
