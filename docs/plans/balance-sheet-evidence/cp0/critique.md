# Gate 2 critique — balance-sheet checkpoint 0 (reference re-captured on merged core)

Scope: checkpoint 0 Delivers (G1, G3, G4, G5, G7, G8, G9 as drawn by the scratch route on merged core). Compared against `docs/plans/balance-sheet-reference/` (phase 3, stand-ins) and spec §3 / §4 / §5.

## Do step 5 checks (core-defect list)

| Check | Result | Where seen |
|---|---|---|
| % change cell on a phone | None. populated-390 (light, dark), opened-390, rows-active-390, collapsed-390, no-lines-390 draw label on line 1, then Current · Prior year · Change on line 2; header is ACCOUNT, then NOV 8, 2026 · NOV 8, 2025 · CHANGE. | all `*-390-*` |
| `(none)` group | None. Fixed assets, Other assets and Long-term liabilities hold their accounts directly (G1); Equity holds Retained earnings and Net income directly. | populated-*, no-lines-* |
| Rank column | None in the table or in Customize (Columns: Current, Prior year, Change, % change). | populated-*, customize-390 |
| Computed row outside Equity | None. Retained earnings and Net income sit at depth 1 inside Equity, before Total Equity, and are hidden while Equity is folded. | no-lines-*, collapsed-* |
| Dated column headings | Shown: NOV 8, 2026 and NOV 8, 2025 (header style uppercases every heading, as ACCOUNT and CHANGE). | every populated state |
| Hidden empty group (G5) | Non-zero hides the Accounts payable kind (2000 AP nets to 0); Active shows it with 0.00 and a blank % change. | populated-1280 vs rows-active-1280 |
| Opened lines (N5) | Current and Prior year shown; Change and % change blank. | opened-390, opened-1280 |

Coverage caveat (not a finding; the reference was cut at the same point): every populated, opened and rows-active shot ends at "Long-term liabilities", so the Equity section with non-zero figures (equity accounts directly under the section, Retained earnings and Net income with real figures, Total Equity adding them) is not in any captured shot. The placement of the two computed rows is pinned only by no-lines-* (all 0.00) and their hiding by collapsed-*. Gate 3's Go/e2e tests pin the figures.

Ledger note (gate 3 reviewer A): at 390 the figure line's indent is the same on every row (columns align across depths); whether it is 20 px or ~52 px cannot be read from the shots, and per the ledger note that alone is not a defect.

## State check

| Shot | State shown | Valid |
|---|---|---|
| populated-390-light / -dark | Populated, mobile layout (3 figure columns) | yes |
| populated-1024-light / -dark | Populated, one line, 5 columns, label ellipsis | yes |
| populated-1280-light / -dark | Populated, one line, 5 columns | yes |
| opened-390-light / -dark | 1010 opened, six lines, Change blank | yes |
| opened-1280-light / -dark | 1010 opened, six lines | yes |
| rows-active-390-light / -dark | Rows: Active chip | yes |
| rows-active-1280-light / -dark | Rows: Active, Accounts payable kind at 0.00 | yes |
| collapsed-390-light / -dark | Three sections folded, Expand all, End of report | yes |
| collapsed-1280-light / -dark | Same | yes |
| no-lines-390-light / -dark | Sections open at $0.00, RE and NI at 0.00 | yes |
| no-lines-1280-light / -dark | Same, Total liabilities and equity $0.00 | yes |
| customize-390-light / -dark | Customize sheet, Columns open | yes |
| customize-1280-light / -dark | Customize side panel, Columns folded | yes |
| loading-390 / -1280 (light, dark) | Spinner under "Balance Sheet" | yes |
| error-390 / -1280 (light, dark) | "Could not load this report" + Retry | yes |
| timeout-390 / -1280 (light, dark) | "This report took too long to run" + Retry | yes |
| no-access-390 / -1280 (light, dark) | "You no longer have access to this report" | yes |

0 INVALID.

## Findings

- populated-390-light, populated-390-dark: nothing found. Structure, hierarchy (section › class › kind › account with "Total …" rows ruled), dated headings, right-aligned figures ending inside the view, legible in both schemes.
- populated-1024-light, populated-1024-dark: nothing found. Label narrows with an ellipsis first; figure columns keep max-content, as spec §3 "Every width fits" states. Same as reference.
- populated-1280-light, populated-1280-dark: nothing found.
- opened-390-light, opened-390-dark: nothing found. Detail labels "<date> · <number> · <memo>" truncate with an ellipsis; figure line holds Current and Prior year, Change blank (N5).
- opened-1280-light, opened-1280-dark: nothing found.
- rows-active-390-light, rows-active-390-dark: nothing found.
- rows-active-1280-light, rows-active-1280-dark: nothing found. 2000 Accounts payable 0.00 / 0.00 / 0.00 with blank % change (Prior year zero), kind kept under Active.
- collapsed-390-light, collapsed-390-dark: nothing found. Mobile layout holds in the folded state; computed rows hidden with Equity.
- collapsed-1280-light, collapsed-1280-dark: nothing found.
- no-lines-390-light, no-lines-390-dark: nothing found. Retained earnings and Net income at depth 1 inside Equity, before Total Equity (G4), no `(none)` group.
- no-lines-1280-light, no-lines-1280-dark: nothing found. % change blank on every row (Prior year zero), per spec §3 column 5.
- customize-390-light, customize-390-dark: nothing found. Columns list the plain labels (Current, Prior year, Change, % change), no hidden key column (G3 "label stays the column's name in Customize", G7).
- customize-1280-light, customize-1280-dark: table beside the open panel — the table is about 573 px wide, below the tablet layout's 600 px `minWidth`, so core draws the mobile layout and % change leaves the table exactly while the reader is in the panel that toggles it; the "% change" switch in Columns then has no visible effect at this width. The reference shows the same arrangement and the spec's `display.layouts` decides it (tablet `minWidth` 600px), so this is a Books display decision to revisit, not a core defect — NOTE
- loading-390, loading-1280 (light, dark): nothing found. Same as reference (title only, spinner centred).
- error-390, error-1280 (light, dark): nothing found.
- timeout-390, timeout-1280 (light, dark): nothing found.
- no-access-390, no-access-1280 (light, dark): nothing found.

## For gate 3

Nothing visible. (Suggestion only: an e2e or Go pin that the Equity section with non-zero figures shows equity accounts directly under the section and RE/NI before Total Equity, since no captured shot reaches it.)

## Totals

CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE
