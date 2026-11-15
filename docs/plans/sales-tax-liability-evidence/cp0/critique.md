# Design critique: sales-tax-liability, checkpoint 0 (gate 2, books side)

Scope: the checkpoint's Delivers line (core U1 and G2; `populated`, `rate-open`, `collapsed` re-captured on the core branch). Per plan decision D7 the arrangement is judged, not the numbers. 12 built shots read, each against the reference of the same name.

Result: 0 INVALID, 0 BLOCKING, 5 NOTE.

## State check

| shot | state shown | verdict |
|---|---|---|
| populated-390-light / -dark | agencies open, rates closed, "Collapse all" | valid |
| populated-1280-light / -dark | agencies open, rates closed, 3 agency totals and Total | valid |
| rate-open-390-light / -dark | "Colorado state" open into document rows | valid |
| rate-open-1280-light / -dark | "Colorado state" open into 3 document rows and "Total Colorado state" | valid |
| collapsed-390-light / -dark | all agencies closed, "Expand all" | valid |
| collapsed-1280-light / -dark | all agencies closed, "Expand all" | valid |

## Arrangement against the reference and spec §3 (D7)

- Order: agency, then rate, in name order; "Total <agency>" after each agency; Total last under the heavy rule. Same as the reference in all 12 shots.
- Indents: agency label, rate label one step in, document rows one more step in, "Total Colorado state" at the rate level. Same as the reference.
- Blank sales cells: on every "Total <agency>" row, on the closed agency rows (collapsed), and on Total, only Tax amount shows. Gross total, Non-taxable and Taxable amount are empty there, with no stray currency sign or zero in them. This agrees with spec §3: "On an agency's total row ("Total <agency>") and on the report's Total row, only **Tax amount** shows; the three sales columns are blank there".
- "Total Colorado state" (rate level) carries all four figures. This agrees with G2: "The column totals on that group level and the levels inside it".
- Phone lines: label on line 1, Gross total and Non-taxable on line 2, Taxable amount and Tax amount on line 3, as D3. A row with blank sales cells shows one figure line, with no empty line. No sideways scroll is visible.
- Light and dark: all text, rules and chevrons are legible in both.

## Findings

### populated-390-light, populated-390-dark
- populated-390-*: bottom tab bar — a "Sales Stub" tab shows that the reference does not have (the e2e stub package is installed on the core branch) — NOTE
- populated-390-*: column header row — "TAX NAME" starts about 4 px left of the row labels' inset (x 12 against 16); the reference has the same offset — NOTE

### populated-1280-light, populated-1280-dark
- populated-1280-*: column header row — "TAX NAME" starts about 4 px left of the row labels (x 336 against 340); same finding as at 390, counted once — NOTE (counted above)

### rate-open-390-light, rate-open-390-dark
- rate-open-390-*: document row "2026-10-06 · Invoice 1042 · Harborview Hospitali…" — the customer name is cut with an ellipsis on one line; the reference does the same — NOTE
- rate-open-390-*: document rows — the date is ISO ("2026-10-06") while the report heading writes the period in words ("October 1 – October 31, 2026"); the reference does the same — NOTE
- rate-open-390-*: bottom tab bar — "Sales Stub" tab, as above — NOTE (counted above)

### rate-open-1280-light, rate-open-1280-dark
- rate-open-1280-*: document rows — ISO dates, as at 390 — NOTE (counted above)
- Otherwise nothing found.

### collapsed-390-light, collapsed-390-dark
- collapsed-390-*: closed agency rows — "Old county agency" has its figure on the label line, while the two longer agency names have the figure on a second line, so the three rows have two different heights; the reference does the same — NOTE
- collapsed-390-*: bottom tab bar — "Sales Stub" tab, as above — NOTE (counted above)

### collapsed-1280-light, collapsed-1280-dark
- nothing found

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 5 NOTE
