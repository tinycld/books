# Checkpoint 3 design critique

Scope: the toolbar (search, group chips, Show inactive, expand/collapse all, Import, New account) and the no-match state. The row menu, panel, delete, import and the `empty` shot (deferred to checkpoint 5) are out of scope.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| populated-1280-light/dark | Full tree, toolbar, no filter | valid |
| populated-390-light/dark | Cards, search + Filters button, Collapse all + Import, header New account | valid |
| filtered-1280-light/dark | Search "design" typed, two matching rows (parent + child), Type column visible | valid as a search filter; see finding 1 |
| filtered-390-light/dark | Search "design" typed, two cards | valid as a search filter; see finding 1 |
| no-match-1280-light/dark | Search "zzzzqq", "No accounts match" + Clear filters, no table | valid |
| no-match-390-light/dark | Same on phone | valid |

No shot is INVALID.

## Findings

1. filtered-1280-*, filtered-390-*: toolbar chips — the captured "filtered" state is a search query; no built shot shows a group chip in its active state, so the selected-chip rendering (and the Filters button's active indicator on phone) is not evidenced. — BLOCKING (gate-2 text: "reference: `filtered-*`"; the reference `filtered-*` shots show the Expenses chip active with the Type column still visible, per the spec design decision "Type column stays visible while a group filter is active" and the behavior line "The Type column stays visible while a group filter is active". Recapture with a group chip active, or add a shot, so the state the reference shows is in the evidence.)

2. populated-1280-*: toolbar — New account sits in the toolbar's second row; the reference places it in the header, right-aligned with the title, and keeps the toolbar for list actions. — NOTE (the checkpoint 3 Delivers line says the toolbar carries "the Import and New account actions", so the build follows the plan; the reference decided header placement. Surface for the human; not a build defect.)

3. populated-1280-*, filtered-1280-*: Balance column — the "BALANCE" header's right edge ends about 3-4 px left of the values' right edge; the reference aligns header and values on one right edge. — NOTE (header/value right-padding differ by a few px.)

4. no-match-1280-*, no-match-390-*: no-match block — "No accounts match" is bold foreground and sits directly under the toolbar with the Clear filters button; the reference uses a muted message vertically centered in the remaining area. The build keeps the message and its action together, which reads better than the reference's split (message centered, button pinned to the bottom), but the block hugs the top and leaves the rest of the viewport blank. — NOTE (consider centering the message + button block in the remaining area; keep them together.)

5. populated-390-*: toolbar — the phone toolbar shows a second row (Collapse all, Import) in addition to the search field and Filters button; Show inactive is not visible, presumably inside the Filters sheet, which no shot shows. — NOTE (spec: "The toolbar collapses to a search field and a filter button." The reference phone shots also show these buttons, so this is consistent with the reference; the Filters sheet contents are unverified.)

6. populated-1280-*: expand/collapse all — one toggle button ("Collapse all") instead of the reference's separate "Expand all" and "Collapse all" buttons. — NOTE (the checkpoint tests define a single toggle whose label flips with `areAllCollapsed`; the build follows the plan.)

## What is fine

- Search field, chip row, Show inactive and toolbar buttons align on one baseline at 1280 in both themes; chips are legible in dark mode.
- Type and Detail type column cells align with their headers; Type stays visible under the search filter.
- Search filter keeps the matching child's parent visible and expanded (6200 → 6210).
- No truncation at 1280 or 390 for the seeded data; phone cards keep name, subtitle and balance legible in both themes.
- Clear filters button matches the toolbar button size and style; it does not look unfinished.
