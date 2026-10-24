# CP6 critique: final whole-screen check (help topic + entry-point e2e; screen unchanged since CP5)

## State check
- populated-1280-light / -dark: VALID. Header, table, Opening balance row, "This fiscal year", no drawer.
- populated-390-light / -dark: VALID. Stacked header, card list, tab bar.
- populated-drawer-1280-light / -dark: VALID. Inline right panel for entry 6; row 6 and the Business Checking line highlighted.
- populated-drawer-390-light / -dark: VALID. Bottom sheet for entry 6 over the scrim. (The reference populated-drawer-390-light has no drawer; the dark reference is the comparison.)
No INVALID shots.

## Fixed since CP5
- Card separator: now "Accounts receivable · Journal entry" with spaces on both sides, both themes.

## Critique
populated-1280-light, populated-1280-dark
- nothing found. Figures intact, right aligned, Void label and "Void reversal of 9" legible in both themes.

populated-390-light, populated-390-dark
- Card list — card pitch 96pt against the reference's ~73pt: each card has ~30pt blank under its third line, and the fold shows 5 cards where the reference shows 7. The reference decided a one-line memo card; the build reserves a second memo line that stays empty on every card in the shot. — NOTE (reference card pitch; spec Cut: a taller fixed row "halves rows per screen")

populated-drawer-1280-light, populated-drawer-1280-dark
- Drawer header — the close button sits ~6px above the title's centre line and ~19px inside the content's right edge (title 46, X 40; X 1229, column edge 1248); the reference aligns both. — NOTE
- Field row — four fields (Date, Number, Type, Status) in the 334px panel push "Posted" ~5px past the lines table's right edge; the reference's three fields fit. Removing the Number field (CP5 NOTE) also fixes this. — NOTE

populated-drawer-390-light, populated-drawer-390-dark
- Drawer header — same close-button offset as 1280 (X 339 vs content edge 358). — NOTE
- nothing else found; the sheet is legible in both themes and the highlight reads in dark.

## Summary
- BLOCKING: 0.
- NOTE: 3 new (card pitch, drawer close-button alignment, four-field row overflow) plus the carried CP5 NOTEs (card line order, Number field, opening/long-memo cards unevidenced, sheet size md).
