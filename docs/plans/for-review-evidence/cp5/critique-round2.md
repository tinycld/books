# Design critique, round 2 — for-review checkpoint 5 (Review keys and help topic)

Re-captured after the fix round (a movement key blurs the element the mouse focused; a list mounted with a focused row scrolls only once measured). Delivers judged: the keyboard focus stripe on the focused row (core `rowFocusStyle`) after `j` twice, and the Files tab reached by `U` / key 4. The help topic has no screenshot in this set.

## State check

| Shot | State named | Shows | Verdict |
|---|---|---|---|
| review-390-light.png | For review, second row focused | For review (8), 4 cards, second card (DEPOSIT CEDAR & PINE) carries a primary left stripe and a row tint | VALID |
| review-390-dark.png | same, dark | same in dark | VALID |
| review-1280-light.png | For review at 1280, second row focused | For review (8) table, second row (Oct 16, DEPOSIT CEDAR & PINE LLC) carries the stripe and a row tint | VALID |
| review-1280-dark.png | same, dark | same in dark | VALID |
| files-390-light.png | Files tab | Files tab active, upload area, file card checking-2026-10.ofx "Imported: 12 transactions" | VALID |
| files-390-dark.png | same, dark | same in dark | VALID |
| files-1280-light.png | Files tab at 1280 | Files tab active, upload area; the file list sits below the fold (panel clipped at the 800 px viewport) | VALID |
| files-1280-dark.png | same, dark | same in dark | VALID |

## Round 1 findings, re-checked

- Selected account card drew the browser's blue focus-visible ring after the key presses (round 1 NOTE): **resolved**. In all four review shots the selected card "1000 Business Checking" draws its border in `primary` teal, the same as the files shots and the references. One accent color is on screen: teal card border, teal tab underline, teal row stripe.
- Sidebar "Banking" highlighted on `?account=<id>` but not on `&tab=files` (round 1 NOTE / gate 3): **now consistent**. All four 1280 shots highlight "Banking". The references highlight it in none, which is a core sidebar matter outside this checkpoint and not a finding.

## Findings

### review-390-light / review-390-dark / review-1280-light / review-1280-dark

- nothing found. The stripe is a ~3 px `primary` bar on the row's left edge, full row height, with a light surface tint on the row; legible in light and dark; the check box, date, description and amount keep their positions and the stripe does not touch the check box. Consistent with the register's `rowFocusStyle` (left indicator in `primary`). The list shows the first rows with the second row focused, so no scroll was needed and none happened (the header and first row are in place).

### files-390-light / files-390-dark

- nothing found. Structure matches the reference: tab bar with Files active, dashed upload area with "Choose file" and the format line, file cards below. The tab bar scrolled to bring Files into view (the left tab reads "review (8)"), as in round 1. The FAB covers the card's "Import" button exactly as in the reference.

### files-1280-light / files-1280-dark

- nothing found. Upload area and its text match the reference. The file table is below the fold because the seeded 2100 Company Card card is taller (Bank statement line) and pushes the panel down; the Files tab scrolls its own content (spec §2), so this is data, not structure.

## For gate 3

- None. The round-1 sidebar inconsistency between `?account=<id>` and `&tab=files` is no longer visible.

## Totals

0 INVALID, 0 BLOCKING, 0 NOTE
