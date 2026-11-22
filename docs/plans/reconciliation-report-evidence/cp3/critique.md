# Gate 2 critique: reconciliation-report, checkpoint 3 (Reconcile history tab)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE`

Scope: the Delivers line of checkpoint 3. Each built shot was read in light and dark (38 files) and compared with the reference file of the same name. Not judged, as the brief and the prompt say: the More menu and the Undo item of the table's latest rows (checkpoint 4; the 44 px spacer holds the place), the red Undo item, the seed rows in place of the fixture rows, account 1000 in `history-empty-filtered-*`, the sidebar entry (the reference is the scratch route, so Reconcile is not selected there; the build selects it, as spec §2 wants).

## State check

| Shot | Widths | State shown | Result |
|---|---|---|---|
| history | 1280 | table, 3 seed rows, History tab selected, "All accounts" | valid |
| history | 1024 | cards (below the 890 minimum of the content area) | valid |
| history | 390, 375 | cards | valid |
| history-filtered | 1280, 390 | 2100 Company Card picked, "Clear filter" link, 2 rows | valid |
| history-filter-menu | 1280, 390 | account menu open, "All accounts" ticked, 2 accounts | valid |
| history-reader | 1280 | table for a reader (no New button in the sidebar), links only | valid |
| history-reader-card-menu | 390 | sheet "Reconciliation" with the one item "View report" | valid (see note 2 for the dark file) |
| history-empty | 1280, 390 | empty text and "Go to Accounts" | valid |
| history-empty-filtered | 1280, 390 | "1000 Business Checking has no finished reconciliation." and "Clear filter" | valid |
| history-loading | 1280 | spinner under the tab row and toolbar | valid |
| history-error | 1280, 390 | "Books could not load the reconciliations." and Retry | valid |
| accounts | 1280, 390 | accounts list with the tab row, Accounts selected | valid |
| finished-reader | 1280 | finished summary for a reader: View report, the two outline buttons, the history link, no More menu | valid |

## Findings

- history-1280 (light, dark): nothing found but note 1.
- history-1024 (light, dark): nothing found. Cards are 76 high; the count is on line two on the right; line three is "Reconciled <day> by <name>" (settled difference 3).
- history-390, history-375 (light, dark): nothing found.
- history-filtered-1280, history-filtered-390 (light, dark): nothing found.
- history-filter-menu-1280 (light, dark): note 1 applies (same row). The open menu covers part of the header and the first row, as in the reference.
- history-filter-menu-390 (light, dark): nothing found.
- history-reader-1280 (light, dark): note 1 applies (same row).
- history-reader-card-menu-390-light: nothing found.
- history-reader-card-menu-390-dark: note 2.
- history-empty-1280, history-empty-390 (light, dark): nothing found.
- history-empty-filtered-1280, history-empty-filtered-390 (light, dark): nothing found. At 390 the text wraps to two centred lines; it is clean.
- history-loading-1280 (light, dark): nothing found.
- history-error-1280, history-error-390 (light, dark): nothing found.
- accounts-1280, accounts-390 (light, dark): nothing found.
- finished-reader-1280 (light, dark): nothing found.

### Notes

1. `history-1280-*`, `history-reader-1280-*`, `history-filter-menu-1280-*`: table, column Cleared, row "Aug 31, 2026 · 1010 Business Savings" — the cell reads "262 transacti…". The 112 px fixed column (settled difference 2) holds a count of one or two digits; a count of three digits cuts the word. The number stays readable, and the reference has no count above 6, so it decided nothing for this case. — NOTE. Possible repair, if wanted: move about 12 px from Reconciled (flex 1, minimum 178) to Cleared, inside the 890 minimum.
2. `history-reader-card-menu-390-dark`: top of the screen — a core "Reconnecting…" pill covers part of the title "Reconcile". The light file of the same shot does not have it. The cause is probably the capture (the faked `books_access` read with realtime cut), not the build. — NOTE. A new capture of this one file is advised; the state it shows (sheet with "View report" only) is correct.

## For gate 3

Nothing visible.
