# Design critique — for-review checkpoint 5 (Review keys and help topic)

Delivers judged: the keyboard focus stripe on the focused row (core `rowFocusStyle`) after `j` twice, and the Files tab reached by `U` / key 4. The help topic has no screenshot in this set.

## State check

| Shot | State named | Shows | Verdict |
|---|---|---|---|
| review-390-light.png | For review, second row focused | For review (8), 4 cards, second card (DEPOSIT CEDAR & PINE) carries a primary left stripe and a row tint | VALID |
| review-390-dark.png | same, dark | same in dark | VALID |
| review-wide-1280-light.png | For review at 1280, second row focused | For review (8) table, second row (Oct 16, DEPOSIT CEDAR & PINE LLC) carries the stripe and a row tint | VALID |
| review-wide-1280-dark.png | same, dark | same in dark | VALID |
| files-390-light.png | Files tab | Files tab active, upload area, file card checking-2026-10.ofx "Imported: 12 transactions" | VALID |
| files-390-dark.png | same, dark | same in dark | VALID |
| files-1280-light.png | Files tab at 1280 | Files tab active, upload area; the file list sits below the fold (panel clipped at the 800 px viewport) | VALID |
| files-1280-dark.png | same, dark | same in dark | VALID |

## Findings

### review-390-light / review-390-dark / review-wide-1280-light / review-wide-1280-dark

- review-*: focused row — the stripe is a ~3 px `primary` bar flush with the row's left edge, full row height, with a subtle surface tint on the row; legible in light and dark, the check box, date and description keep their positions, and the stripe does not collide with the check box (wide: stripe at the table edge, box 30 px in; phone: stripe on the card's left edge). Consistent with the register's `rowFocusStyle` as described (left indicator in `primary`). Nothing found on the stripe itself.
- review-*: account strip, selected card "1000 Business Checking" — after the keyboard presses the selected card's border draws in blue (light) / light blue (dark), the browser's default focus-visible outline, while the same card in the files-* shots and in every reference draws its selected border in `primary` teal. Two accent colors are on screen at once (blue card ring, teal row stripe, teal tab underline). The card holds DOM focus from the mouse press that selected it and keyboard input turns the focus-visible ring on; the app gives the card no focus-visible style of its own. — NOTE (no spec or design-system rule names the card's focus ring; it is a polish inconsistency that the keyboard flow now makes visible).
- review-wide-1280-*: sidebar — "Banking" is highlighted as the active item here but not in files-1280-* (URL `&tab=files`), and the references highlight it in neither. The active match seems to depend on the query string. Not this checkpoint's delivery (sidebar matching is core / earlier), recorded so it is not lost. — NOTE

### files-390-light / files-390-dark

- nothing found. Structure matches the reference: tab bar with Files active, dashed upload area with "Choose file" and the format line, file cards below. The tab bar has scrolled to bring Files into view (the left tab reads "review (8)"); the reference shows the left tab whole and Files cut, so the build's choice is the better one for the active tab. The FAB covers the card's "Import" button exactly as in the reference.

### files-1280-light / files-1280-dark

- nothing found. Upload area and its text match the reference. The file table is below the fold only because the seeded 2100 Company Card card is taller (it carries a Bank statement line), which pushes the panel down 62 px; the Files tab scrolls its own content (spec §2), so this is data, not structure.

## For gate 3

- Sidebar "Banking" active state differs between `?account=<id>` (highlighted) and `?account=<id>&tab=files` (not highlighted); the active-route match should ignore the query string. Behavior, outside this checkpoint.

## Totals

0 INVALID, 0 BLOCKING, 2 NOTE
