# Design critique: ar-aging, checkpoint 4 (Reports menu, narrow layouts, help)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE`

Judged: 16 built shots against their references (D2 width mapping, D3 figures differ by design). Appearance only, from the screenshots; no code was read.

## Sideways scroll

No table scrolls sideways in any shot. At 375 and 390 every figure, the Due date and the `91 AND OVER` heading are inside the row's right padding, and no cell is cut. The only content cut at the right edge is the filter chip strip (`Add filter` at 375, the `Customer: All St. Jude Commun…` chip at 375 and 390). That is core's chip strip, as phase 3 found; it is not the table.

## Per screenshot

### populated-anchored-390-light.png / populated-anchored-390-dark.png
State check: VALID. Populated, As of Today, phone arrangement (heading lines: Customer + Due date; Current, 1 - 30, Total; 31 - 60, 61 - 90, 91 and over).
- populated-anchored-390-{light,dark}: rows Bluefin Marine Supply, Cedar & Pine Landscaping, Delta Freight Partners, Marisol Alvarez, Old Mill Bakery (inactive) — Total is drawn on the label's line (right), and the line directly below the label holds 31 - 60. On the other rows (Harborview Hospitality Group, Evergreen Montessori School) the line directly below the label holds Current / 1 - 30 / Total. So the figure at the left below a label is Current on some rows and 31 - 60 on others; only the position of Total tells them apart. — NOTE.
  - Why NOTE and not BLOCKING: the spec says "Current, 1 - 30 and Total on the second [line] … so the second line is on every row and a figure's place always names its age", which this drawing strains. But the approved reference draws the same thing (reference 390: Bluefin Marine Supply `-320.00` on the label's line, `-320.00` at the left below; Old Mill Bakery; No customer with both figures on the label's line). The build loses nothing the reference decided. It looks like core folds the first figures line onto the label's line when the label is short. The driver or the human should decide whether the spec sentence or the reference rules.
- Dark: legible; the muted inactive row is dim but readable, as in the reference.

### populated-anchored-375-light.png / populated-anchored-375-dark.png
State check: VALID. Populated, phone arrangement at 375.
- populated-anchored-375-{light,dark}: same rows as at 390 — Total on the label's line, 31 - 60 directly below the label — NOTE (same finding as 390; counted one time).
- Nothing else found. Long St. Jude labels wrap to two lines, the family total label wraps to two lines, figures stay whole.

### item-opened-anchored-390-light.png / item-opened-anchored-390-dark.png
State check: VALID. Customer filter = "All St. Jude … sub-customers", the gala customer opened, Invoice 1013 opened with its two lines (invoice, payment).
- Nothing found. Due date (`Oct 22, 2026`) is on the item label's line, right of the label; the item's figures are on the line below (1 - 30 and Total); the detail lines are lighter than the item row; family total and Total follow. Matches the reference arrangement.

### item-opened-anchored-375-light.png / item-opened-anchored-375-dark.png
State check: VALID. Same state at 375.
- item-opened-anchored-375-{light,dark}: detail line "2026-11-05 · Payment 1003" — the label wraps and leaves "1003" alone on a second line, while the Due date track to its right is empty on a detail line. The reference line ("2026-11-03 · Payment 317") fits on one line only because its number is shorter. — NOTE.
- Nothing else found. The document header line "Customer: …" breaks as "sub-/customers"; that is core's header.

### populated-900-light.png / populated-900-dark.png (reference populated-1160)
State check: VALID. Populated, tablet arrangement: label + Total on line 1; Due date and the five ages on line 2.
- Nothing found. Heading and figure columns line up; family header, family total, muted inactive row and the heavy Total rule match the reference. The built toolbar has `Export` and a `Sort` chip that the reference does not; both are core's view (D4). No sideways scroll.

### opened-900-light.png / opened-900-dark.png (reference opened-1160)
State check: VALID. "Cedar & Pine Landscaping" opened; its one item (Payment 1004) shows Total on line 1 and `Oct 2, 2026` with `-150.00` in 31 - 60 on line 2.
- Nothing found. Fewer open rows than the reference is data (D3).

### customers-menu-1280-light.png / customers-menu-1280-dark.png (no reference)
State check: VALID. Customers list with the Reports menu open.
- Nothing found. Items in order: Customer Balance, A/R Aging, Sales by Customer; same indent, type and spacing; the menu is anchored under the Reports button and is legible in light and dark. The highlight on the first item is the menu's focus state.

## For gate 3

- None seen.
