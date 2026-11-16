# Gate 2 critique: pay-bills, checkpoint 2 (Pay Bills screen and save)

Result: 0 INVALID, 0 BLOCKING, 8 NOTE.

All 23 built shots were read with their 23 reference shots. Data differences (seeded rows, vendors, numbers, balances) are not findings.

## State check

| Shot | Verdict | What it shows |
|---|---|---|
| populated-1280-light / -dark | VALID | Paid from picked, balance line, Check, start 1050, 7 rows ticked, totals row, check plan, balance lines |
| populated-390-light / -dark | VALID | Same state as cards, stacked band, figure under the title, phone bar |
| overdue-1280-light / -390-light | VALID | Due: Overdue, 4 overdue rows, count "4 open bills" |
| refused-1280-light / -dark | VALID | Server line refusal under the Bill 1003 row cell, values kept |
| refused-390-light / -dark | VALID | Same refusal under the card input |
| card-390-light | VALID | Cards with "Pay all", all ticked |
| filtered-1280-light / -390-light | VALID | Vendor filter "Office Supply World", 2 rows (the Gates line asks for this; see note 5) |
| empty-1280-light / -dark, empty-390-light / -dark | VALID | "No open bills. Bills you post show here until they are paid." with New bill |
| loading-1280-light / -390-light | VALID | Static skeleton: band and three rows |
| error-1280-light / -390-light | VALID | "Books could not load the open bills." with Retry |
| no-access-1280-light / -390-light | VALID | "You need bookkeeper access to pay bills" |

## Findings

### populated-1280-light, populated-1280-dark
- populated-1280: totals row, Payment column — the total ("$4,018.25") ends at the right edge of the cell box, about 13 px right of the numbers in the Payment inputs above it. The reference ends the total on the same line as the input numbers. Same in overdue-1280, filtered-1280, refused-1280. — NOTE
- populated-1280: totals row, label — "Total" is under the Bill column. The reference has it under the Vendor column, at the row start. Same in all grid shots. — NOTE
- populated-1280: balance lines, Total payment — the value reads "-$4,018.25" with a hyphen. The reference reads "−$1,220.00" with a true minus sign, which has the width of the digits. Same in populated-390, card-390, refused. — NOTE
- populated-1280: grid rows — a row with no vendor bill number (Bill 1007, Bill 1008) is about 15 px shorter than a row with one, so the row rhythm is not constant. The reference fixture has a number on each row, so it made no decision. — NOTE

### populated-390-light, populated-390-dark
- Nothing found other than the minus sign (above). Structure, card order, and bar agree with the reference. Dark is legible.

### overdue-1280-light, overdue-390-light
- overdue: summary — the reference shot shows a paid row that the filter hides, with "1 selected bill is hidden by the filter". The built shot has no payment entered, so the hidden note is in no built shot and its appearance cannot be judged. — NOTE

### refused-1280-light, refused-1280-dark, refused-390-light, refused-390-dark
- refused: action bar — a tooltip "Pay ⌘↵" is drawn above the Pay button in all four shots (the pointer stayed on the button after the press). At 390 it sits on the bar edge. Capture artifact; move the pointer before the shot. — NOTE
- Not in the built shots, in the reference: the check number refusal under Starting check no., and the client text "More than the open balance of …" under a cell. Their appearance cannot be judged here. (Counted with the note above for overdue as evidence gaps; no separate count.)

### card-390-light
- Nothing found.

### filtered-1280-light, filtered-390-light
- filtered: list area — the reference shot is the filter-empty state ("No open bills match these filters." with a "Clear filters" button, summary and balance lines below). The built shot is a filter with rows, as the Gates line says. The filter-empty state is thus in no built shot and cannot be judged. — NOTE

### empty-1280-light, empty-1280-dark, empty-390-light, empty-390-dark
- Nothing found. The built shots agree with the reference; "New bill" is a Button (lesson 10).

### loading-1280-light, loading-390-light
- loading-390: header — the figure skeleton block is at the right of the title. The loaded phone layout has the figure under the title, so the header moves when the data lands. The reference skeleton is the same, so this is not a lost decision. — NOTE
- loading-1280: nothing found. (The built shot shows the real title and help icon where the reference has a skeleton block; this is not a finding.)

### error-1280-light, error-390-light
- Nothing found.

### no-access-1280-light, no-access-390-light
- Nothing found.

## For gate 3
- None seen.
