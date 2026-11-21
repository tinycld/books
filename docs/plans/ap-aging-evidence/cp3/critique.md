# Gate 2 critique: ap-aging, checkpoint 3

Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

Compared by D8: built 1280 with reference 1540, built 1024 with reference 1284. Arrangement only; names and figures were not compared. All 20 built shots were read (light and dark).

## State check

| Shot | State shown | Result |
|---|---|---|
| populated-1280-light / dark | Report as it lands: 9 vendor rows closed, Total row, "End of report" | valid |
| populated-1024-light / dark | Same, 8 columns on one line | valid |
| opened-1280-light / dark | Harbor Freight Logistics open: "Bill 1010" and "Vendor credit 1006" with Due dates | valid |
| opened-1024-light / dark | Same | valid |
| item-opened-1280-light / dark | Bill 1010 open: 3 lines "<ISO day> · <type> <number>" | valid |
| item-opened-1024-light / dark | Same | valid |
| by-balance-1280-light / dark | Chip "Order: Largest balance"; vendors by Total, largest first, negative Totals last | valid |
| filtered-1280-light / dark | Chip "Vendor: Harbor Freight Logistics, Pacific Power"; header line "Vendor: …"; 2 vendor rows | valid |
| past-day-1280-light / dark | Chip "As of: Oct 15, 2026"; heading "As of October 15, 2026"; 4 vendor rows | valid |
| empty-1024-light / dark | "No rows as of January 1, 2020", action button, no rows, no column header | valid |

## Findings

- populated-1280-light / dark: nothing found.
- populated-1024-light / dark: nothing found. The 8 columns are on one line, no sideways scroll, no cut figure.
- opened-1280-light / dark: nothing found.
- opened-1024-light / dark: item row "Vendor credit 1006" — the label wraps to 2 lines in the narrow Vendor column — NOTE. The reference (opened-1284, "Vendor credit 12") wraps the same way; spec permits "at most three lines".
- item-opened-1280-light / dark: nothing found.
- item-opened-1024-light / dark: the 3 lines below Bill 1010 — each label wraps to 2 or 3 lines and the wrapped rows have almost no gap between them, so the 3 lines read as one text block — NOTE. The reference (item-opened-1284) has the same density; the limit of three lines holds.
- by-balance-1280-light / dark: nothing found.
- filtered-1280-light / dark: nothing found.
- past-day-1280-light / dark: nothing found.
- empty-1024-light / dark: nothing found.

## Reference decisions that hold in the build

- Vendor rows closed by default; a chevron on each vendor and item row; items indented below the vendor, lines indented below the item.
- Due date shows on item rows only; blank on vendor rows, lines and Total.
- An age with no money is blank on vendor, item, line and Total rows; Total always has a figure.
- Lines are in regular weight, vendor and item rows in semibold; the Total row has the heavy rule and the currency symbol.
- Vendor credit is a negative figure in the column of its own age.
- Heading: business name, "A/P Aging", "As of <day>"; the "Vendor: …" line when vendors are picked.
- Dark scheme: all text, the Total rule and the chips are legible.

## Not shown by the built shots (not findings)

- The seeded book has no inactive vendor and no "No vendor" row, so the muted row and the last-row position are not visible in the build. D10 gives these to the Go tests (`TestAPAgingInactive`, `TestAPAgingNoVendor`).
- The seeded book has no long vendor name, so the 3-line wrap of a vendor row at 1024 is not visible in the build.
- Differences that come from core's real view and not from this checkpoint: sort arrows in the column header, the Export button, no Books sidebar (D8, D9).

## For gate 3

None.
