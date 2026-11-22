# Gate 2 critique: reconcile, checkpoint 5 (Register table fits or cards)

Scope judged: the Delivers line only (the table does not scroll sideways, lower column minimums, cards where the list is narrower than the table's minimum width, the open entry kept in view). Not judged: the Status column, "Reconciled through", the Reconcile button (checkpoint 6).

Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

## State check

| Shot | Named state | Shows | Verdict |
|---|---|---|---|
| register-1280-light / -dark | register of 1000 Business Checking, This month, table | the table, 8 columns (Date, Ref no., Type, Memo, Account, Debit, Credit, Balance), 13 rows, sidebar open | valid |
| register-drawer-1280-light / -dark | "Register sale" open in the inline drawer, list as cards | drawer JE-6 "Register sale" at the right, cards at the left, the card of JE-6 selected and fully in view | valid |
| register-cards-900-light / -dark | cards at 900 | cards, no table, no drawer | valid |
| register-390-light / -dark | cards at 390 | phone layout, cards | valid |

## Findings

### register-1280-light, register-1280-dark

- No sideways scroller and no cut column: each heading is above its cells, Balance ends 16 px before the right edge. Rule "A table never scrolls sideways" holds in this shot.
- register-1280-light / -dark: Memo and Account columns, all rows — the Type column keeps its full 150 px (most cells, "Journal entry", "Expense", "Transfer", use about 90 px), while Memo is about 128 px and Account about 86 px. Result: 9 of 13 memos and 11 of 13 accounts end in an ellipsis ("Audit access entr…", "Owner's Eq…", "Software S…", "Accounts r…"), next to empty space in the Type column. Cause visible from the brief's cell styles: Memo and Account have `flexBasis: 0`, so Type shrinks only after the two are at their minimums. The reference at 1280 shows each memo in full. The widths are those the plan gives, and no rule is broken (no column is blank). Checkpoint 6 adds 104 px for Status, which leaves Memo and Account at or near their minimums (88 and 72) at this width. Possible correction: a lower basis for Type (about 110), or let Type give up width before Memo and Account. — NOTE

### register-drawer-1280-light, register-drawer-1280-dark

- Cards beside the drawer, no sideways scroller, the right edge of the list stops at the drawer. The selected card is clear in light (tint) and in dark (lighter surface). The header's balance block fits beside the title at this width. The long memo wraps to two lines and ends in an ellipsis inside the card height.
- Nothing found that is only in this shot. See the card NOTE below.

### register-cards-900-light, register-cards-900-dark

- Cards, no table, amounts right aligned with 16 px padding. Legible in both themes.
- register-cards-900 / register-drawer-1280 / register-390 (light and dark): each card with a one-line memo — the card has a fixed height for a two-line memo, and its text starts at the top: about 12 px above the first line, about 28 px below the last line. A card with a one-line memo thus looks top-heavy, and at 900 the list shows about 6 entries where the table shows 13. The card is the phone card of the earlier unit; this checkpoint shows it at two new widths. No rule behind it. — NOTE

### register-390-light, register-390-dark

- Cards as on the phone before this checkpoint. Nothing found other than the card NOTE above.
- Not a finding: the reference card at 390 has two lines and a signed amount, and the built card has three lines with the amount, the side and the balance. The brief says the `register` reference shot is an excerpt and not the register route (settled difference 7), and this checkpoint changes no phone code path.

## For gate 3

Nothing visible.
