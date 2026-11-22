# Gate 2 design critique — expenses-by-vendor, checkpoint 1

Scope: the Delivers line of checkpoint 1 (one row per vendor with Total and % of expenses, the No vendor row, the Total row, the five params, the heading). Opened vendor lines (reference `with-activity`, `filtered`) belong to checkpoint 2 and are not judged. Built widths by D8.

Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

## State check

| Built shot | Light | Dark | Shows |
|---|---|---|---|
| populated-1280 | valid | valid | 11 vendor rows, muted "Coastal Coffee Roasters (inactive)", the long Willamette name, "No vendor" directly above Total |
| populated-1024 | valid | valid | the same rows; all three columns in view |
| populated-768 | valid | valid | the same rows; the Willamette name on two lines; all three columns in view |
| with-activity-1280 | valid | valid | chip "Rows: With activity"; "Metro Commercial Properties" at 0.00 and 0.00% |
| by-amount-1280 | valid | valid | chip "Order: Largest expenses"; rows by Total, largest first; "No vendor" last |
| filtered-1280 | valid | valid | chip "Vendor: Harbor Freight Logistics, Pacific Power"; heading line "Vendor: …"; two rows; no "No vendor" row; Total $868.37 |
| zero-1280 | valid | valid | Period Sep 16, 2026, With activity; three rows; Total $0.00; % of expenses blank on each row and on the Total |
| empty-1024 | valid | valid | "No rows for January 1 – January 31, 2020" with "Show this fiscal year"; no table |

## Findings

- populated-1280 (light, dark): nothing found.
- populated-1024 (light, dark): nothing found.
- populated-768 (light, dark): page title, top left — the title is cut to "Expenses by …" because the toolbar has five buttons (the reference at the same content width has four, with no Export, and shows the full title). The full title is in the document heading directly below. This is core's report view, which this unit does not change — NOTE.
- populated-768 (light, dark): the Willamette row — the two-line name is in a row of the same height as the one-line rows, so its top and bottom space is small. The reference `populated-1028` shows the same. A three-line name is not in any capture — NOTE.
- with-activity-1280 (light, dark): nothing found.
- by-amount-1280 (light, dark): nothing found.
- filtered-1280 (light, dark): nothing found.
- zero-1280 (light, dark): nothing found.
- empty-1024 (light, dark): nothing found.
- loading-1284, error-1284 (reference only, light and dark): core report view states (spinner; "Could not load this report" with Retry). Nothing in them is Books-specific. Nothing found.

## Compared with the reference

Kept: the title and toolbar, the chip row (Period, Method, Rows, Order, Add filter; Vendor chip with its remove control when set), the document heading (business name, title, period in words, basis line, Vendor line), the three columns with right-aligned figures, the muted inactive row, "No vendor" last, the heavy rule above the Total, the currency symbol on the Total only, "End of report", the empty text with its action.

Differences that are not findings: the built toolbar has Export and the built column headers have sort marks (real core components); the built pages have no Books sidebar (D8); names and figures are from the seeded book.

No table scrolls sideways at 1280, 1024 or 768. Light and dark are both legible; the muted row is readable in dark.

## For gate 3

- The heading's first line is "Test Organization". Spec: "The Books business name". Check that this is the Books business name of the seeded e2e book and not the organization name used as a fallback.
