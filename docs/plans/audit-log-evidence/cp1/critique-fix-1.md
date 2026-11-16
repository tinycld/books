# Design critique, fix round 1: audit-log checkpoint 1 (Audit log view and report)

Scope: the six shots of the fix round (phone 375 and 390, tablet 800), judged against the Delivers line ("phone and tablet layouts"). Capture differences that are not findings: e2e data and business name, no Books sidebar on the real route `/a/reports/<id>`, the "Sort" chip of core's real toolbar (the static reference has none).

Result: 0 INVALID, 0 BLOCKING, 8 NOTE.

Both BLOCKING findings of `critique.md` (report-375-light, report-375-dark: 3-line rows) are closed.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| report-375-light | populated, phone layout, 2 lines per row | valid |
| report-375-dark | populated, phone layout, 2 lines per row | valid |
| report-390-light | populated, phone layout, 2 lines per row | valid |
| report-390-dark | populated, phone layout, 2 lines per row | valid |
| report-800-light | populated, tablet layout (content 736 px, below `oneLine.minWidth` 760 px) | valid |
| report-800-dark | populated, tablet layout | valid |

## Findings

### report-375-light
- Closed: the heading and each row are on 2 lines (Date changed · Event; User · Record type · Record), as reference `report-375-light.png`. The long word breaks inside the Record track ("Studio lamp w1- / 1794788719368-1 …"), and Record stops at 2 text lines with an ellipsis (spec §3: "wraps to 2 lines, then ellipsis"; "A long word in Record breaks inside its line"). Date changed is not cut.
- report-375-light: line 2, Record type track — real labels are cut ("Journal e…", "Product o…"); "Journal line" fits. The reference shows each type in full. No rule says Record type is never cut. Recommendation as before: a wider type track or a wrapping type — NOTE.
- report-375-light: chip row, right edge — a thin cut sliver of the third chip (Sort, see report-800) after "Add filter" — NOTE.

### report-375-dark
- Closed: same 2-line layout as light; text is legible.
- report-375-dark: Record type track — same cut labels — NOTE.
- report-375-dark: chip row, right edge — same sliver — NOTE.

### report-390-light
- The 2-line layout is kept after the fix; the Record word break is the same as at 375.
- report-390-light: Record type track — "Journal en…", "Product o…" are cut — NOTE.
- report-390-light: chip row, right edge — the Sort chip is cut by the screen edge (icon only) — NOTE.

### report-390-dark
- report-390-dark: Record type track — same cut labels — NOTE.
- report-390-dark: chip row, right edge — same cut chip — NOTE.

### report-800-light
- nothing found. The tablet layout agrees with reference `report-1024-light.png` and spec §5 display ("tablet from 600px, 12 tracks (created 4 · user 3 · event 2 · type 3; record 12)"): line 1 has Date changed, User, Event, Record type in full; line 2 has Record on the full width; the heading has the same two lines, without sort arrows. Header (business name, title, period, "Times in Central Time" once) and toolbar (Customize, Save as…, Copy link) agree with the reference. This closes the earlier NOTE about missing tablet evidence.

### report-800-dark
- nothing found. Same layout as light; all text is legible.

## For gate 3
- Nothing new. The third chip in the phone chip row (earlier question) is core's "Sort" chip, shown in full at 800.
