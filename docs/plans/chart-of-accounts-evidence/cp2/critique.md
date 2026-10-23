# Checkpoint 2 design critique — populated state

Scope: what checkpoint 2 delivers (title, back link, loading state, live tree as a sortable table on wide or cards on phone, with caret, balance and roll-up label). Toolbar, filters, checkbox column, row menu, empty states, panel and import belong to later checkpoints and are not findings here.

## State check

| Screenshot | Named state | Shows | Verdict |
|---|---|---|---|
| populated-1280-light.png | populated | 9 accounts in the table, one expanded parent (6200) with a child (6210) | valid |
| populated-1280-dark.png | populated | same data, dark theme | valid |
| populated-390-light.png | populated | 9 account cards, same tree, New account button in the header | valid |
| populated-390-dark.png | populated | same data, dark theme | valid |

No screenshot is INVALID.

## populated-1280-light.png

1. Table, child row 6210 — the Type, Detail type and Balance columns of the indented row shift right by one indent step (Type text starts at x=619 where every other row starts at x=609; Detail type at x=841 vs x=831). The indent leaks out of the Name cell into the other columns, so the columns do not line up across depths. Cause in `AccountRow.tsx`: the Name cell is `flex-1` and gets `paddingLeft: (depth - 1) * INDENT_STEP`; with a zero flex basis the padding is added on top of the cell's share of the free space, so each level widens the Name cell and pushes the rest. — BLOCKING (spec: "Columns on wide screens: Name (number, then name, indented by level), Type, Detail type, Balance (right aligned)" — only the Name content is indented; the reference keeps Type, Detail type and Balance in one vertical line for every depth, e.g. "Fixed asset" at the same x for 1500, 1510, 1511, 1511.1 and 1511.1A)

2. Table header — no column shows the active sort. The reference shows "NAME ↑" on first load; the build shows "NAME" with no direction indicator, so a user cannot see which column is sorted or which way, and a first press on a header gives no visible before/after. — BLOCKING (reference decision: the sorted column carries a direction arrow, "NAME ↑"; spec: "A column header (Name, Type, Balance) re-sorts siblings ... A second press reverses the order" — the reversal is invisible without an indicator)

3. Table, Name column — "Software Subscriptions" (22 characters) truncates to "Software Subscripti…" at 1280 px while the Detail type column has about 100 px of slack after its longest value ("Machinery and equipment"). The Name column measures about 216 px against about 272 px in the reference; Name and Detail type are both `flex-1`, so the free space is split evenly instead of going to Name first. — NOTE

4. Table header — a filled grey band (`bg-muted/40`) spans the full content width edge to edge. The reference header is text on a thin bottom border with no fill; the band is the heaviest element on the screen and competes with the title. In light mode the muted header text on the grey band is also lower contrast than the same text on the page background. — NOTE

## populated-1280-dark.png

Same findings as light (1 BLOCKING column drift on row 6210, 2 BLOCKING missing sort indicator, 3 NOTE Name truncation, 4 NOTE filled header band). Legibility in dark is fine: body text, muted numbers, chips and balances all read clearly.

## populated-390-light.png

1. Cards, right edge — balances end 8 px from the screen edge (`px-2` on the card) while the header's New account button and the title keep a 16 px gutter. The right edge of the list does not line up with the header. The trailing menu cell that checkpoint 5 adds will change this edge again, so it is worth settling the gutter now. — NOTE

Everything else matches the reference's decisions: number then name on the first line, type · detail type below, balance right, caret in the leading gutter for parents, child indented by one step, New account in the header and no FAB.

## populated-390-dark.png

Same NOTE as light (8 px right gutter). Legibility in dark is fine.

## Summary

- BLOCKING: 2 (wide, both themes) — indented rows shift the Type/Detail type/Balance columns; no sort direction indicator on the header.
- NOTE: 3 — Name column truncates while Detail type has slack (wide); filled header band (wide); 8 px right gutter on cards (phone).
