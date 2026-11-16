# Gate 2 critique: customer-balance, checkpoint 0 (core group inline and muted)

Judged: the 24 shots in `docs/plans/customer-balance-reference/` (captured again on the core branch) against the same 24 names in `cp/cp0-before/` (approved at the design gate). All 48 images were read. Comparison is by eye; no pixel or contrast measurement was made.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## State check

| shot | 1280 light | 1280 dark | 390 light | 390 dark | 375 light | 375 dark |
|---|---|---|---|---|---|---|
| populated | valid | valid | valid | valid | valid | valid |
| opened | valid | valid | valid | valid | valid | valid |
| collapsed | valid | valid | valid | valid | n/a | n/a |
| with-activity | valid | valid | valid | valid | n/a | n/a |
| by-balance | valid | valid | valid | valid | n/a | n/a |

- populated: families open, customers closed, Rows: Non-zero, Order: Name.
- opened: Aspen Ridge Dental, Harborview Kitchen, St. Jude Annual Spring Gala and No customer show their transaction rows.
- collapsed: Harborview Hospitality Group and St. Jude are folded to one row with the family figure.
- with-activity: chip "Rows: With activity"; Delta Freight Partners 0.00 and the Northwind Traders own row 0.00 show.
- by-balance: chip "Order: Largest balance"; St. Jude first, Bluefin Marine Supply last.

## What the checkpoint had to show

Checked in each of the 24 shots:

- Northwind Boise (closed) (inactive): label and figure (640.00) are muted. Yes, all shots.
- Old Mill Bakery (inactive): label and figure (480.00) are muted. Yes, all shots.
- Family headers (Northwind Traders, Harborview, Marisol Alvarez, St. Jude) stay in the normal tone. Yes.
- Family totals (Total Northwind Traders $2,800.00 and the others) and the Total stay in the normal tone and weight. Yes. This agrees with spec §3: "A family total is never muted" and §4 R2: "Subtotal and total rows are never muted."
- The muted row is readable in light and in dark, at 1280, 390 and 375, also where the label wraps to two lines on the phone ("Northwind Boise (closed) / (inactive)"). Yes.
- Label and figure of a muted row have the same tone (spec §4 R2: "draws its label and figures in `text-muted-foreground`"). Yes.
- Nothing else changed: toolbar, chips, document header, column header, row order, indents, wraps, row heights, dividers, the Total rule, the phone tab bar and every other figure are the same as in `cp0-before/`. No difference found.

## Findings per shot

- populated-1280-light: nothing found.
- populated-1280-dark: see NOTE 1.
- populated-390-light: nothing found.
- populated-390-dark: see NOTE 1.
- populated-375-light: nothing found.
- populated-375-dark: see NOTE 1.
- opened-1280-light: see NOTE 3.
- opened-1280-dark: see NOTE 1, NOTE 3.
- opened-390-light: see NOTE 3.
- opened-390-dark: see NOTE 1, NOTE 3.
- opened-375-light: see NOTE 3.
- opened-375-dark: see NOTE 1, NOTE 3.
- collapsed-1280-light: nothing found.
- collapsed-1280-dark: see NOTE 1.
- collapsed-390-light: nothing found.
- collapsed-390-dark: see NOTE 1.
- with-activity-1280-light: nothing found.
- with-activity-1280-dark: see NOTE 1.
- with-activity-390-light: nothing found.
- with-activity-390-dark: see NOTE 1.
- by-balance-1280-light: nothing found.
- by-balance-1280-dark: see NOTE 1.
- by-balance-390-light: nothing found.
- by-balance-390-dark: see NOTE 1.

All 24 shots: see NOTE 2 (a limit of the fixture, not a defect of a shot).

### NOTE 1 — dark shots: the muted rows are the dimmest text in the table

`*-dark`: rows "Northwind Boise (closed) (inactive)" and "Old Mill Bakery (inactive)" — the label, the figure and the row's chevron are clearly dimmer than in light mode in relation to their background. They are readable, and the tone looks the same as the app's other muted text on the screen ("As of November 16, 2026", "End of report"), so the token is used as the spec says. But this is semibold 15 px body text that carries a money figure, and by eye its contrast in dark is near the limit for body text. Recommended: measure the contrast of `text-muted-foreground` on the dark table background one time (4.5:1 for this size). If it is below, the fix is in the token, not in `ReportRow`. — NOTE (no measured value; the spec names this token).

### NOTE 2 — all shots: no shot proves "red and error figures keep their tone"

The fixture has no red figure. The credit balances (Bluefin Marine Supply -320.00, Northwind Seattle warehouse -150.00, the payments -1,000.00 and -3,000.00) draw in the normal foreground tone before and after, so they did not lose a tone. But neither muted row has a negative or red figure, so the rule of spec §4 R2 ("red and error figures keep their tone") on a muted row is not visible in any shot. It stays proven only by the `figureTone` unit test. Not a defect of the build. — NOTE.

### NOTE 3 — opened shots: no muted customer is opened

`opened-*`: the four opened rows are all active customers. The shots do not show how the transaction rows under a muted customer read (normal tone, per R2: only the group row is muted). Gate 2 of checkpoint 1 looks at the built row; open the Old Mill Bakery row there. — NOTE.

## Seen, not findings of this checkpoint (same in `cp0-before/`)

- `*-375-*`: the screen title truncates to "Customer Balan…".
- `opened-390-*`: the last visible transaction row is cut by the tab bar (the capture height ends there; the list scrolls).

## For gate 3

Nothing visible.
