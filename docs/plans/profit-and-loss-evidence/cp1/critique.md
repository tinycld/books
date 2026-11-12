# Gate 2 critique — p5-profit-and-loss checkpoint 1 (Profit and Loss statement for readers)

Delivers: the Profit and Loss as an engine report — five sections with totals, four computed rows, amounts by normal side, % of income, Period and Rows chips, at desktop width.

Judged: `populated`, `rows-active`, `collapsed`, `no-lines`, `customize` at 1280, light and dark, against `profit-and-loss-reference/<state>-1280-<scheme>.png`. The reference's figures are synthetic; only arrangement is compared. The reference was captured inside the Books shell (Books sidebar); the built shots are on the shipping route `/a/reports/<id>` with no package sidebar (plan D5) — not a finding. Business name "Test Organization" against "Harbor Lane Design LLC" is seeded data — not a finding.

## populated-1280-light / populated-1280-dark

State check: VALID. Period "This fiscal year to date", Rows "Non-zero", every section open with a fold chevron, account rows with their chevrons, "Total <section>" rows ruled, four computed rows in statement order, Net income last, "End of report". Header carries business name, title, period in words. Chips in order Period, Rows, no other chip. Matches the reference's structure and hierarchy. Dark legible.

Findings:
- populated (both schemes): table header — "ACCOUNT ↑↓" and "↑↓ TOTAL" carry sort glyphs; the reference's headings are plain "ACCOUNT" / "TOTAL". Core's live view draws them for sortable columns; on a fixed-order statement they invite a re-sort of accounts inside sections. Core-owned (D4). — NOTE

## rows-active-1280-light / rows-active-1280-dark

State check: VALID (chip reads "Rows: Active" and the run has landed), but the shot shows no row that Active adds: the rows are identical to `populated`. The reference's `rows-active` decided to show a net-zero account ("6700 Repairs and maintenance 0.00 0.0%") under Expenses — that is the only thing the state exists to show.

Findings:
- rows-active (both schemes): Expenses section — no account at 0.00 appears, so the shot cannot show what Active changes; the e2e DB held no account whose period lines net to zero when the capture ran. The capture should post a net-zero pair on an account of its own (as e2e 5 does) before switching Rows, or run after e2e 5 on the same DB, so the evidence shows the state. — NOTE

## collapsed-1280-light / collapsed-1280-dark

State check: VALID. Every section folded (right-pointing chevrons), subtotal and computed rows still shown with their figures, toolbar reads "Expand all". Arrangement matches the reference, which also cuts at "Other expenses" at 800 px.

Findings:
- collapsed (both schemes): toolbar "Expand all" button — captured in its focus/pressed state (teal text on a tinted field) right after the click; every other toolbar button and the reference's "Expand all" are plain. Blur the button (or move focus) before the capture. — NOTE

## no-lines-1280-light / no-lines-1280-dark

State check: VALID. Period "Aug 1 – Aug 14, 2024", header "August 1 – August 14, 2024", five sections open and empty, every total and computed row 0.00, % of income blank. Matches spec §3 "A period with no posted P&L line shows the five sections at 0.00 and the four computed rows at 0.00, % of income blank."

Findings:
- no-lines (both schemes): Total column on every subtotal and computed row — reads "0.00" without the currency symbol, while the same rows in `populated` read "$7,700.00" / "$0.00" (Total Cost of goods sold shows "$0.00" there) and the reference's `no-lines` reads "$0.00". Inside the build the subtotal rows change their money format with the data. Spec §3 says "0.00" literally, so no spec text is broken; this is core's money formatting when a run holds no row that carries a currency (memory p5-report-engine: money formulas group by currency; nothing in an empty run carries one). Core-owned (D4), but worth a core note: a subtotal over a money column should keep the source's currency when the run is empty. — NOTE

## customize-1280-light / customize-1280-dark

State check: VALID. Customize panel open on the right: Number format (Divide by 1000, Without cents, Negative numbers -100 / (100), Show negative numbers in red), Columns expanded listing "Total" and "% of income" only — no section key column (spec §3 "The section key column is never listed"). Table narrows beside the panel and stays on one line at this width; the reference (pre-D1, inside the Books shell) wrapped its rows, which §3 accepts and checkpoint 4 ships. Reference had Columns collapsed; the build opens it to show the pct option, which is the better evidence.

Findings: nothing found.

## Summary

INVALID 0 · BLOCKING 0 · NOTE 4

## For gate 3

Nothing visible. (The `rows-active` shot's missing 0.00 row is a capture-data gap, not a visible behavior fault; e2e 5 proves Active.)
