# Design critique — vendor-balance, checkpoint 4 (Reports menu, phone rows, help)

Scope: the Delivers line ("the Vendors list's Reports menu opens the Vendor Balance (above A/P Aging), an opened vendor is proven on a 375 and a 390 px phone"). Help text is not a screenshot subject. Figures and names are not compared (D8).

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Built shot | Shows its state |
|---|---|
| populated-phone-390-light / -dark | Yes. Closed vendor rows, Total, "Expand all". |
| populated-phone-375-light / -dark | Yes. |
| opened-phone-390-light / -dark | Yes. "Harbor Freight Logistics" is open with 3 line rows, "Collapse all". |
| opened-phone-375-light / -dark | Yes. |
| empty-phone-390-light / -dark | Yes. "No rows as of January 1, 2020" with its action. |
| vendors-reports-menu-1280-light / -dark | Yes. Menu is open below the Reports button. |
| vendors-reports-menu-390-light / -dark | Yes. Menu is open as a bottom sheet, title "Reports". |

## Findings

### populated-phone-390-light, populated-phone-390-dark
Nothing found. One plain line for each vendor, muted "(inactive)" row, "No vendor" last, heavy Total rule. Each Balance is complete and ends in a digit. No sideways scroll.

### populated-phone-375-light, populated-phone-375-dark
- populated-phone-375-*: vendor rows — the seeded book has no long vendor name, so no built shot shows a vendor label on two or three lines (the reference shows "Willamette Valley Commercial Cleaning and Janitorial Services Cooperative" on three lines beside 130,115.25). The same applies to the 390 shots. Appearance of that case is not proven by these shots; e2e 10 and 11 are the proof — NOTE

### opened-phone-390-light, opened-phone-390-dark
- opened-phone-390-*: line rows below "Harbor Freight Logistics" — the wrapped labels of adjacent line rows have no space between them (line 2 of one row touches line 1 of the next), so the row limits are hard to see. The reference has the same arrangement (core row layout) — NOTE

Labels wrap to two and three lines, each Balance (860.00, -200.00, -137.25) is complete and on its label's band. No sideways scroll. Matches the reference arrangement.

### opened-phone-375-light, opened-phone-375-dark
Nothing found (the spacing NOTE above applies here too; it is counted one time). "Seed A/P aging: storage overcharge credit" wraps to three lines, not cut. Each Balance is complete.

### empty-phone-390-light, empty-phone-390-dark
Nothing found. Same structure as the reference: heading, empty text with the day in words, one action.

### vendors-reports-menu-1280-light, vendors-reports-menu-1280-dark
- vendors-reports-menu-1280-*: menu items — the labels start about 40 px from the menu's left edge with no icon in that space (the 390 sheet shows the same: items at x=50, title at x=20). The left space looks empty — NOTE

Two items, "Vendor Balance" above "A/P Aging", core Menu items, no clipped label, menu inside the viewport, legible in light and dark.

### vendors-reports-menu-390-light, vendors-reports-menu-390-dark
Nothing found (the indent NOTE above applies; it is counted one time). Two items, "Vendor Balance" above "A/P Aging", no clipped label, the sheet stops above the tab bar. The header keeps "Reports" and "New vendor" on one line with the title.

## Differences from the reference that are not findings
- The built column headers show sort marks ("VENDOR ⇅", "⇅ BALANCE"); the static reference does not. Core's live view.
- The built tab bar does not mark Books as active on `/a/reports/<id>`; the scratch route is a Books route. D8.
- Business name, dates, vendors and figures. D8.

## For gate 3
None.
