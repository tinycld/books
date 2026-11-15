# Gate 2 critique: checkpoint 2, `filtered` re-capture

Scope: `filtered-{390,1280}-{light,dark}.png` only, against `sales-tax-liability-reference/filtered-*.png`.
Figures are not compared (D7). The built route is core's `/a/reports/<id>`, so the Books sidebar of the reference is not expected.

## State check

| shot | state | result |
|---|---|---|
| filtered-1280-light | Agency chip reads "Agency: Colorado Department of Revenue" with a clear (x); Period "Oct 1 – Oct 31, 2026"; only that agency's rows, its total and Total | VALID |
| filtered-1280-dark | same | VALID |
| filtered-390-light | Agency chip reads "Agency: Colorado…" (cut by the chip row's edge, as in the reference); only that agency's rows; "Total Colorado Department of Revenue" and "Total" both show | VALID |
| filtered-390-dark | same | VALID |

## Findings

### filtered-1280-light
Nothing BLOCKING.
- Arrangement agrees with the reference: agency row open with blank figure cells, five rate rows closed and indented in name order, "Total Colorado Department of Revenue" and "Total" with Tax amount only, heavy rule above Total, "End of report".
- filtered-1280-light: column headings — the sort mark is after "TAX NAME" and before each figure heading; the reference has no sort marks. Core's view (D4), not this checkpoint — NOTE.

### filtered-1280-dark
Nothing found. Contrast of labels, figures, rules and chips is good.

### filtered-390-light
Nothing BLOCKING.
- Phone lines agree with spec §5 display and D3: label on line 1, Gross total · Non-taxable on line 2, Taxable amount · Tax amount on line 3; agency row and totals show no sales figures; the long rate name ends in an ellipsis on one line.
- filtered-390-light: rate rows, left figure track — the right edge of line 2 (Gross total, x≈200) and of line 3 (Taxable amount, x≈220) differ by about 20 px, so the two left figures of a rate do not align. The reference has the same offset — NOTE.
- filtered-390-light: rate rows — the figures carry no label on the row; a reader must go back to the 3-line heading to know which of the four numbers is which. The reference decided this arrangement — NOTE.
- filtered-390-light: Total row — it sits directly on the tab bar with no "End of report" in view. The page scrolls and the reference shows the same — NOTE.

### filtered-390-dark
Nothing BLOCKING. Same three NOTEs as filtered-390-light (counted once). Contrast is good; the rule above Total is clear.

## For gate 3
None seen.

## Verdict
CRITIQUE: 0 INVALID, 0 BLOCKING, 4 NOTE
