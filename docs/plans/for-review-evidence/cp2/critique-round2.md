# cp2 gate-2 critique, round 2 (after fix round 1)

Checkpoint 2 delivers: the toolbar (search, Dates, Type, Clear filters), the filtered empty state, the newest/oldest toggle on the Date header and the phone bar. Check boxes, selection bar and drawer are later checkpoints and are not judged here.

## State check

| shot | state shown | verdict |
|---|---|---|
| review-390-light / dark | toolbar (search; Dates + Type on one second row), phone bar "Newest first", rows newest first (Oct 27 → Oct 12) | valid |
| review-1280-light / dark | one-row toolbar, "DATE ↓" header, rows newest first | valid |
| filtered-390-light / dark | search "office depot", Type "Money out", "Clear filters" on the second row, one matching row, count still "For review (8)" | valid |
| filtered-1280-light / dark | same, one row, "Clear filters" ends the toolbar row | valid |
| filtered-empty-390-light / dark | search "zelle to marco", "No transactions match these filters." + outline "Clear filters" button, toolbar stays | valid |
| filtered-empty-1280-light / dark | same on wide | valid |
| oldest-390-light / dark | phone bar "Oldest first", rows Oct 1 → Oct 8 | valid |
| oldest-1280-light / dark | "DATE ↑" header, rows Oct 1 → Oct 6 | valid |

0 INVALID.

## Fix round 1, item 1 (phone toolbar to two rows): resolved

review/filtered/filtered-empty/oldest-390: the toolbar is two rows, search alone on the first; Dates, Type and (when set) "Clear filters" share the second row on one line. Menus are 44 high. Wide stays one row. Matches spec §3 "One row on wide, two rows on a phone (search on the first)".

## Findings

- review-390-light, review-390-dark, review-1280-light, review-1280-dark: nothing found.
- filtered-390-light, filtered-390-dark: nothing found.
- filtered-1280-light, filtered-1280-dark: nothing found.
- filtered-empty-390-light, filtered-empty-390-dark: second toolbar row — the default Type label "All transactions" truncates to "All transa…" when "Clear filters" is present (Dates and Type split the row equally; "All dates" fits, "All transactions" does not). The accepted fix allowed a truncated label, so this is not a rule break, but a default label that truncates reads unfinished; a longer preset ("Last fiscal year") would truncate both menus. A compact chip width per label (as the reference draws) or a shorter default label would avoid it. — NOTE
- filtered-empty-1280-light, filtered-empty-1280-dark: nothing found.
- oldest-390-light, oldest-390-dark: phone bar — the toggle is text only ("Oldest first" in text-primary); the reference draws a direction arrow beside it, which reads more clearly as a sort control. The plan's Do step 7 defines the bar variant as text only, so this is taste, not a break. — NOTE
- oldest-1280-light, oldest-1280-dark: nothing found.

Checked and clean: dark-mode legibility of the toolbar, the links and the empty state; the "Clear filters" link is text-primary and 44 high on both widths; the Date header arrow is small and muted as in the register; column alignment of Spent/Received unchanged from checkpoint 1; counts on the tab and the card stay at the unfiltered total under a filter (spec: "every for_review transaction of the connection, not only the filtered ones"); the empty-state action is a core outline Button, not core EmptyState's faint text action (lesson 14).

## For gate 3

Nothing visible.

## Totals

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
