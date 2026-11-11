# Gate 2 re-critique — balance-sheet checkpoint 1 (Balance Sheet report for readers)

Scope: only the four re-captured shots `rows-active-1280-light/dark` and `collapsed-1280-light/dark`, against the reference shots of the same names. The other six shots keep the verdicts of `critique.md` and are not re-judged here. Reference shots were drawn on the scratch route with the Books sidebar and fixture data; the missing Books sidebar on the real `/a/reports/<id>` route, the business name, the figures and the account set differ by design and are not findings.

## State check

| Shot | State | Verdict |
|---|---|---|
| rows-active-1280-light | Chip reads "Rows: Active"; no "Updating…" in the status corner; full outline open with the seeded accounts (1000, 1010, 1100, 1500, 2100, 3000), Retained earnings and Net income inside Equity, Total liabilities and equity last | valid. The row set holds no 0.00 account, so it cannot be told apart from Non-zero by eye; the brief allows this (the seeded book may have no account that only Active shows) and the chip and the cleared "Updating…" mark the Active run. |
| rows-active-1280-dark | same, dark | valid |
| collapsed-1280-light | Chip "Rows: Non-zero"; toolbar reads "Expand all"; the three sections folded (chevron right) each followed by its total row; Total liabilities and equity last; no "Updating…" | valid |
| collapsed-1280-dark | same, dark | valid |

## Findings

### rows-active-1280-light / rows-active-1280-dark
- rows-active-1280-light: table header — every heading carries a sort glyph ("ACCOUNT ⇅", "⇅ NOV 9, 2026", "⇅ CHANGE", "⇅ % CHANGE"); the reference headings are plain. Same core-view finding as critique.md on populated-1280-*; recorded here because it is also in these shots, not a new finding. — NOTE
- rows-active-1280-dark: same. — NOTE (same finding)
- Otherwise clean against the Delivers line: section › class › type › account depth steps (Assets 0, Current assets 1, Bank accounts 2, accounts 3; Fixed assets 1 with its account directly at 2, G1; Equity accounts at 1, G1); every class and type ends in a "Total …" row with the heavier rule; "$" on total and computed rows only, plain figures on account rows (as the reference); % change blank where Prior year is 0.00 (1000, 1010, 1500, 2100, 3000, Net income) and shown where it is not (1100 200.0%, Retained earnings 0.0%); Retained earnings then Net income at depth 1 before Total Equity (G4); Total Assets $36,721.00 / $3,000.00 equals Total liabilities and equity in both columns; Change = Current − Prior year on every row checked; headings "NOV 9, 2026" / "NOV 9, 2025" (G3); every heading and figure ends inside the view at 1280; dark legible, row rules visible.

### collapsed-1280-light / collapsed-1280-dark
- collapsed-1280-light: table header — the same sort-glyph NOTE as above. — NOTE (same finding)
- collapsed-1280-dark: same. — NOTE (same finding)
- Otherwise clean and matches the reference's collapsed structure: section row with chevron and no figures, its total row beneath with "$" figures, Total Liabilities % change blank (Prior year $0.00), Total liabilities and equity last, "End of report" centred under the table; row rhythm equals the reference (about 45 px per row). The teal tint on "Expand all" (light) / teal label (dark) is the pressed button's focus state at capture, not a finding.

## Counts
Distinct findings in these four shots: 0 BLOCKING, 1 NOTE (the sort-glyph note, already in critique.md). 0 INVALID. The no-lines BLOCKING and the focus-ring NOTE of critique.md stand as written there and are outside this re-critique.

## For gate 3
- Rows Active: the seeded book shows the same accounts under Active as under Non-zero (no account netting to zero on both days), so these shots prove the chip and the re-run, not the Active filter. E2E 6 (account O at 0.00 under an "Other assets" row) is the behavioral proof; confirm it is green.
- Collapse all → Expand all: the fold now applies with no "Updating…", so the earlier gate-3 note about a fold triggering a re-run looks like a capture-timing issue only; confirm in the spec that Collapse all does not issue a new run request.
