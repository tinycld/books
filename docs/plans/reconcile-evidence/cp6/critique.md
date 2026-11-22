# Gate 2 critique — reconcile, checkpoint 6 (Register status, entry points, help)

Scope: the register's Reconcile button, "Reconciled through", the Status words (table, card, entry drawer), and the Banking More menu item. The table-or-cards layout and the card height are checkpoint 5 and are not judged here.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## State check

| Shot | Named state | Shows it |
|---|---|---|
| register-390-light / -dark | register of 1010 Business Savings, This fiscal year, phone | Yes: cards, "Reconciled through Aug 31, 2026", Reconcile button, "Cleared" once, "Reconciled" twice |
| register-1280-light / -dark | same register, table | Yes: table with the Status column between Account and Debit, the same words |
| register-drawer-1280-light / -dark | entry open in the inline drawer, header beside the drawer, cards | Yes: drawer JE-26 open, cards in the list, header wrapped beside the drawer |
| banking-menu-1280-light / -dark | Banking More menu open with Reconcile | Yes: Edit bank details, View register, Reconcile, Disconnect |

No shot is INVALID.

## Compared with the reference (register-390, register-1280)

- "Reconciled through <day>" is under the balance block, small and muted: kept.
- Reconcile is an outline button after Transfer in the wrapping row: kept.
- Status words and tones: "Reconciled" green, "Cleared" in the foreground color: kept in light and dark. The phone card shows the word after the Ref no, as the spec says.
- The reference card layout and its missing Account column are parts of the excerpt (settled difference 7), not losses.

## Findings

### register-390-light / register-390-dark
Nothing found for this checkpoint's parts.

### register-1280-light / register-1280-dark
- register-1280: Memo and Account columns — with the Status column added, Memo shows about 11 characters and Account about 8 ("Reconcile s…", "Owner's …"). The four seeded rows have the same visible memo text, so the column does not tell the rows apart at 1280 with the sidebar open. The widths are the plan's (settled difference 5; Memo minimum 88), and no cell is blank. — NOTE
- register-1280: balance block, "Reconciled through Aug 31, 2026" — the line is left-aligned to the block's left edge (x about 1020) and ends at about 1208, while "through Nov 22, 2026" above it ends at the right edge (1264). The reference aligns the line to the right edge with the ending balance. The right edge of the block is ragged. — NOTE
- register-1280 (also 390 and drawer): Reconcile button — its label and frame appear 1 to 2 px lower than the Transfer button beside it. The reference shows the same offset, so it comes from `ShortcutButton` beside `Button`. — NOTE
- register-1280-light (also 390-light, drawer-light): "Reconciled" — small green text (`text-xs text-success`) on the white surface has low contrast. The spec names this class ("Reconciled" (`text-success`)), so it is as designed; dark mode is clear. — NOTE

### register-drawer-1280-light / register-drawer-1280-dark
Nothing found. The header beside the drawer keeps the Reconcile button inside the list panel (not cut, not under the drawer). The drawer shows "Reconciled" and "Statement of Aug 31, 2026" under the Business Savings line only, in the correct tones; the other line has no word.

### banking-menu-1280-light / banking-menu-1280-dark
Nothing found. Reconcile is after "View register" and before "Disconnect", in the same text style as the other items.

## Not shown by these shots

- No row has the word "Matched" (`text-muted-foreground`) on 1010 Business Savings. Its tone was not checked on the built screen.
- "Cleared" in the entry drawer is not shown (the open entry is a reconciled one).
- The key hint R of the Reconcile button is not visible on the button in any shot (the reference shows none also).

## Outside this checkpoint (not counted)

- Cards (390 and beside the drawer): a one-line memo leaves about 20 px of empty space under the third line, and a two-line memo fills the card. This is the card of checkpoint 5 (`CARD_HEIGHT` stays).
- Entry drawer: the account name "Business Savings" wraps to two lines while the Debit column has free space.

## For gate 3

None visible.
