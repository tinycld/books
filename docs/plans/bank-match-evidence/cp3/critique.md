# Gate 2 critique: bank-match, checkpoint 3 (find mode and batch match)

Scope: the Delivers line only (the drawer's find mode, and Match on the selection bar).
Read: 40 built shots and their 40 reference shots, the spec, the lessons, memories-design, the capture notes.
Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

## State check

All 40 built shots show the state of their name.

| Name | 390 light | 390 dark | 1280 light | 1280 dark | What the shot shows |
|---|---|---|---|---|---|
| selected | valid | valid | valid | valid | "3 selected · Spent $500.77 · Received $1,250.00", then Match, Exclude, Clear |
| batch-busy | valid | valid | valid | valid | Spinner and "Matching…" in the Match button; Exclude, Clear and the row boxes are disabled |
| batch-done | valid | valid | valid | valid | "Matched 1 transaction. 2 need a choice: open them to match."; 2 rows stay chosen; Match is disabled; For review (8) |
| batch-failed | valid | valid | valid | valid | The server's message in the danger colour under the bar; 3 rows stay chosen; Match is enabled |
| find | valid | valid | valid | valid | Find mode, 8 rows, 2 chosen, "Chosen $1,638.37 of $138.37", "Difference $1,500.00", Match disabled |
| find-exact | valid | valid | valid | valid | Find mode, 1 chosen, "Chosen $138.37 of $138.37", Match enabled |
| find-search | valid | valid | valid | valid | Search "300"; the chosen Expense 1002 stays at the top, then the two $300.00 rows |
| find-empty | valid | valid | valid | valid | "No Books transaction on 1000 Business Checking from Jan 1 to Jan 31, 1990." |
| find-no-result | valid | valid | valid | valid | "No Books transaction matches this search." |
| find-range-error | valid | valid | valid | valid | "From must be on or before To." under the two date fields; the list keeps its row |

Capture artefacts, not findings: in find-390-*, find-exact-390-*, find-search-390-* and find-1280-* the drawer is scrolled to the totals, so the amount and the first fields are above the fold (the capture notes say so).

## Findings

### selected-390-light, selected-390-dark, selected-1280-light, selected-1280-dark
Nothing found. Match is an outline button before Exclude, as the reference and the spec ("the selection bar gains **Match** (outline …) before Exclude"). At 390 the summary wraps to two lines and the three buttons stay on one line, as in the reference.

### batch-busy-390-light, batch-busy-1280-light
Nothing found.

### batch-busy-390-dark, batch-busy-1280-dark
- batch-busy-390-dark, batch-busy-1280-dark: selection bar, the Match button — the spinner arc is almost the colour of the disabled button, so only "Matching…" shows that the batch runs. The reference dark shots have the same weak arc (core `ButtonSpinner`). — NOTE

### batch-done-390-light, batch-done-390-dark, batch-done-1280-light, batch-done-1280-dark
Nothing found. The result line is under the bar in the muted colour, wraps to two lines at 390, and the list moves down with it, as in the reference.

### batch-failed-390-light, batch-failed-390-dark, batch-failed-1280-light, batch-failed-1280-dark
Nothing found. The message is in the danger colour and is legible in light and dark.

### find-390-light, find-390-dark, find-1280-light, find-1280-dark
Nothing found. Structure as the reference: "Back to suggestions" link, From and To side by side inside the drawer's width, the search field with its full placeholder, the rows, the totals, the difference in the danger colour, Match, then the divider and Exclude. "Find other matches" is hidden.
The amount is on line 1 of each row and not centred on the two lines as in the reference: this is settled difference 1 of the plan ("line 1 is the box (writers), the type-and-number link and the amount; line 2 is 'date · name'"), not a finding.
At 1280 the list beside the drawer is cards, where the reference shows a table with Spent and Received cut off. The build is the correct one (rule: a table never scrolls sideways; cards below the table's own minimum width).

### find-exact-390-light, find-exact-390-dark, find-exact-1280-light, find-exact-1280-dark
Nothing found. No "Difference" line when the totals are equal; Match is the primary colour.

### find-search-390-light, find-search-390-dark, find-search-1280-light, find-search-1280-dark
Nothing found. The chosen row that the search hides stays at the top, as the reference.

### find-empty-390-light, find-empty-390-dark, find-empty-1280-light, find-empty-1280-dark
Nothing found. The empty text is muted, wraps to two lines, and sits between the search field and the totals, as the reference.

### find-no-result-390-light, find-no-result-390-dark, find-no-result-1280-light, find-no-result-1280-dark
Nothing found.

### find-range-error-390-light, find-range-error-390-dark, find-range-error-1280-light, find-range-error-1280-dark
- find-range-error-* (4 shots): drawer, under the date fields — while the range is invalid, the list shows the rows of the last valid range and Match stays the enabled primary button. Only the small red line shows that the dates do not apply; the From field has no error border. The reference is the same (red line only, no border). — NOTE

## Seen, not of this checkpoint

- 390 list (selected-390-*, batch-done-390-*, batch-failed-390-*): the floating New button covers the amount of the card behind it ("-$12,843." and "-$3"). The reference shows the same. This is the p4-for-review list, not this checkpoint.
- 1280 with the drawer open: the list's search placeholder is cut ("Search descriptic") and the second account card is cut at the panel's edge. The reference shows the same.

## For gate 3

Nothing seen.
