# Design critique: dashboard, checkpoint 3 (gate 2, after fix round 1)

Scope: the five shot sets the driver named, light and dark (10 built shots). Not judged: the Customize button and the phone header (checkpoint 4, D7), names and numbers (D8), the first-run setup card (D13). The notes N1 to N6 of `critique.md` are not repeated.

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

Limit: the shots from before the fix are not available (the capture wrote over them). "Looks as before" is judged against the reference and against the layout the first critique accepted, not against a pixel copy of the earlier build.

## State check

| Shot (light and dark) | Shows its state | Remark |
|---|---|---|
| populated-1280 | yes | two columns, five widgets with data |
| populated-phone-390 | yes | one column, five widgets with data |
| long-phone-375 | yes | long account names, each with an ellipsis |
| error-bank-1280 | yes | Bank accounts shows "This widget could not load." and Retry; Invoices, Expenses, Profit and loss and Sales are loaded |
| sales-12-phone-375 | yes | Sales trigger reads "Last 12 months"; 12 columns with the labels D J F M A M J J A S O N |

No shot is INVALID.

## Findings by screenshot

### populated-1280-light / -dark
- populated-1280: Expenses, the three account rows — each bar has the same thickness as the Invoices bar and the Profit and loss bars (about 12 px), and the rows are about 48 px apart. The reference draws the Expenses bars thinner (about 8 px, rows about 44 px apart), so its ranked rows are lighter than the two Profit and loss bars. Spec §7 names one bar height ("`h-3 rounded-full`"), so the build agrees with the spec — NOTE (F1). The first critique did not record this difference. If the Expenses bars were thinner before the fix, the merge into the shared part changed the look; compare the diff of the bar height.
- Profit and loss, the two bars: label and amount on one line, the bar about 20 px below, 48 px between the rows, `Income` in the success tone at full width, `Expenses` in the info tone in proportion, on the same track tone. Same as the reference in light and dark.
- Expenses rows: name left, amount right, primary fill, track visible in light and dark, the first row at full width. Same structure as the reference.
- Sales columns: no change in look from the button role. Nothing more found.

### populated-phone-390-light / -dark
- populated-phone-390: Expenses rows — F1 — NOTE (F1).
- Profit and loss bars: same as the reference. Nothing more found.

### long-phone-375-light / -dark
- long-phone-375: Expenses rows — F1 — NOTE (F1).
- Long names in the Expenses rows keep the ellipsis and the amounts are whole ("6200 Software Subscriptions hel…  $5,428.73"); the bars keep the full card width; nothing scrolls sideways. Profit and loss bars: same as the reference. Nothing more found.

### error-bank-1280-light / -dark
Nothing found. The Bank accounts card keeps its title, the text "This widget could not load." and the Retry button at the top left, as the two error cards of the reference. The card has the height of the Profit and loss card in its row. The other four widgets show their figures, bars and links. The error text and the button border are legible in dark.

### sales-12-phone-375-light / -dark
Nothing found. The 12 columns fit the card with equal widths and gaps; each one-letter label is centred under its column; no label is cut; the card is not wider than its column; nothing scrolls sideways. The picked line, the total and the "Sales by customer" link are in the same places as the reference. The New button does not cover a column in this frame.

## Notes (each counted once)

- **F1 — Expenses rows, bar thickness.** The built Expenses bars are as thick as the Profit and loss bars. The reference draws them thinner. No rule names the thinner height (spec §7 names `h-3`). Seen in populated-1280, populated-phone-390, long-phone-375 and sales-12-phone-375.

## For gate 3

None.
