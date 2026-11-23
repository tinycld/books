# Design critique: dashboard, checkpoint 3 (gate 2)

Scope: Bank accounts, Expenses, Profit and loss, Sales widgets; period picker; report links; loading, error, empty states. Not judged: the Customize button and the phone header (checkpoint 4, D7), names and numbers (D8), the first-run setup card (D13).

Result: 0 INVALID, 0 BLOCKING, 6 NOTE. 40 built shots read, each against its reference.

## State check

| Shot (light and dark) | Shows its state | Remark |
|---|---|---|
| populated-900 | yes | one column |
| populated-1280 | yes | two columns |
| populated-1600 | yes | three columns |
| populated-phone-390 | yes | one column, all five widgets |
| long-1280, long-1600 | yes | every account name is long and has an ellipsis |
| long-phone-375, long-phone-390 | yes | same |
| period-menu-1280 | yes | Expenses menu open, five periods, tick on "This fiscal year" |
| period-menu-phone-390 | yes | sheet "Expenses period" open |
| empty-390 | yes | four of five widgets in the frame (see N5) |
| empty-1280 | yes | five empty widgets with their buttons |
| empty-read-only-1280 | yes | five empty widgets, no button |
| read-only-1280 | yes | populated, no "+ New", "Waiting to deposit" is plain text |
| loading-1280, loading-phone-390 | yes | five skeletons (the held balances read also feeds Invoices and Bank accounts) |
| error-1280, error-phone-390 | yes | five widgets "This widget could not load." with Retry |
| hidden-amounts-1280, hidden-amounts-phone-390 | yes | switch on, every amount masked |

No shot is INVALID.

## Findings by screenshot

### populated-900-light / -dark
- populated-900: Bank accounts, row "1000 Business Checking" — "9 to review" is about 30 px below the name (the reference has about 18 px) and the balance aligns with the name line, not with the two-line block; the row is much taller than the other rows — NOTE (N1).

### populated-1280-light / -dark
- populated-1280: Bank accounts, row with "9 to review" — same as N1 — NOTE (N1).
- populated-1280: Sales columns — the picked month (Nov 2026, negative) is a baseline mark with the same look as Jun and Jul; only the line above the columns shows which month is picked — NOTE (N4).
- Grid: Invoices and Expenses have equal heights, Bank accounts and Profit and loss have equal heights, the link rows align at the card bottoms. Nothing more found.

### populated-1600-light / -dark
- populated-1600: Bank accounts row with "9 to review" — N1 — NOTE (N1).
- populated-1600: Sales — N4 — NOTE (N4).
- Three equal cards in row 1, link rows aligned in both rows. Nothing more found.

### populated-phone-390-light / -dark
- populated-phone-390: Sales, bottom of the page — the New button (FAB) covers the last column and its label "Nov", which is the month the line above shows; the page has no space below the last card to move it clear. The reference has the same overlap — NOTE (N3).
- populated-phone-390: Bank accounts row with "9 to review" — N1 — NOTE (N1).

### long-1280, long-1600 (light / dark)
- Long names in the expense rows and the bank rows truncate with an ellipsis; amounts keep their full width; no card is wider than its column; nothing scrolls sideways.
- long-1280 / long-1600: Bank accounts row with "9 to review" — N1 — NOTE (N1).
- See N6: the reference `long` shots also show a loss, a negative bank balance, "2 more accounts", "Everything else" and 12 Sales columns. The built `long` shots do not.

### long-phone-375, long-phone-390 (light / dark)
- At 375 and 390 no label is cut to nothing ("6200 Software Subscriptions hel…", "1000 Business Checking held fo…"); amounts are whole; nothing scrolls sideways.
- Bank accounts row with "9 to review" — N1 — NOTE (N1).
- The 12-column Sales chart with one-letter labels (reference long-phone) is not shown — N6.

### period-menu-1280-light / -dark
Nothing found. Same menu, items and tick as the reference.

### period-menu-phone-390-light / -dark
Nothing found. Sheet title "Expenses period", five items, tick on "This fiscal year", as the reference.

### empty-390-light / -dark
- empty-390: the action buttons ("Create invoice", "Record expense", "Chart of Accounts") are about 44 px high with semibold text; the reference has small buttons (about 32 px). Four large filled buttons are the heaviest items on an empty page — NOTE (N2).
- empty-390: frame — the shot ends in the Profit and loss card; the Sales empty state is not in the frame, and the FAB covers the Profit and loss period picker at this scroll position — NOTE (N5, capture).
- The built empty cards keep their link rows ("View invoices", "Expenses by vendor", "Go to Banking", "Profit and Loss report"); the reference has none. The plan keeps the links row in the empty state (checkpoint text, e2e test 1), so this is not a finding.

### empty-1280-light / -dark
- empty-1280: action buttons — N2 — NOTE (N2).
- Five empty texts are correct in form ("No expenses in this fiscal year.", "Nothing posted in this fiscal year.", "No sales in last 6 months."); Profit and loss has no button; link rows align. Nothing more found.

### empty-read-only-1280-light / -dark
Nothing found. No create button in any widget, no "+ New"; the texts and link rows align.

### read-only-1280-light / -dark
- read-only-1280: Bank accounts row with "9 to review" — N1 — NOTE (N1).
- "Waiting to deposit" is plain text, as the reference. Nothing more found.

### loading-1280-light / -dark, loading-phone-390-light / -dark
Nothing found. Each card has its title, its period picker and a skeleton of its own height (same block sizes as the reference); the skeleton is visible in light and dark.

### error-1280-light / -dark, error-phone-390-light / -dark
- error-*: "Retry" buttons are about 44 px high; the reference has small buttons (about 32 px) — NOTE (N2).
- All five widgets are in error because the failed read feeds each of them; the reference state (two widgets in error beside three good ones) is not shown — part of N6.

### hidden-amounts-1280-light / -dark
- hidden-amounts-1280: Bank accounts row with "9 to review" — N1 — NOTE (N1).
- Every amount is "•••••"; the leading figures keep the large size (D4); bars and columns stay; "13 overdue invoices", "9 to review" and the account names stay; the Sales line is "Nov 2026: •••••". Nothing more found.

### hidden-amounts-phone-390-light / -dark
- hidden-amounts-phone-390: FAB over the last Sales column — N3 — NOTE (N3).
- Bank accounts row with "9 to review" — N1 — NOTE (N1).

## Notes (each counted once)

- **N1 — Bank accounts, row with "N to review".** The review link is a separate line with a large gap below the name, and the balance aligns with the name only. The reference draws a compact two-line cell (name, then the link directly below it) with the balance centred on the cell. The spec text ("shows 'N to review' under the name") is met, so NOTE. Seen in every populated, long, read-only and hidden-amounts shot.
- **N2 — Button size in widget states.** The empty-state action buttons and the error "Retry" buttons are the default size; the reference uses the small size. No rule names the size.
- **N3 — Phone, end of scroll.** The FAB covers the latest Sales column and its label. The reference has the same overlap.
- **N4 — Sales, picked month with no column.** When the picked month has zero or negative sales, its baseline mark looks the same as the other baseline marks. The spec asks for "a baseline mark only", so NOTE.
- **N5 — empty-390 capture.** The frame (1000 px) does not reach the Sales widget; empty-1280 shows it.
- **N6 — Parts that this checkpoint delivers and no built shot shows.** They could not be judged: the comparison line ("Down N% from the year before") and its masked form "••%"; the "Everything else" row with its muted fill; the "N more accounts" row; a loss in the danger tone; a negative bank balance in the danger tone; "Last 12 months" columns (one-letter labels on a phone); one widget in error beside good widgets. The reference shows each of them (`populated-*`, `long-*`, `error-*`).

## For gate 3

- read-only-1280: the report links ("A/R aging", "Expenses by vendor", "Profit and Loss report", "Sales by customer") show for the faked read-only user; the reference hides them for a reader. Check that each link shows only when the user can open the report.
- populated-*: the Sales line reads "Nov 2026: -$1,503.70" for the seeded book. Check that a negative month is the correct net credit of the Income accounts.
