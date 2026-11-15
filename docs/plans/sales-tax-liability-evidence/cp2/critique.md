# Design critique: sales-tax-liability, checkpoint 2, gate 2

Scope: the Delivers line (report by agency open and rate closed, four figures on rate rows and only the tax above them, Period and Agency params, empty state, phone layout). Figures are not compared (D7). `loading-*`, `error-*`, `rate-open-*` are not compared (D4, checkpoint 3).

Result: 0 INVALID, 0 BLOCKING, 5 NOTE.

## State check

| shot | state shown | valid |
|---|---|---|
| populated-390-light / -dark | October 2026, agencies open, rates closed, phone lines | yes |
| populated-1280-light / -dark | October 2026, three agencies open, rates closed, Total | yes |
| collapsed-390-light / -dark | all agencies closed ("Expand all" offered), Total | yes |
| collapsed-1280-light / -dark | all agencies closed ("Expand all" offered), Total | yes |
| filtered-390-light / -dark | Agency chip "Agency: Colorado…", only Colorado Department of Revenue rows | yes |
| filtered-1280-light / -dark | Agency chip set, only Colorado Department of Revenue, its total and Total | yes |
| empty-390-light / -dark | September 2026, "No rows for September 1 – September 30, 2026", no rows | yes |
| empty-1280-light / -dark | same | yes |

## Findings

### populated-390-light, populated-390-dark
- populated-390: chip row, right edge — a third chip (sort) is cut by the screen edge; the reference shows two chips that fit — NOTE (core's toolbar, D4; the row scrolls sideways).
- Arrangement agrees with the reference and D3: label on line 1, Gross total · Non-taxable on line 2, Taxable amount · Tax amount on line 3; agency rows carry no figures; "Total <agency>" shows the tax alone. Light and dark are legible.

### populated-1280-light, populated-1280-dark
- populated-1280: column headings — each heading has a sort arrow; the reference headings have none — NOTE (core's sort, D4; the headings stay aligned with their figures).
- Otherwise nothing found. Order, indents, blank sales cells on agency, "Total <agency>" and Total rows agree with the reference and spec §3. The long rate name shows in full (the reference cut it), which is better.

### collapsed-390-light, collapsed-390-dark
- nothing found. Same arrangement as the reference (a long agency name puts its tax on the next line; "Old county agency" keeps it on line 1, as the reference does).

### collapsed-1280-light, collapsed-1280-dark
- collapsed-1280: toolbar, "Expand all" — the button is drawn in the accent color (hover or focus left by the press that collapsed the rows); the reference button is neutral — NOTE (a capture effect, not a layout defect).

### filtered-390-light, filtered-390-dark
- filtered-390: bottom of the shot — the shot is 844 px high and stops at "RTD transit", which the tab bar cuts; the reference is 1200 px high and shows "Total Colorado Department of Revenue" and Total. The total rows of this state are not in evidence at 390 — NOTE (capture height; the same rows are visible and correct in populated-390 and filtered-1280).
- Agency chip is cut at the screen edge in the same way as the reference.

### filtered-1280-light, filtered-1280-dark
- nothing found (sort arrows: see populated-1280).

### empty-390-light, empty-390-dark
- nothing found. Text, wrap and the core Button action agree with the reference (lesson 10 satisfied).

### empty-1280-light, empty-1280-dark
- empty-1280: chip row — a "Sort" chip shows beside "Add filter" while the report has no rows; the reference has no such chip — NOTE (core's view, D4).

## Not findings (expected differences)
- Built shots are core's `/a/reports/<id>` route: no Books sidebar at 1280, no active tab at 390, organization "Test Organization", period chip "Period: Oct 1 – Oct 31, 2026" (Custom, per the gate's instructions) in place of "Last month".
- Figures differ from the reference (D1, D7).

## For gate 3
- None visible.
