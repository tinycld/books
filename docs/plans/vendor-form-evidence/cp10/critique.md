# Checkpoint 10 — gate 2 design critique

Delivers: the row menu (Edit, Make inactive or Make active, Delete) on rows and cards, Make inactive / Make active with banner refusals, the Delete vendor dialog with the unsaved-changes line and the delete snapshot for the open vendor, the help topic.

Known, not findings: core `bg-danger-soft` gap (the dark Delete button); the Account number hint spacing; the phone FAB over the card rows.

## list-1280-light / list-1280-dark
State: VALID — populated list with the ⋮ menu cell on every row.
Findings: nothing found. Pixel-equal to the reference in both themes; the menu cell is right-aligned, vertically centred on one-line and two-line rows, and legible in dark.

## list-390-light / list-390-dark
State: VALID — populated phone card list with the ⋮ on every card.
Findings:
- list-390-light, list-390-dark: Greenline Landscaping and Harbor Freight cards — the New FAB sits on the Greenline ⋮ button and brushes the Harbor Freight ⋮; the menu button is the new touch target under the known FAB overlap — NOTE (extends the known phone FAB note; no rule).
- Card pitch is 1–3 px tighter than the reference; no structure or hierarchy change — not a finding.

## row-menu-1280-light / row-menu-1280-dark
State: VALID — the ⋮ menu of Office Supply World open, three items: Edit, Make inactive, Delete (Delete in the danger colour).
Findings: nothing found. Matches the reference in both themes; the menu is right-aligned to its button, the items are in spec order, the danger item reads in dark.

## delete-1280-light / delete-1280-dark
State: VALID — Delete vendor dialog for the seeded Office Supply World: title, name, "This cannot be undone." muted, Cancel, Delete.
Findings: nothing found. Matches the reference. The dark Delete button is the known `bg-danger-soft` gap.

## delete-390-light / delete-390-dark
State: VALID — the same dialog as a bottom sheet on the phone with ✕, Cancel and Delete.
Findings: nothing found. Matches the reference in both themes; the sheet text and actions are legible in dark.

## delete-dirty-1600-light / delete-dirty-1600-dark
State: VALID — the open vendor's panel at 1600 (Edit vendor, dirty: a typed Notes line "Call before the delivery."), the search narrowed to that vendor, its row in `bg-accent`, and the Delete vendor dialog with the third line "Unsaved changes to this vendor will be lost.". The reference scrolls the panel to the top and leaves the search empty; the build shows the same structure with the dirty field and the highlighted open row visible, which is more evidence, not less — not a finding.
Findings:
- delete-dirty-1600-light, delete-dirty-1600-dark: dialog body — the muted "This cannot be undone." sits between two plain-tone lines (the name and the unsaved-changes line), so the eye reads two separate messages; the plan fixes the line order and tones to the reference, so this is taste only — NOTE.

## Summary
INVALID: none. BLOCKING: none. NOTE: 2.
