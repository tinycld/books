# Gate 2 design critique — vendor-balance, checkpoint 2 (Opened vendors and their transactions)

Judged: the Delivers line (a vendor row and the No vendor row open in place into their posted lines, labelled and ordered by the spec). Names and figures are not judged (D8). Built shots compared with the references by the D8 width map (1280 ↔ 1540, 1024 ↔ 1284, 768 ↔ 1028).

Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

## State check

| Shot | State shown | Result |
|---|---|---|
| opened-1280-light.png | "Harbor Freight Logistics" opened (3 lines), "No vendor" opened (1 line) | VALID |
| opened-1280-dark.png | the same, dark | VALID |
| opened-1024-light.png | the same | VALID |
| opened-1024-dark.png | the same, dark | VALID |
| opened-768-light.png | the same | VALID |
| opened-768-dark.png | the same, dark | VALID |

## What the reference decided, and the build

All six shots keep each decision:

- One plain line per vendor, semibold, with a chevron; an opened vendor has a down chevron.
- Opened lines are directly below their vendor, indented, regular weight, with no chevron; the label is "<ISO day> · <type> <number> · <description>" (spec §3 "Opening a vendor"); the amount is in the one Balance column, right-aligned on the vendor figures.
- The lines are in date order (2026-08-20, 2026-10-06, 2026-11-04). The bill is positive, the vendor credit and the bill payment are negative, and they add up to the vendor row (860.00 − 200.00 − 137.25 = 522.75).
- "Old Town Print Shop (inactive)" is muted, label and figure.
- "No vendor" is the last row before Total and opens into its line like a vendor row.
- Total has the heavy top rule and the semibold figure with the currency sign.
- No sideways scroll at 1280, 1024 or 768; no figure is cut.
- Light and dark: all text is legible; the muted row is dim in dark but readable, the same as the reference.

Differences that are not findings:

- The built toolbar has Export and the column headers have sort marks; the reference (a static model) has neither. Core's view (D9).
- The reference shows a long line label that wraps to two lines at 1284 and 1028. The seeded book has no label that long, so these shots do not show a wrap. The wrap is core's `display.columns.name` behavior; the phone shots of checkpoint 4 cover it.
- The seeded book has no vendor refund line under the opened vendor. Data, not arrangement.

## Findings

- opened-1280-light.png: nothing found.
- opened-1280-dark.png: nothing found.
- opened-1024-light.png: nothing found.
- opened-1024-dark.png: nothing found.
- opened-768-light.png: toolbar, page title — the title is cut to "Vendor Balan…" beside the five toolbar buttons. The reference at the matching width shows the full title, but with four buttons (no Export). The toolbar is core's report view (D9) and is not in this checkpoint's Delivers line; the document header below shows the full title — NOTE
- opened-768-dark.png: toolbar, page title — the same cut title "Vendor Balan…" — NOTE

## For gate 3

Nothing visible.
