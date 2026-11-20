# Gate 2 critique 2, ap-aging checkpoint 5: the Vendors list's Reports menu

Scope: the Delivers part "the Vendors list's Reports menu with A/P Aging" (spec §2). Anchor: the Customers list's Reports menu (`ar-aging-evidence/cp4/customers-menu-1280-light.png`, `-dark.png`), the same component. No anchor exists at 390.

## vendors-menu-1280-light.png

State check: VALID. The Vendors list, the Reports menu open, one item "A/P Aging".

Nothing found. The trigger is left of "New vendor", the menu opens below the trigger with the anchor's surface, border, item padding and first-item highlight. The table has no sideways scroll.

## vendors-menu-1280-dark.png

State check: VALID. Same state, dark.

Nothing found. The menu surface, its border and the item text are legible on the dark page; it agrees with the dark anchor.

## vendors-menu-390-light.png

State check: VALID. The Vendors list (cards) at 390, the Reports menu open as a bottom sheet with the title "Reports" and one item "A/P Aging".

- vendors-menu-390-light: sheet, item row — "A/P Aging" starts at about x=50 and the sheet title "Reports" at x=20; the item does not align with the title (an empty icon slot of the shared menu item) — NOTE
- vendors-menu-390-light: right edge above the sheet — the "New" FAB shows as a cut teal half-circle behind the scrim, directly above the sheet's close button — NOTE

The header (title, Reports, New vendor) fits on one line; no text is cut; no sideways scroll.

## vendors-menu-390-dark.png

State check: VALID. Same state, dark.

- vendors-menu-390-dark: sheet, item row — the same item indent against the title as in light — NOTE
- vendors-menu-390-dark: right edge above the sheet — the same cut FAB half-circle; it is the brightest object outside the sheet in dark — NOTE

The sheet title, the close button and the item are legible.

## For gate 3

Nothing.

## Count

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE (each seen in light and dark at 390)
