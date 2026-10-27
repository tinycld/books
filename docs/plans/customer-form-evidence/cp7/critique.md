# Checkpoint 7 — design critique (gate 2)

Scope: the row menu trigger in the trailing cell of rows and cards, and the Delete customer dialog. The open menu, the inactive row state and the refusal banner were not captured, so they are not reviewed here (coverage gap, not a finding against the build).

## State check

| Shot | Expected | Shows | Verdict |
|---|---|---|---|
| list-1280-light | populated list, menu cell | seeded customers, sub-customers indented, vertical-ellipsis trigger in the trailing cell of every row, light | valid |
| list-1280-dark | same, dark | same, dark | valid |
| list-390-light | populated cards, menu cell | seeded customer cards, trigger at the right of each card, light | valid |
| list-390-dark | same, dark | same, dark | valid |
| delete-1280-light | Delete customer dialog, Delete state | dialog "Delete customer", body "Helix Delete Capture", footer Cancel + Delete (destructive), list behind filtered to that customer, light | valid |
| delete-1280-dark | same, dark | same, dark | valid |
| delete-390-light | same, phone | bottom sheet with grabber and ✕, title, name, Cancel + Delete, light | valid |
| delete-390-dark | same, phone, dark | same, dark | valid |

No INVALID shots.

## Findings

list-1280-light: nothing found. The trigger is always visible (spec, Platform notes: "No hover-only controls: the row menu button is always visible"), sits in its own trailing column, right-aligned, vertically centered on each row including the two-line Name rows, and matches the reference's placement.

list-1280-dark: nothing found. The trigger uses the same muted token as the column headers and stays legible against the alternating row backgrounds.

list-390-light:
- Granite Peak Outfitters card, trailing cell — the Books New FAB covers the menu trigger of the card under it. The reference shows the same overlap, so this is not a loss against the reference, and the list scrolls; only the last card could be left with no reachable trigger if the list has no bottom inset for the FAB. Not verifiable from this shot. — NOTE

list-390-dark: same NOTE as list-390-light; otherwise nothing found. Trigger legible in dark.

delete-1280-light:
- dialog body — the Delete state carries only the customer name; the reference's body pattern is a bold statement line, a muted explanation, then the name. For the plain Delete state the spec requires no explanation text ("Otherwise Delete runs through `useMutation`"), so the thin body breaks no rule, but a one-line consequence ("This cannot be undone.") would fill the slot the reference reserved. — NOTE

delete-1280-dark: nothing found. Structure, chrome and hierarchy match the reference (title, body, separated footer, Cancel + destructive primary); the destructive button uses the dark destructive token and is legible.

delete-390-light: same NOTE as delete-1280-light on the body; otherwise nothing found. Sheet chrome (grabber, ✕, footer) matches the reference.

delete-390-dark: same NOTE; otherwise nothing found.

## Summary

BLOCKING: none.
NOTE: 2 (FAB over the card trigger near the bottom of the viewport; the Delete-state body is name-only).
Coverage gap: no capture of the open menu (Edit, Add sub-customer, Make inactive/active, Delete) or of the sub-customer dialog states; those remain unreviewed at this gate.

## Round 2 — menu and Make inactive

Scope: the open row menu (popover on the table, sheet on a phone) and the Delete customer dialog for a parent whose only sub-customer is inactive. The `list-*` and `delete-*` shots were re-captured and re-checked.

### State check

| Shot | Expected | Shows | Verdict |
|---|---|---|---|
| menu-w1280-1280-light | row menu open on a top-level row: Edit, Add sub-customer, Make inactive, Delete | popover under the Marisol Alvarez trigger with those four items in that order, Delete in the destructive color, list behind untouched, light | valid |
| menu-w1280-1280-dark | same, dark | same, dark | valid |
| menu-w390-390-light | row menu as a phone sheet | bottom sheet titled with the customer name, grabber and ✕, the four items, Delete destructive, scrim over the list, light | valid |
| menu-w390-390-dark | same, dark | same, dark | valid |
| inactive-1280-light | Delete customer dialog, parent with only inactive sub-customers: "This customer has sub-customers", no Delete, Make inactive offered | title "Delete customer", bold "This customer has sub-customers", muted explanation, name, Cancel + Make inactive (primary); the now-inactive sub-customer is gone from the list behind (Show inactive off), light | valid |
| inactive-1280-dark | same, dark | same, dark | valid |
| inactive-390-light | same, phone | bottom sheet with grabber and ✕, same body, Cancel + Make inactive, light | valid |
| inactive-390-dark | same, phone, dark | same, dark | valid |
| list-1280/390-{light,dark} | as Round 1 | as Round 1 | valid |
| delete-1280/390-{light,dark} | as Round 1 | as Round 1, body now carries "This cannot be undone." above the name | valid |

No INVALID shots.

### Findings

menu-w1280-1280-light, menu-w1280-1280-dark:
- Item order, labels and the destructive Delete match the spec. The popover hangs from the trigger, stays inside the viewport and covers only the row below it.
- The Edit item shows a filled highlight although no pointer is over it (initial focus of core `Menu`). It reads as a pre-selected item. — NOTE. Fix: none in Books; a core `Menu` focus-ring style, if wanted.

menu-w390-390-light, menu-w390-390-dark: nothing found. The sheet title names the row the actions apply to, which the table popover does not need. Dark items and the destructive Delete are legible on the sheet.

inactive-1280-light, inactive-1280-dark: nothing found. Body matches the reference `delete-1280-light` word for word (bold statement, muted explanation, name) and the spec (no Delete; Make inactive as the primary action). Dark muted text is legible.

inactive-390-light, inactive-390-dark: nothing found. Matches the reference `delete-390-light`.

delete-*: the Round 1 NOTE on the name-only body is resolved; the body now carries "This cannot be undone.".

list-390-*: the Round 1 NOTE on the FAB over the last card trigger stands.

### Summary

BLOCKING: none.
NOTE: 1 new (Edit item pre-highlighted on open, core `Menu`); 1 carried from Round 1 (FAB over the card trigger); 1 Round 1 NOTE resolved.
Coverage gap: still no capture of a sub-customer row menu (no Add sub-customer), of an inactive row with Make active and the "Inactive" label, of the close-only dialog ("Make its sub-customers inactive first"), or of the refusal banner.
