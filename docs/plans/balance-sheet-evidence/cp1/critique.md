# Gate 2 critique — balance-sheet checkpoint 1 (Balance Sheet report for readers)

Scope: the Delivers line of checkpoint 1 (outline, four figure columns, Retained earnings / Net income inside Equity, Total liabilities and equity, As of and Rows chips) at 1280, light and dark. Reference shots were drawn on the scratch route with the Books sidebar and fixture data; width, business name and figures differ by design and are not findings.

## State check

| Shot | State | Verdict |
|---|---|---|
| populated-1280-light | Rows Non-zero, As of Today, full outline with seeded figures | valid |
| populated-1280-dark | same, dark | valid |
| rows-active-1280-light | chip reads "Rows: Active", but "Updating…" is shown top right and the rows are byte-for-byte the Non-zero rows of populated-1280-light | **INVALID** — captured before the Active run landed (core keeps the previous run's rows until the new run arrives, memory p5-trial-balance). It cannot be told from this shot what Rows Active shows. Re-capture after waiting for the run whose request has `rows=active` (the `chooseRows` wait). |
| rows-active-1280-dark | same | **INVALID** (same reason) |
| collapsed-1280-light | outline fully open (Assets › Current assets › Bank accounts › accounts…), toolbar still reads "Collapse all" (focused/teal), "Updating…" top right | **INVALID** — shows the expanded report, not the collapsed one. The reference collapsed state shows the three sections folded with their totals and the button reading "Expand all". |
| collapsed-1280-dark | same | **INVALID** (same reason) |
| no-lines-1280-light | As of Aug 14, 2024: three sections with totals 0.00, Retained earnings 0.00, Net income 0.00, Total Equity, Total liabilities and equity 0.00 | valid (focus ring on the As of chip is the capture, per the note) |
| no-lines-1280-dark | same | valid |
| customize-1280-light | Customize panel open, Number format and Columns (Current, Prior year, Change, % change, no rank column) | valid |
| customize-1280-dark | same | valid |

## Findings

### populated-1280-light / populated-1280-dark
- populated-1280-light: table header — every figure heading carries a sort glyph ("⇅ NOV 9, 2026", "⇅ CHANGE", "⇅ % CHANGE") and "ACCOUNT ⇅"; the reference headings are plain. A statement whose order is fixed by the outline (section › class › type › chart order) gains nothing from column sort affordances and the glyphs crowd the dated headings. Core view behavior, seen in every built shot. — NOTE
- populated-1280-dark: same as light. — NOTE (same finding)
- Otherwise clean: outline depth, chevrons, "Total " rows with heavier rules, "$" on total and computed rows only, blank % change where Prior year is 0, Retained earnings and Net income at depth 1 inside Equity, Total Assets = Total liabilities and equity in both columns, right edge inside the view.

### no-lines-1280-light / no-lines-1280-dark
- no-lines-1280-light: Total Assets, Total Liabilities, Retained earnings, Net income, Total Equity, Total liabilities and equity cells — read "0.00" with no currency sign, while the same rows in populated-1280-light read "$36,721.00", "$3,000.00", "$5,180.00" and the reference no-lines shot reads "$0.00" on every one of these rows. The money format of the total and computed rows is lost in exactly the state where there are no detail rows (the engine has no currency to group by when the coalesce(…, 0) has nothing under it), so the same row changes format between states. — BLOCKING (reference `no-lines-1280-light`: "Total Assets $0.00 $0.00 $0.00 … Retained earnings $0.00 … Total liabilities and equity $0.00"; the build's own populated totals carry "$". Likely a core engine/format matter — if Books cannot set it, report the core gap per the run rule "core gaps are built in core, never designed around".)
- no-lines-1280-dark: same as light. — BLOCKING (same finding)
- no-lines-1280-light: As of chip — the keyboard focus ring is drawn around the inner label ("As of: Aug 14, 2024") as a rectangle, leaving the calendar icon and the pill's rounded ends outside the ring. The ring itself is the capture; its shape is what a keyboard user sees on every focus. Core chip component. — NOTE
- no-lines-1280-dark: same. — NOTE (same finding)

### customize-1280-light / customize-1280-dark
- nothing found. Panel matches the reference (Number format toggles, -100 / (100) segmented, red negatives toggle, Columns, Reset to defaults); Columns lists Current, Prior year, Change, % change and no rank column (G7). The table stays on one line beside the panel where the reference wrapped to the tablet layout; that is core's fit over the real figures and is not a loss.

### rows-active-1280-*, collapsed-1280-*
- INVALID, not critiqued.

## Counts
Distinct findings (each seen in light and dark): 1 BLOCKING, 2 NOTE. 4 shots INVALID.

## For gate 3
- Collapse all: pressing it left every section open and set "Updating…" in the status corner (collapsed-1280-*). Either the fold did not apply or a fold triggers a re-run; neither should happen (fold is client state in core's view). Also check whether the capture simply did not wait.
- Rows Active: the capture ran before the new run landed ("Updating…" visible). Confirm the `chooseRows` helper waits for the run whose request has `rows=active` before the next snapshot, and confirm what the seeded book shows under Active (the reference shows a "2000 Accounts payable 0.00" row under an "Accounts payable" type that is absent under Non-zero; the e2e book may have no such account).
