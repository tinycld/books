# Checkpoint 2 design critique, round 2 — populated state

Scope: what checkpoint 2 delivers (title, back link, loading state, live tree as a sortable table on wide or cards on phone, with caret, balance and roll-up label). Toolbar, filters, checkbox column, row menu, empty states, panel and import belong to later checkpoints and are not findings here.

Round 1 findings re-checked by pixel measurement on the new captures.

## State check

| Screenshot | Named state | Shows | Verdict |
|---|---|---|---|
| populated-1280-light.png | populated | 9 accounts in the table, parent 6200 expanded with child 6210, "NAME ↑" header | valid |
| populated-1280-dark.png | populated | same data, dark theme | valid |
| populated-390-light.png | populated | 9 account cards, same tree, New account button in the header, no FAB | valid |
| populated-390-dark.png | populated | same data, dark theme | valid |

No screenshot is INVALID.

## Round 1 findings — status

| # | Finding | Status |
|---|---|---|
| 1 | Indented row shifted Type / Detail type / Balance right | FIXED — Type text starts at x=610, Detail type at x=832 and Balance ends at x=1214 on rows 1000, 6100, 6200 and 6210 alike |
| 2 | No sort direction indicator | FIXED — header reads "NAME ↑", same as the reference |
| 3 | Name column truncates while Detail type has slack | OPEN — see below |
| 4 | Filled header band | FIXED — header background is the page background (255,255,255 light / 15,22,41 dark), text on a thin bottom border, same as the reference |
| 5 | 8 px right gutter on phone cards | FIXED — balance text ends at x=372, the New account button ends at x=373; list and header share the 16 px gutter |

## populated-1280-light.png

1. Table, Name column — "Software Subscriptions" still truncates to "Software Subscripti…" at 1280 px. The Name column runs from x=385 to x=609 (about 224 px) against about 271 px in the reference (385 to 656), while the Detail type column has roughly 150 px of slack after its longest value ("Machinery and equipment"). Name and Detail type still share the free space evenly; Name should take it first. — NOTE

Nothing else found. Hierarchy (title, back link, header, rows), indent step, caret placement, group chip, right-aligned balance and the row grid all match the reference's decisions.

## populated-1280-dark.png

Same NOTE as light (Name truncation). Legibility is fine: body text, muted numbers, chips, header labels and balances all read clearly on the dark background.

## populated-390-light.png

Nothing found. Number then name on the first line, type · detail type below, balance right with a 16 px gutter, caret in the leading gutter for the parent, child indented by one step, New account in the header, no FAB.

## populated-390-dark.png

Nothing found. Legibility in dark is fine.

## Summary

- BLOCKING: 0.
- NOTE: 1 — Name column truncates "Software Subscriptions" at 1280 px while Detail type has slack (wide, both themes). Carried from round 1.
