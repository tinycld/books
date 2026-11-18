# Design critique 2: vendor-credit-form, checkpoint 4 (after fix rounds 2 and 3)

Scope: the 12 recaptured shots only (`posted`, `posted-phone`, `partly`, `partly-phone`, `apply-errors`, `apply-errors-phone`; light and dark). Reference: the light shot of each name.

Result: 0 INVALID, 0 BLOCKING, 1 NOTE (new). The NOTEs of `critique.md` that still hold are not repeated.

## State check

| Shot | Width | State shown | Result |
|---|---|---|---|
| posted (light, dark) | 1280 | Credit 1001, badge Posted, notice "Pacific Power has 3 open bills…" with Apply to bills, Apply to bills primary in the bar | valid |
| posted-phone (light, dark) | 390 | Same credit; notice below the credit amount; bar is More + Apply to bills | valid |
| partly (light, dark) | 1280 | Credit 1002, badge Partly applied, Applied −$30.00, Applied to block with one row and Remove; no notice (the vendor has no open bill) | valid |
| partly-phone (light, dark) | 390 | Same credit, cards, Applied to block | valid |
| apply-errors (light, dark) | 1280 | Dialog with the sum error in the error summary and the cell error under row 1 | valid |
| apply-errors-phone (light, dark) | 390 | Sheet with the sum error in the error summary and the cell error under card 1 | valid |

## Fixed items

1. **Notice position — holds.** On `posted-1280` and `posted-phone-390` (light and dark) the notice is the first block below the title and the credit amount, above the details band, as in the reference. On the phone it starts at about y = 170 of the first viewport, so it is in view with no scroll. The earlier BLOCKING finding is closed. `partly-*` correctly shows no notice, as the reference.
2. **Phone error summary — holds.** On `apply-errors-phone-390` (light and dark) the error summary with "More than the unapplied credit of $650.00." is directly below the Apply date, in view, above the first card. `apply-errors-1280` shows it in the same position. This agrees with the reference position (below the Apply date) and with the spec ("in `FormErrorSummary`"). Legible in light and dark.

## Findings

### posted-1280, posted-phone-390 (light, dark)
nothing found

### partly-1280, partly-phone-390 (light, dark)
nothing found

### apply-errors-1280, apply-errors-phone-390 (light, dark)
- apply-errors-1280, apply-errors-phone-390: error summary below the Apply date — the box has the heading "Please fix the following errors:" for one line of text, and takes about 75 px between the date and the list (the reference shows one line of danger text there). On the phone this moves the second card's amount input below the fold. The spec requires `FormErrorSummary`, so the box is correct. — NOTE

## For gate 3
- The two items of `critique.md` stay as written; the second (a sum-only refusal in the Sheet) is now in view without a scroll in the shot.
