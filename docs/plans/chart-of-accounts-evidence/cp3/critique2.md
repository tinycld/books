# Checkpoint 3 design critique (second pass)

Scope: the toolbar (search, group chips, Show inactive, expand/collapse all, Import, New account) and the no-match state, per the checkpoint 3 Delivers line. The row menu, panel, delete, import and the `empty` shot (deferred to checkpoint 5) are out of scope.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| populated-1280-light/dark | Full tree, toolbar, no filter | valid |
| populated-390-light/dark | Cards, search + Filters button, Collapse all + Import, header New account | valid |
| filtered-1280-light/dark | Search "design", parent + child rows, Type column visible | valid (search filter) |
| filtered-390-light/dark | Search "design", two cards | valid (search filter) |
| filtered-group-1280-light/dark | Expenses chip active (teal fill), three expense rows, Type column visible | valid |
| filtered-group-390-light/dark | Filters sheet open with Expenses chip active; the list behind shows only expense cards | valid (the sheet stays open after the chip tap; see finding 3) |
| filters-open-390-light/dark | Filters sheet open, no chip active, list dimmed behind | valid |
| no-match-1280-light/dark | Search "zzzzqq", "No accounts match" + Clear filters, no table | valid |
| no-match-390-light/dark | Same on phone | valid |

No shot is INVALID.

## Prior BLOCKING

Resolved. `filtered-group-1280-*` shows the Expenses chip in its active state (primary fill, primary-foreground text) with the Type column still visible, as the spec decided ("The Type column stays visible while a group filter is active"). The active state reads clearly in both themes.

## Findings

1. filtered-1280-*, filtered-390-*, no-match-1280-*, no-match-390-*: toolbar second row — the expand/collapse-all button is removed as soon as a search query is typed (`canToggle: query.trim() === ''` in `useAccountTree`), so Import and New account jump left by about 100 px on the first keystroke and jump back when the field is cleared. The reference keeps Expand all / Collapse all in place while a search is typed (reference `no-match-1280-*`, `no-match-390-*`) and shows an unavailable toolbar action disabled in place (Batch actions), not removed. — BLOCKING (reference decision: the toolbar keeps its controls under a search; the Delivers line names "expand and collapse all" as a toolbar control. Keep the button mounted and disable it while a search forces ancestors expanded, so the toolbar does not reflow.)

2. filters-open-390-*, filtered-group-390-*: Filters sheet — the chips are 32 px tall with 8 px gaps (`minHeight: 32`). Inside the sheet nothing constrains their height, and 32 px is under the 44 pt touch target the phone platforms recommend. — NOTE (give the sheet's chips a 44 px minimum height, or more vertical gap; the inline 1280 chips can stay at 32.)

3. filtered-group-390-*: Filters sheet — after the Expenses chip is tapped, the sheet stays open and hides the filtered list; the user must tap the X, the handle or the backdrop to see the result. The group chips are single-select, so one tap ends the choice. — NOTE (close the sheet on a group chip tap, or add a Done action; keep it open for the Show inactive toggle if both must share one rule.)

4. filters-open-390-*: Filters sheet — the five group chips (single-select) and the Show inactive toggle use the same chip style and sit 12 px apart. With "Expenses" wrapped to its own line, the sheet reads as three rows of equal chips; nothing says the last one is a toggle rather than a sixth group. — NOTE (a small label above each group, "Type" and "Show", or a Switch row for Show inactive, separates them; the reference's inline row has the same ambiguity, so this is a judgement call.)

5. filters-open-390-*: sheet backdrop — the backdrop dims the list but stops above the bottom tab bar (tab bar pixels are identical with the sheet open and closed, both themes). The tabs look tappable while a modal surface is open. — NOTE (core Sheet / shell layering, likely outside this package; surface to core.)

6. filtered-group-390-*: Filters button — the "Filters (1)" active label in `PhoneFilters` is not visible in any shot because the sheet covers the toolbar in the only phone shot with an active group. — NOTE (evidence gap, not a design defect; a shot after closing the sheet would show the active indicator the reference shows inline.)

7. populated-1280-*, filtered-group-1280-*: New account — still in the toolbar's second row at the end; the reference places it in the header, right-aligned with the title (prior NOTE 2, unchanged). — NOTE

8. populated-1280-*, filtered-1280-*, filtered-group-1280-*: Balance column — the BALANCE header's right edge sits about 4 px left of the values' right edge (prior NOTE 3, unchanged). — NOTE

9. no-match-1280-*, no-match-390-*: no-match block — bold message and Clear filters hug the toolbar and leave the rest of the viewport blank; the reference centers the message in the remaining area (prior NOTE 4, unchanged). — NOTE (center the message + button block together.)

10. populated-390-*: toolbar — second row (Collapse all, Import) in addition to the search field and Filters button (prior NOTE 5, unchanged; consistent with the reference phone shots). — NOTE

## What is fine

- Active chip state: primary fill with primary-foreground text, same in the inline row at 1280 and in the phone sheet; legible in dark mode and distinct from the inactive outline chips.
- Type column stays visible under the Expenses filter at 1280 in both themes; Type and Detail type cells align with their headers.
- Group filter keeps the parent/child structure (6200 → 6210) and the caret.
- Phone sheet: title, close X and drag handle are present; chip text is legible in both themes; the sheet does not clip at 390.
- Search filter keeps the matching child's parent visible and expanded; no truncation at 1280 or 390 for the seeded data.
- No-match state renders without the table header in both widths and themes; the Clear filters button matches the toolbar button style.
- Dark mode: search field, chips, toolbar buttons, cards and the sheet keep contrast; nothing drops below legibility.
