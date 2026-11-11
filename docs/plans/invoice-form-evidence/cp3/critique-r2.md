# Gate 2 design critique — invoice-form, checkpoint 3 (after fix round 2)

Scope: only the four shots the fix captured again: `exempt-1280-light/dark`, `no-tax-1280-light/dark`. The finding the fix answered: r1 BLOCKING 2, "Description cell scrolled to its tail with the first line clipped". Column widths (r1 BLOCKING 1) and the phone DateField (r1 BLOCKING 3) are handled elsewhere and not repeated here.

Delivers: `books/invoices/new` and a draft at `books/invoices/[id]`: the header band with every built-in and its fills, the four-kind line table on core `TableField`, live totals and Balance due, Save draft / Cancel / Delete draft with keys, every load state, the + New → Invoice entry, the customer form's Terms built-in, and focus on Customer at open (web).

## State check

| shot | light / dark | state shown | valid |
|---|---|---|---|
| exempt-1280 | both | Northwind Traders (exempt), Wireless access point line, Tax toggle off, Tax "Denver combined 8.71%", tax line $0.00, total $189.00 | yes |
| no-tax-1280 | both | Harborview Hospitality Group, Tax None, Tax toggle on, totals with no tax line (Subtotal, Total, Balance due) | yes |

0 INVALID.

## Fix verification

- exempt-1280 (light and dark): the Description cell now starts at its first line: "Wi-Fi 6E / ceiling-mount / access point," with the fourth line cut at the cell's bottom edge. The cell is focused (the pick moved focus Product → Description, as §3.1's Tab order says) and is not scrolled. r1 BLOCKING 2 is resolved here.
- no-tax-1280 (light and dark): the same cell unfocused also starts at its first line. r1 BLOCKING 2 is resolved here.
- The fourth line's top edge shows as a sliver under line 3 ("installed and"). The reference (`no-tax-1280-*`, "review" under line 2) shows the same sliver on a 3-line cell, so this is the reference's own decision, not a finding.

## Findings

### exempt-1280 (light and dark)
- exempt-1280: line 1 Description cell, focus ring — the focused cell draws a 2 px blue ring (light: a saturated blue; dark: a pale blue-grey), while every other accent on the screen (links, Save draft, the toggle) is teal. If this is core TextInput's standard focus style it is nothing; if the cell draws its own, it is off-palette. — NOTE
- Persisting r1 NOTEs visible here, not recounted: "Lines *" heading over the grid (r1 NOTE 5); row menu "⋮" above the row centreline (r1 NOTE 4); "BALANCE DUE" uppercase (r1 NOTE 6); Tax select "8.71%" vs totals "(8.71%)" (r1 NOTE 7); totals tax label "Denver combined (8.71%)" wraps to two lines (r1 NOTE 8); Tax half width alone on a row (r1 NOTE 2).

### no-tax-1280 (light and dark)
- nothing found beyond the persisting r1 NOTEs (NOTE 2, 4, 5, 6). With Tax None the totals block drops the tax line and keeps Subtotal, Total (`border-t`, bold) and Balance due, as spec §3.4 says and the reference shows.

## Tally

- INVALID: 0
- BLOCKING: 0 (new); r1 BLOCKING 2 resolved; r1 BLOCKING 1 and 3 handled elsewhere, not judged here.
- NOTE: 1 (new: the Description cell's focus ring colour); r1 NOTEs persist unchanged and are not recounted.

## For gate 3
- exempt-1280: focus sits in the Description cell after the product pick (Product → Description is the next Tab stop, §3.1). Confirm the caret is at the start or end of the prefilled text and that the cell does not scroll when the caret lands at the end on a 4-line description (the capture shows the top; a caret at the end that later scrolls the cell would bring r1 BLOCKING 2 back on focus).
