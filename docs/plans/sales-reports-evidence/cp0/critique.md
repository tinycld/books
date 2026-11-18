# Design critique: sales-reports, checkpoint 0 (percent columns print their scale)

Scope judged: the Delivers line only. "% of sales" prints 2 places in the view; no figure is cut at 375 and 390; the label lines are as before; nothing is cut at 1280.

Viewed (built): all 8 shots at 375, all 16 shots at 390, all 12 light shots at 1280. No light shot showed a problem, so no 1280 dark shot was opened.
Viewed (reference, before the change): the 4 light shots at 375, `customer-populated`, `customer-filtered` and `product-populated` at 390 light, `customer-populated` at 1280 light.

## State check

| Shot | State shown | Result |
|---|---|---|
| customer-populated 375 / 390 / 1280 | Rows, families open, inactive rows muted | valid |
| customer-opened 375 / 390 / 1280 | Aspen Ridge Dental and Bluefin Marine Supply open into sale lines | valid |
| customer-by-sales 390 / 1280 | Order: Largest sales, families by total | valid |
| customer-filtered 390 / 1280 | Customer filter set, "Customer: …" header line | valid |
| customer-zero-total 1280 | Total $0.00, % of sales blank on every row | valid |
| customer-empty 1280 | "No rows for July 1 – September 30, 2025" with the action | valid |
| product-populated 375 / 390 / 1280 | Flat product list, 4 figure columns | valid |
| product-opened 375 / 390 / 1280 | Cat6 patch cable open (and Wireless access point at 1280) | valid |
| product-by-sales 390 / 1280 | Order: Largest sales | valid |
| product-filtered 390 / 1280 | Product filter set, "Product: …" header line | valid |
| product-picker 1280 | Product picker open over the report | valid |
| product-empty 1280 | Empty text with the action | valid |

0 INVALID.

## Findings per shot

- customer-populated-375 (light, dark): nothing found. Every % of sales has 2 places ("12.75%", "-0.28%", "25.12%"). No figure is cut. The label lines are the same as in the reference (St. Jude names break at the same words).
- customer-opened-375 (light, dark): nothing found. Sale lines have a blank % of sales. Label breaks are the same as in the reference.
- product-populated-375 (light, dark): nothing found. The % of sales is on line 3 with Avg price; no figure is cut. Label breaks are the same as in the reference.
- product-opened-375 (light, dark): nothing found.
- customer-populated-390 (light, dark): nothing found. Label breaks are the same as in the reference.
- customer-opened-390 (light, dark): nothing found.
- customer-by-sales-390 (light, dark): nothing found.
- customer-filtered-390 (light, dark): nothing found on the change. See NOTE 1.
- product-populated-390 (light, dark): nothing found. Label breaks are the same as in the reference.
- product-opened-390 (light, dark): nothing found.
- product-by-sales-390 (light, dark): nothing found.
- product-filtered-390 (light, dark): nothing found.
- customer-populated-1280-light: nothing found. "100.00%" on the Total is whole and in line with the header's right edge. The Sales column moved left by the width of one digit; the alignment holds.
- customer-opened-1280-light: nothing found.
- customer-by-sales-1280-light: nothing found.
- customer-filtered-1280-light: nothing found ("61.23%", "100.00%").
- customer-zero-total-1280-light: nothing found. The % of sales column is blank on every row and on the Total, as spec §3 says ("When the Total is zero the column is blank on every row").
- customer-empty-1280-light: nothing found (no percent on this shot).
- product-populated-1280-light: nothing found. "100.00%" is whole; Quantity and Avg price are blank on the Total.
- product-opened-1280-light: nothing found.
- product-by-sales-1280-light: nothing found.
- product-filtered-1280-light: nothing found.
- product-picker-1280-light: nothing found (the picker covers Quantity and Amount, as before the change).
- product-empty-1280-light: nothing found.

## Notes

1. customer-filtered-390 (light, dark): bottom of the screen — the Total row's figures ("$3,727.50", "100.00%") are behind the tab bar. This is the scroll position of the capture, and the reference before the change shows the same. No phone shot shows a whole "100.00%": the 375 and 390 full-page shots end before the Total row. The widest whole percent on a phone shot is "-0.28%" (375) and "38.77%" (390), each with much free space on its left, so a cut is not probable. — NOTE (evidence gap, not a defect seen).

## For gate 3

None.

CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE
