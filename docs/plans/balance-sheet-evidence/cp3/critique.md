# Gate 2 critique — balance-sheet checkpoint 3 (Phone, tablet widths and help)

Delivers judged: the Balance Sheet reads well on a phone (label, then Current · Prior year · Change; no % change; no sideways scroll), fits at tablet and desktop widths with figures never cut, and help. Help is not visible in the shots and is not judged here.

Known, not raised: no-lines totals read "0.00" without "$" (ledger Rebuttals, open with the human).

## State check

| shot | state | result |
|---|---|---|
| populated-390 light/dark | populated, phone, mobile layout | valid |
| populated-1024 light/dark | populated, tablet width, one-line layout | valid |
| populated-1280 light/dark | populated, desktop, one-line layout | valid |
| rows-active-390 light/dark | Rows: Active chip, populated | valid |
| collapsed-390 light/dark | every section folded, Expand all offered | valid |
| no-lines-390 light/dark | As of Aug 14, 2024, every figure 0.00, three sections with Retained earnings and Net income | valid |
| customize-390 light/dark | Customize sheet open over the report | valid |
| opened-390 light/dark | 1000 Business Checking opened into its lines | valid |

0 INVALID.

## Findings

### populated-390 (light and dark)
- Toolbar chip row — a third chip "↑↓ Sort" follows As of and Rows. The reference phone toolbar and spec §3 ("Expand all / Collapse all in core's toolbar", "Customize (core)", "copy a link, and 'Save as'") list no Sort control. Core's view adds it for any report with a `sort`; a reader-chosen sort on a statement outline is odd. NOTE (core-owned; if core offers a way to switch off reader sort for a layout report, use it; see "For gate 3").
- Bottom tab bar — no tab is active (the reference showed Books active because the scratch route lived under Books; the real route is core's `/a/reports/<id>`, spec §2). A phone screen with no highlighted tab reads as orphaned. NOTE (core shell, a consequence of the spec's route decision; not this checkpoint's to fix).
- Table: label line then Current · Prior year · Change, no % change, nothing clipped at the right edge, heading wraps the same way as the rows, light and dark legible. Matches the reference.

### populated-1024 (light and dark)
- Column headings — every heading carries a "↑↓" sort affordance; the reference headings have none. The affordance sits after ACCOUNT but before each figure heading (inner side), so the header reads unevenly. NOTE (core-owned).
- Fit: one-line layout, every heading and figure inside the right edge, % change shown, blank where Prior year is 0.00. Nothing else found.

### populated-1280 (light and dark)
- Same sort-affordance NOTE as 1024 (one finding, not re-counted).
- Otherwise nothing found: headings and figures inside the right edge, hierarchy and subtotal rules match the reference.

### rows-active-390 (light and dark)
- Nothing found beyond the populated-390 notes (same screen, Active chip).

### collapsed-390 (light and dark)
- Nothing found. Three folded sections, each section total under its heading, Total liabilities and equity last, End of report; matches the reference.

### no-lines-390 (light and dark)
- As of chip — a focus ring is drawn around the chip's text only; the calendar icon sits outside the ring, so the ring looks mis-sized. NOTE (core chip focus style; capture left the chip focused).
- Toolbar chip row, right edge — the Sort chip is cut mid-word ("↑↓ So") with no fade or gutter, so the row looks truncated rather than scrollable. NOTE (core toolbar).
- "0.00" without "$" on totals: known, not raised.

### customize-390 (light and dark)
- Nothing found. Number format, Negative numbers, Columns (Current, Prior year, Change, % change), Reset to defaults; matches the reference.

### opened-390 (light and dark)
- Nothing found. Opened lines labelled "<date> · <entry> · <memo>", one line with ellipsis on long memos, Current and Prior year shown, Change blank (N5); matches the reference.

## Summary
0 INVALID, 0 BLOCKING, 5 NOTE (Sort chip; no active tab; heading sort affordance; As-of focus ring; clipped Sort chip).

## For gate 3
- The phone "Sort" chip and the desktop heading sort affordances: check what sorting by a figure column does to a layout statement (section › class › type › account with subtotals). If it reorders rows across the outline or detaches subtotals, that is a behavior defect in core's view for layout reports, not a Books spec issue.
