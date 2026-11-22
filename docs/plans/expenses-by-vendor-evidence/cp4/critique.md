# Gate 2 critique: expenses-by-vendor, checkpoint 4

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

Scope: the Delivers line (Reports menu item, phone two-line rows with no sideways scroll, help). Help text has no screenshot and is not judged here. Each built shot was read in light and dark and compared with its reference pair. Names and figures differ from the reference (seeded e2e book); only structure, type, spacing, alignment and states were compared.

## State check

| Shot | Light | Dark | Shows |
|---|---|---|---|
| populated-phone-390 | valid | valid | 12 vendor rows closed, "No vendor" last, Total row, "End of report" |
| populated-phone-375 | valid | valid | the same at 375 |
| opened-phone-390 | valid | valid | Harbor Freight Logistics opened, 2 lines (Bill 1010, Vendor credit 1006); toolbar reads "Collapse all" |
| opened-phone-375 | valid | valid | the same at 375 |
| cash-phone-390 | valid | valid | chip "Method: Cash", header "Cash basis", Harbor Freight Logistics opened with 7 lines, take-out rows included |
| empty-phone-390 | valid | valid | Period Jan 1 – Jan 31, 2020; "No rows for January 1 – January 31, 2020" with "Show this fiscal year" |
| vendors-reports-menu-1280 | valid | valid | Reports menu open: Vendor Balance, A/P Aging, Expenses by Vendor |
| vendors-reports-menu-390 | valid | valid | Reports sheet open with the same three items in the same order |

loading-phone-390 and error-phone-390: reference only, no built shot (core report view states, as in checkpoint 1). Not judged.

## Findings

- populated-phone-390-light / -dark: nothing found. Name on line 1 across the row; Total and % of expenses on line 2, right-aligned under their headers. The long vendor name wraps to 2 lines with no cut. No figure is cut. The inactive row is muted and readable in both themes. The Total row has the heavy rule. No sideways scroll of the table.
- populated-phone-375-light / -dark: nothing found. Same arrangement; figures complete; no sideways scroll.
- opened-phone-390-light / -dark: nothing found. Opened lines are indented under the vendor, labels wrap to 2 and 3 lines, each amount is under Total at the same right edge as the vendor's Total, % of expenses is blank on the lines. Matches the reference structure.
- opened-phone-375-light / -dark: nothing found. Labels wrap to at most 3 lines; figures complete; no sideways scroll.
- cash-phone-390-light / -dark: nothing found. Each ledger line is directly above its take-out row, as the reference shows. The longest labels take 3 lines with no cut. Negative figures are complete.
- empty-phone-390-light / -dark: nothing found. Same structure as the reference (header, centered text, one action).
- vendors-reports-menu-1280-light / -dark: nothing found. The third item is in the same type, spacing and alignment as the two present items; the popover is inside the view and under its trigger.
- vendors-reports-menu-390-light / -dark: bottom of the Reports sheet — the last item, "Expenses by Vendor", is about 8 px above the tab bar, less than the space above the first item; with three items the sheet looks tight at the bottom — NOTE.

Differences from the reference that are not findings:
- The tab bar marks no tab as active on the built report shots; the reference marks Books. The reference was captured on the Books scratch route; the shipping route is core's `/a/reports/<id>` (plan D8).
- Organization name, vendors, figures and document numbers differ (seeded e2e book).

## For gate 3

Nothing visible.
