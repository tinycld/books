# Gate 2 critique: reconciliation-report, checkpoint 0 (core group-only cells on sections)

Scope judged: the Delivers line only. An open section row keeps its group-only cells (Statement ending, Reconciled on), and the subtotal row does not carry them. All other report output stays the same.

All 24 built screenshots were read and compared with the 24 references of the same name. No built shot shows a visible difference from its reference.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| Shot (light and dark) | State shown | Valid |
|---|---|---|
| report-1700 | one statement (filter chip "Statement: Oct 31, 2026"), one section, populated | yes |
| report-1540 | same, two-line tablet arrangement | yes |
| report-1284 | same, two-line tablet arrangement | yes |
| report-1028 | same, two-line tablet arrangement, section cells on a second line | yes |
| report-390 | same, phone arrangement | yes |
| report-375 | same, phone arrangement | yes |
| report-all-1700 | no filter, all finished reconciliations, populated | yes |
| report-all-1540 | same, tablet arrangement | yes |
| report-all-1028 | same, tablet arrangement | yes |
| report-all-390 | same, phone arrangement | yes |
| report-all-375 | same, phone arrangement | yes |
| report-account-1700 | filter chip "Account: 1000 Business Checking", three sections, populated | yes |

## Findings per screenshot

What the checkpoint delivers is present in every shot: each open section row shows Statement ending and (where the arrangement has the column) Reconciled on, in bold, in its own columns. No "Total ..." row shows a date or a date-time. Debit, Credit and Balance on subtotal and total rows are as in the reference. The grand total has no Balance. Light and dark are both legible. No table scrolls sideways at any captured width.

- report-1700-light, report-1700-dark: nothing found.
- report-1540-light, report-1540-dark: nothing found.
- report-1284-light, report-1284-dark: nothing found.
- report-1028-light, report-1028-dark: nothing found. (The subtotal label "Total 1000 Business Checking · reconciled b…" is cut: settled difference 6, not a finding.)
- report-390-light, report-390-dark: section row, second line — the statement date "Oct 31, 2026" is alone on its line, offset to the right under the STATEMENT ENDING header, with no label beside it. A reader must go back to the column header to know what the date is. Same as the reference — NOTE.
- report-375-light, report-375-dark: same as report-390 — covered by the NOTE above. (The section label "… reconciled by Ana R…" is cut at 375: core's label rule, same as the reference, not a finding.)
- report-all-1700-light, report-all-1700-dark: nothing found. The section 1020 (no cleared row) shows its two group-only cells, the Beginning balance row and a subtotal with Balance only, as the reference.
- report-all-1540-light, report-all-1540-dark: section "1010 Business Savings · reconciled by Marcus Bellweather-Okonkwo of Harbor Lane Bookkeeping Partners" — the long label moves the two group-only cells to a second line, while every other section in the same shot has them on the label's line. The section rows have two different heights and the dates of this one section are not on the baseline of the label. Same as the reference — NOTE.
- report-all-1028-light, report-all-1028-dark: nothing found. (Every section row has its cells on a second line here, so the rows are consistent.)
- report-all-390-light, report-all-390-dark: same as report-390 — covered by that NOTE.
- report-all-375-light, report-all-375-dark: same as report-390 — covered by that NOTE.
- report-account-1700-light, report-account-1700-dark: nothing found.

One NOTE for all two-line arrangements (report-1540, report-1284, report-1028, report-all-1540, report-all-1028): the header row puts STATEMENT ENDING and RECONCILED ON on header line two, under DEBIT and CREDIT. On the section row these two values are in the only line of the row, at the height where detail rows show Debit and Credit. The eye can read the bold date as a figure column value. Same as the reference — NOTE.

## Not findings (settled or out of scope)

- Subtotal label cut on tablet and phone rows: settled difference 6.
- Phone arrangement has no Reconciled on column: settled difference 5.
- Column order and widths: settled differences 4 and 5.
- Empty, loading and error states of the report: not in this checkpoint's capture set.

## For gate 3

Nothing visible.
