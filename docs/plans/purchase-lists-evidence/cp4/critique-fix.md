# Design critique: purchase-lists, checkpoint 4, fix round (row-menu shots)

Scope: the four re-captured `row-menu-*` shots, compared with the references of the same names. The built list is narrowed by the search "Hosted phone plan" to one seeded bill (Zenith Telecom, Open, $189.50); the reference draws the full fixture set. The row count and the bill number (1008 against the fixture's 1057) differ by data and are not findings.

## row-menu-1280-light

State check: VALID. Bills tab, table layout, one row, the row's "More actions" menu open.

- Menu items, in order: Open, Pay bill, Void, Copy, View journal entry. No Edit. This agrees with the spec ("Bill | Pay bill (balance > 0), Void, Copy, View journal entry") and with the reference.
- Menu position (below the row's menu button, right edge inside the list), Void in the destructive color, first item highlighted: same as the reference.
- Tick box at the row start and in the header, disabled "Batch actions" with no tick, status badge, right-aligned Balance and Total: same as the reference.
- No sideways scroll. No clipped or truncated text.

Nothing found.

## row-menu-1280-dark

State check: VALID. Same state as the light shot.

- Menu surface, border and item text are legible on the dark background. Void keeps the destructive color and is legible.
- The "Open" badge and the muted header text are legible.

Nothing found.

## row-menu-phone-390-light

State check: VALID. Bills tab, cards layout, one card, the row menu open as a bottom sheet with the title "Bill 1008".

- Sheet: handle, title, close button, then Open, Pay bill, Void, Copy, View journal entry. Same structure, order and spacing as the reference ("Bill 1056" there).
- Card: tick box, "1008 · Zenith Telecom" with the amount at the right, date and "Due Dec 12, 2026" with the badge at the right, menu button at the end. This agrees with the spec's kind-tab card and with the reference.
- Toolbar: search on the first row with the icon Batch actions button, chips on the second row, date range and vendor picker on the third row. Same as the reference.

Nothing found.

## row-menu-phone-390-dark

State check: VALID. Same state as the light phone shot.

- Sheet surface, title and items are legible. Void is legible in the destructive color.
- The dimmed list behind the sheet agrees with the reference.

Nothing found.

## For gate 3

Nothing visible.

## Total

CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE
