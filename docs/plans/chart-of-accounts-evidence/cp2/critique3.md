# Checkpoint 2 design critique, round 3 — populated state

Scope: what checkpoint 2 delivers (title, back link, loading state, live tree as a sortable table on wide or cards on phone, with caret, balance and roll-up label). Toolbar, filters, checkbox column, row menu, empty states, panel and import belong to later checkpoints and are not findings here.

## State check

| Screenshot | Named state | Shows | Verdict |
|---|---|---|---|
| populated-1280-light.png | populated | 9 accounts in the table, parent 6200 expanded with child 6210, header "NAME ↑" | valid |
| populated-1280-dark.png | populated | same data, dark theme | valid |
| populated-390-light.png | populated | 9 account cards, same tree, New account in the header, no FAB | valid |
| populated-390-dark.png | populated | same data, dark theme | valid |

No screenshot is INVALID.

## Measurements (populated-1280-light.png)

Text start x per column, per row (same in dark):

| Row | Name start | Type start | Detail type start | Balance end |
|---|---|---|---|---|
| 1000 (depth 1) | 413 | 610 | 832 | 1214 |
| 6100 (depth 1) | 413 | 610 | 832 | 1214 |
| 6200 (depth 1, parent, caret at 394) | 413 | 610 | 832 | 1214 |
| 6210 (depth 2) | 433 | 610 | 832 | 1214 |

Type, Detail type and Balance share one vertical line at every depth. The number column lines up across parent and non-parent rows. Indent step is 20 px (reference: 20 px on wide, 16 px on phone; build phone step is 20 px — acceptable).

## populated-1280-light.png

1. Table, Name column — "Software Subscriptions" truncates to "Software Subscripti…" at depth 1 while Detail type has about 150 px of slack after its longest value ("Dues and subscriptions" ends at x=981; the Balance column starts around x=1140). Column widths: Name ≈ 224 px (385–609), Type ≈ 223 px, Detail type ≈ 308 px. In the reference Name is the widest column (≈ 271 px, 385–656) and Detail type is the one that truncates ("Machinery and equipme…", "Accumulated depreciati…"); a 22-character depth-1 name stays whole there. The build inverts that priority: the primary identifier truncates and the secondary column holds the slack. Carried from rounds 1 and 2 as a NOTE; it is unchanged in this capture. — BLOCKING (reference decision: Name takes the free space first and Detail type truncates; checkpoint Do 4: "Name `flex-1` with a minimum, Type fixed, Detail type flexible with truncation")

Nothing else found. Back link, title, header labels, sort arrow, caret placement, number-then-name, group chip beside the type, right-aligned balance, row borders and the reserved leading/trailing cells all match the reference's decisions.

## populated-1280-dark.png

Same finding as light (1, Name truncation). Legibility is fine: body text, muted numbers, chips, header labels and balances all read clearly on the dark background.

## populated-390-light.png

Nothing found. Number then name on the first line, type · detail type below, balance right with a 16 px gutter that lines up with the New account button, caret in the leading gutter for the parent and vertically centered on the two-line card, child indented one step, New account in the header, no FAB. No name truncates at 390 px.

## populated-390-dark.png

Nothing found. Legibility in dark is fine.

## Summary

- BLOCKING: 1 — wide, both themes: the Name column truncates "Software Subscriptions" at depth 1 while Detail type holds about 150 px of slack; the reference gives Name the free space first and lets Detail type truncate. Rated NOTE in rounds 1 and 2 and left open; rated BLOCKING here because it inverts a width priority the reference decided and the capture is otherwise final for this checkpoint.
- NOTE: 0.
