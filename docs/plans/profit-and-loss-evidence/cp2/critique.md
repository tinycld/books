# Gate 2 critique — profit-and-loss checkpoint 2 (Opened account lines, live re-runs)

Delivers: pressing a Profit and Loss account row opens its posted lines in the period beneath it, labelled and in date order, with Total per line and % of income blank, and the open report re-runs live on a post from another page.

Reference: `docs/plans/profit-and-loss-reference/opened-1280-{light,dark}.png` (synthetic figures, 6200 Insurance opened, Books shell with sidebar).
Built: `docs/plans/profit-and-loss-evidence/cp2/opened-1280-{light,dark}.png` (shipping route `/a/reports/<id>`, no package sidebar per plan D5; 6100 Rent opened, three posted lines from the seeded e2e DB).

## State check

- opened-1280-light.png: VALID. Shows the opened state: 6100 Rent carries a down chevron and three detail lines beneath it (`2026-01-05 · JE-2 · January rent`, `2026-11-11 · JE-7 · Register split payment`, `2026-11-11 · JE-15 · Entries seed auto reverse`); the other account rows are closed (right chevron).
- opened-1280-dark.png: VALID. Same state in dark mode.

## Comparison with the reference (what the reference decided, kept or lost)

Kept:
- Opened lines sit directly beneath the account row, indented one step past the account label, at the same row height as account rows (reference 6200 Insurance: same placement).
- Label text "<date> · <entry number> · <memo>" with middle dots, regular weight (not bold), date in ISO form as in the reference.
- Date order, then entry sequence: 2026-01-05 before 2026-11-11; JE-7 before JE-15 on the same day.
- Total per line right-aligned under the Total column in regular weight; the account row's Total stays bold.
- % of income blank on every opened line; present on the account row (29.9%).
- Computed rows (Gross profit, Net operating income, Net other income, Net income) have no chevron.
- Ruled subtotal and computed rows, section chevrons, chips, toolbar, document header: unchanged from checkpoint 1 and matching the reference.
- Dark mode: detail labels and amounts legible on the dark surface; contrast between bold account rows and regular detail rows holds.

Differences that are not findings:
- No Books sidebar: the shipping route has none (plan D5).
- Real figures and the period "January 1 – November 11, 2026" (today's date).
- Only one Income account and no Cost of goods sold / Other income / Other expenses accounts: the seeded DB, not the layout.

## Findings

### opened-1280-light.png
- opened-1280-light: table header, "ACCOUNT ↑↓" and "↑↓ TOTAL" — sort affordances show on both headings, which the reference did not draw (its static model had no sortable columns); the Total affordance sits left of its label while Account's sits right. Core's report view draws these for the spec's sortable columns; cosmetic only. — NOTE

### opened-1280-dark.png
- Same NOTE as the light shot (sort affordances); otherwise nothing found.

## For gate 3

Nothing visible. The live re-run (the second half of the Delivers line) cannot be judged from a still shot; it is e2e 7's ground.

## Verdict

CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE
