# Gate 2 critique — profit-and-loss checkpoint 4 (Phone and width fit, help)

Delivers judged: both reports read well on a phone (the Profit and Loss wraps each row onto the label, then Total · % of income; the by-month report wraps its figures; no sideways scroll), fit at 1024 and 1280 with figures never cut. Help is not visible in a screenshot and is not judged here.

Built shots: 26 (light and dark of 13 states) on `/a/reports/<id>`. Reference: `profit-and-loss-reference/` same names. The shipping route has no Books sidebar, so the 1024 and 1280 built shots are wider than the reference's content area (plan D5 accepts this; by-month line breaks differ from the reference for that reason and are not findings).

## State check

| shot | state shown | verdict |
|---|---|---|
| populated-390-light/dark | P&L, fiscal YTD, every section open, 3 accounts with amounts | valid |
| populated-1024-light/dark | same at 1024, one line per row | valid |
| populated-1280-light/dark | same at 1280, one line per row | valid |
| rows-active-390-light/dark | chip "Rows: Active", rows shown (the seed has no zero-net account, so the row set equals Non-zero; the reference's row set is the same) | valid |
| collapsed-390-light/dark | "Expand all", five sections folded, subtotals and computed rows shown | valid |
| no-lines-390-light/dark | Period Aug 1 – Aug 14, 2024, five sections at 0.00, computed rows at 0.00, % of income blank | valid |
| customize-390-light/dark | Customize sheet open, Columns section open with Total and % of income | valid |
| opened-390-light/dark | 6100 Rent opened, three lines labelled "date · JE-n · memo", % blank | valid |
| month-populated-390-light/dark | by-month, 11 months + Total + % of income, wrapped | valid |
| month-populated-1024-light/dark | same at 1024, two lines per row | valid |
| month-populated-1280-light/dark | same at 1280, two lines per row | valid |
| month-no-lines-390-light/dark | by-month, Aug 2024, one month column, all 0.00 | valid |
| month-capped-390-light/dark | Jan 2022 – Nov 2026, notice "first 36 columns; 23 more are left out", 36 months | valid |

0 INVALID.

## Findings

### populated-390-light / populated-390-dark
Mobile layout as spec §3: label on line 1; Total and % of income share line 2; headings ACCOUNT on line 1, TOTAL and % OF INCOME on line 2; no sideways scroll; figures whole. Matches the reference's structure. The Rows chip is cut at the right edge of the chip row; the reference shows the same (core's scrolling chip row), so not a finding. Dark legible. Nothing found.

### populated-1024-light / populated-1024-dark
One line per row, labels whole, figures whole, right edges inside the table. Nothing found beyond the shared note below (sort affordances).

### populated-1280-light / populated-1280-dark
Same as 1024. Nothing found beyond the shared note below.

### rows-active-390-light / rows-active-390-dark
Nothing found.

### collapsed-390-light / collapsed-390-dark
Nothing found.

### no-lines-390-light / no-lines-390-dark
- no-lines-390: subtotal and computed rows ("Total Income", "Gross profit", … "Net income") — the amount reads `0.00` with no currency sign, while the same rows in a populated run read `$0.00` (populated-390 "Total Cost of goods sold $0.00") and the reference no-lines shot reads `$0.00` on every subtotal and computed row. A run with no row loses the currency on its totals. Core's view over an empty run (no currency resolved from any row); the state is reached as in checkpoint 1, so it is not a checkpoint-4 delivery. — NOTE (driver: decide whether this is a core gap to report; spec §3 "A section with no line reads 0.00" does not name the sign either way).

### customize-390-light / customize-390-dark
Nothing found.

### opened-390-light / opened-390-dark
Opened lines follow the mobile layout (label line 1, amount line 2, % blank), the same as the reference. Nothing found.

### month-populated-390-light / month-populated-390-dark
Automatic lines as spec §3 and D14: label and Jan–Feb on line 1, then three figures per line in column order, Total and % of income last; headings wrap the same way; every figure whole; no sideways scroll. Label narrowed with an ellipsis ("4000 Consulting I…", "Total Cost of goods …"), the same as the reference. Nothing found.

### month-populated-1024-light / month-populated-1024-dark
Label and Jan–Jul on line 1; Aug–Nov, Total, % of income on line 2, each under its heading; figures whole; right edges inside the table.
- month-populated-1024 (and 1280, and the P&L 1024/1280): chip row — a third chip "Sort" follows Rows on the by-month report, and the P&L's ACCOUNT and TOTAL headings carry sort arrows; neither is in the reference, and spec §3 lists the chips as "Period, Rows" in this order. Both are core's sort affordances (D4: core-owned view), not Books'; they only make the two reports' toolbars read differently from each other (chip on one, heading arrows on the other). — NOTE

### month-populated-1280-light / month-populated-1280-dark
Label and Jan–Oct on line 1; Nov, Total, % of income on line 2, each under its heading; figures whole; right edges inside. Nothing found beyond the shared sort note.

### month-no-lines-390-light / month-no-lines-390-dark
- month-no-lines-390: rows "Total Cost of goods …" — the label is cut with an ellipsis although the row has free space (about 80 px) before the Aug 2024 figure; core's column fit sizes the label column before it knows the % of income cell wraps to line 2. Core's fit, cosmetic. — NOTE
- The `0.00` without currency sign is the same as no-lines-390 above (one note, not counted twice).

### month-capped-390-light / month-capped-390-dark
Notice text and placement match the reference; 36 month headings wrap, Total and % of income last; rows wrap in column order; figures whole; no sideways scroll. Nothing found.

## For gate 3
Nothing visible.

## Totals
CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
