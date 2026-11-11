# Gate 2 critique — profit-and-loss checkpoint 3 (Profit and Loss by Month)

Delivers judged: the by-month report on `/a/reports/<id>` at 1280: one column per month headed in words, then Total, then % of income; 36-month cap with core's notice; the five sections and four computed rows; rows do not open. Figures come from the shared e2e DB (not judged). The layout core reports at 1280 on the shipping route is recorded, not judged against the Books-shell reference's wrap (D5).

## State check

| Shot | State named | Shows | Verdict |
|---|---|---|---|
| month-populated-1280-light | populated, default period | This fiscal year to date (Jan 1 – Nov 11, 2026), 11 month columns, account rows under Income and Expenses, Total, % of income | valid |
| month-populated-1280-dark | same, dark | same | valid |
| month-no-lines-1280-light | no posted line, Aug 1–14, 2024 | one month column Aug 2024, five sections and four computed rows at 0.00, % blank | valid |
| month-no-lines-1280-dark | same, dark | same | valid |
| month-capped-1280-light | capped, Jan 1, 2022 – Nov 11, 2026 | notice "The pivot shows its first 36 columns; 23 more are left out.", 36 month columns Jan 2022 … Dec 2024, Total, % of income | valid |
| month-capped-1280-dark | same, dark | same | valid |

0 INVALID.

## Layout recorded at 1280 on the shipping route (D5, not judged)

- month-populated: core automatic lines, 2 lines per row: Account + Jan 2026 … Oct 2026 (10 figures) on line 1; Nov 2026, Total, % of income on line 2. Headings and cells align line for line.
- month-no-lines: one line (Aug 2024, Total, % of income).
- month-capped: core automatic lines, 4 lines per row: 10 / 11 / 11 / 6 figures (line 4 = Sep 2024 … Dec 2024, Total, % of income). Headings and cells align line for line.

## Findings

### month-populated-1280-light / -dark
- month-populated: chip row — a third chip "⇅ Sort" shows after Period and Rows. The reference shows Period and Rows only, and spec §3 lists "Params (chips, in this order): Period … Rows". The chip is core's (the spec keeps the two record sort keys), so it is not a Books defect, but it is also absent from month-no-lines (same report, no account rows), so core shows it only when the run has record rows. Record the fact; confirm with the driver that core's Sort chip on a shipped layout report is intended. — NOTE
- month-populated: label column — with 10 figures on line 1 the label column sits at its 12ch minimum and truncates fixed statement text: "Total Cost of goods ...", "4000 Consulting ...", "6200 Software S...". Spec §3 allows the label to narrow first ("the label narrows with an ellipsis first; figure columns keep their full width") and the fit is core's (D5), but a subtotal label of the statement cut to an ellipsis at 1280 with a rail-only shell costs legibility; the reference at the same width (narrower, with the Books sidebar) shows "Total Cost of goods sold" whole because core put fewer figures on line 1. — NOTE

### month-no-lines-1280-light / -dark
- nothing found. One month column, Total, % of income blank throughout (Total Income 0.00), five sections with "Total <section>" 0.00, four computed rows 0.00; light and dark legible; chevrons on sections, none on rows.

### month-capped-1280-light / -dark
- month-capped: chip row — same "⇅ Sort" chip as month-populated. — NOTE (same finding)
- month-capped: label column — same truncation as month-populated ("Total Cost of goods ...", "6200 Software S..."). — NOTE (same finding)
- Cap notice text matches spec §3 verbatim ("The pivot shows its first 36 columns; N more are left out."); 36 columns shown (Jan 2022 … Dec 2024), 23 left out of 59; Total and % of income cover the whole period (Total 10,700.00 against 3,000.00 inside the shown months). The 4-line rows keep heading-to-cell alignment on every line; ruled subtotal and computed rows read as in the reference.

## Checked and clean (all shots)
- Document header: business name, title, period in words; period chip and header agree.
- Column order: Account, months in order, Total, % of income (P3 order: Total after the months).
- Month headings in words, uppercase small caps as core's header style; no raw "2026-01".
- No `sec` column; no fold chevron on account rows.
- % of income: 100.0% on Total Income, 0.0% on empty section totals when income exists, blank when Total Income is 0.00.
- Dark mode: text, rules, chips and notice band legible; no raw colors out of place.
- "End of report" footer centered under the table.

## For gate 3
- none visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
