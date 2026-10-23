# Checkpoint 2 design critique, round 4 — populated state

Scope: what checkpoint 2 delivers (title, back link, loading state, live tree as a sortable table on wide or cards on phone, with caret, balance and roll-up label). Toolbar, filters, checkbox column, row menu, empty states, panel and import belong to later checkpoints and are not findings here.

## State check

| Screenshot | Named state | Shows | Verdict |
|---|---|---|---|
| populated-1280-light.png | populated | 9 accounts in the table, parent 6200 expanded with child 6210, header "NAME ↑" | valid |
| populated-1280-dark.png | populated | same data, dark theme | valid |
| populated-390-light.png | populated | 9 account cards, same tree, New account in the header, no FAB | valid |
| populated-390-dark.png | populated | same data, dark theme | valid |

No screenshot is INVALID.

## Measurements (populated-1280-light.png; dark is identical)

Ink runs per row, x in px:

| Row | Name column | Type | Chip | Detail type | Balance end |
|---|---|---|---|---|---|
| 1100 (depth 1) | 413–583 | 716–844 | 862–893 | 938–1039 (truncated) | 1214 |
| 6200 (depth 1, parent) | caret 394, 413–603 | 717–769 | 787–833 | 939–1035 (truncated) | 1214 |
| header | NAME 385–431 | TYPE 716 | | DETAIL TYPE 939 | BALANCE 1156–1210 |

Column spans: Name 385–716 (331 px), Type 716–938 (222 px), Detail type 938–~1045 (≈107 px of text before the ellipsis), Balance ends 1214, trailing cell 1216–1280 reserved and empty.

Reference at the same width: Name 385–657 (272 px), Type 657–879 (222 px), Detail type 879–~1045 (≈166 px of text), Balance ends 1214. "Accounts receivable" (879–1007) and "Undeposited funds" show whole; only 21+ character values ("Machinery and equipme…", "Accumulated depreciati…") truncate.

Type, Detail type and Balance share one vertical line at every depth in the build. Indent step 20 px (6210 at 433). The round-3 finding is resolved: "Software Subscriptions" shows whole at depth 1.

## populated-1280-light.png

1. Table, Detail type column — 4 of 9 rows truncate at about 13 characters ("Accounts rece…", "Machinery and…", "Dues and sub…" twice) while the Name column holds ≈113 px it does not use (longest Name content ends at x=603, the column ends at x=716). The reference at 1280 gives Detail type ≈166 px and shows "Accounts receivable" whole; the build gives it ≈107 px, 59 px narrower, and moves those 59 px into Name's slack. Name taking free space first is correct, but a flexible Detail type must then absorb the space Name does not need; here it appears to sit on a basis about 60 px too small. — BLOCKING (reference decision: at 1280 Detail type shows 19-character values whole and truncates only from ~21 characters; checkpoint Do 4: "Detail type flexible with truncation")

Nothing else found. Back link, title, header labels, sort arrow, caret placement, number-then-name, group chip beside the type, right-aligned balance, row borders, 44 px row pitch and the reserved leading/trailing cells all match the reference's decisions.

Not verifiable from this capture: the sticky header (9 rows do not scroll).

## populated-1280-dark.png

Same finding as light (1, Detail type width). Legibility is fine: body text, muted numbers, chips, header labels and balances all read clearly on the dark background.

## populated-390-light.png

2. Cards, leading gutter — text starts at x=45 (caret 26–33) where the reference starts at x=33 (caret 16–26); indent step 20 px against the reference's 16 px. Each card gives up 12 px of a 390 px width. No name truncates in this fixture, so nothing is lost here; it matters once names approach the balance (the reference truncates "Payroll clearing (overdra…" at 390). — NOTE

Judged acceptable, not a finding: the number is muted and the name semibold on the first line (the reference sets both in one weight); that mirrors the wide table and improves hierarchy. The balance ends at x=372 with no trailing cell; the row menu that arrives in checkpoint 5 will shift it left.

## populated-390-dark.png

Same as light (2). Legibility in dark is fine.

## All shots

3. Fixture coverage — the populated capture exercises none of the states checkpoint 2 delivers beyond the expanded tree: no collapsed parent with the "incl. sub-accounts" roll-up, no negative balance, no inactive row, no depth beyond 2. The unit tests cover them; the gate-2 shots do not demonstrate them. Not a visual defect. — NOTE

## Summary

- BLOCKING: 1 — wide, both themes: Detail type gets ≈107 px of text at 1280 and truncates "Accounts receivable" while Name sits on ≈113 px of unused slack; the reference gives Detail type ≈166 px at the same width. Round-3's Name truncation is fixed; the split now overshoots the other way.
- NOTE: 2 — phone leading gutter 12 px wider than the reference; the fixture does not show the roll-up label, a negative balance, an inactive row or deep nesting.
