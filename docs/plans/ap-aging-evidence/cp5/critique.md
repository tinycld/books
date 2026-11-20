# Gate 2 critique: ap-aging, checkpoint 5

Scope: the narrow layouts of the A/P Aging (tablet arrangement at 900, phone arrangement at 390 and 375, empty state on a phone). Each built shot was compared with its reference (D8: reference `*-1160-*` = built 900), light and dark. Names and figures differ by design (D8: seeded book, not the fixture).

Verdict: 0 INVALID, 0 BLOCKING, 2 NOTE.

## State check

| Shot (light and dark) | Shows its state | What it shows |
|---|---|---|
| populated-900 | yes | 9 vendor rows, all closed, Total row, "End of report" |
| opened-900 | yes | Harbor Freight Logistics open: Bill 1010 and Vendor credit 1006, each with its Due date |
| item-opened-900 | yes | Bill 1010 open: 3 lines (bill, vendor credit, bill payment) |
| populated-phone-390 | yes | 9 vendor rows closed, phone arrangement |
| populated-phone-375 | yes | same at 375 |
| item-opened-phone-390 | yes | Harbor Freight Logistics and Bill 1010 open, 3 lines |
| item-opened-phone-375 | yes | same at 375 |
| empty-phone-390 | yes | "No rows as of January 1, 2020" with the action "Show end of last fiscal year" |

## Findings

- populated-900 (light, dark): nothing found. Tablet arrangement as the reference and the spec: label and Total on line 1, Due date and the five ages on line 2. Blank ages are blank. The Total row is the heaviest line. No figure is cut. The toolbar fits on one line.
- opened-900 (light, dark): nothing found. Item rows are indented below the vendor, Due date on the second line, amount in its age column and in Total.
- item-opened-900 (light, dark): nothing found. Lines are lighter than item rows, labelled "<date> · <type> <number>", amount in the item's age column and in Total, as the reference.
- populated-phone-390 (light, dark): right column, rows Harbor Freight Logistics and Pacific Power — the Total is on the label line for these rows and on the second line for the others, so the eye must look for the Total at two heights. The reference shows the same behavior (Cascade Fuel & Fleet, Pacific Power, No vendor); it is core's wrap of empty tracks. — NOTE
- populated-phone-375 (light, dark): nothing found. Three tracks, no figure cut, headers on three lines match the rows.
- item-opened-phone-390 (light, dark): lines below Bill 1010 — the labels "2026-10-20 · Vendor credit 1006" and "2026-11-04 · Bill payment 1003" wrap to two lines (four-digit numbers of the seeded book; the reference wraps only at 375), and the gap between a line's last figure and the next line's label is smaller than the gap between other rows, so the three lines read crowded. Nothing is cut. — NOTE
- item-opened-phone-375 (light, dark): the same wrap as at 390; counted in the NOTE above. Item Due date is on the first line and the item Total on the second, as the spec's phone arrangement.
- empty-phone-390 (light, dark): nothing found. Equal to the reference: heading, empty text for the day, one action, centered.

## Not a finding (checked)

- The chip strip (`report-controls`) cuts "Add filter" at the right edge on phones. It is core's sideways chip strip, the same in the reference and in the capture notes. It is not a table.
- Built shots have Export and Sort, no Books sidebar, and no highlighted Books tab. These come from the shipping route `/a/reports/<id>` (D8).
- The built book has no inactive vendor, no "No vendor" row and no vendor with a long name, so the muted row and the wrapped label of the reference are not in the built shots. D8 and D10 give them to Go tests and to e2e tests 2 and 3.
- Dark mode: all text, the muted header labels and the Total rule are legible.

## Not judged

- The Vendors list's Reports menu (`vendors-reports`) is in the Delivers line, but no built screenshot shows it. Its appearance was not judged.

## For gate 3

Nothing seen.
