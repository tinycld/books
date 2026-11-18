# Gate 2 critique after the fix round: sales-lists, checkpoint 4 (Row menus and batch actions)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 4 NOTE`

Read: all 26 built shots (captured again), and 18 of the 26 references (all 13 light references, and the dark references of all-ticked-phone-390, row-menu-phone-390, batch-menu-1280, batch-confirm-1280, batch-result-phone-390). The other 8 dark references were not read. Each finding applies to light and dark unless it says otherwise.

## Earlier BLOCKING 1: fixed

The Batch actions icon on cards is now a 44 px bordered square to the right of the search field, with the same border and radius as the search field, the date range and the customer picker. It agrees with the reference in all-ticked-phone-390, row-menu-phone-390, batch-menu-phone-390, batch-confirm-phone-390 and batch-result-phone-390, light and dark.

## State check

| Shot | State shown | Result |
|---|---|---|
| all-ticked-1280 | Two rows ticked with `bg-accent`, header box mixed, Batch actions enabled | VALID (the reference also shows a part selection) |
| all-ticked-phone-390 | Two cards ticked with `bg-accent`, bordered batch icon | VALID |
| read-only-1280 | No New button, no tick boxes, no Batch actions; row menus stay; left pad 16 | VALID |
| read-only-phone-390 | Same on cards; no New, no batch icon, no FAB | VALID |
| row-menu-1280 | Invoices tab, Open chip, menu of invoice 1015 open with 7 items, Batch actions disabled | VALID |
| row-menu-phone-390 | Sheet "Invoice 1015" with the 7 items | VALID |
| batch-menu-1280 | Menu with Delete drafts and Void under the button, two rows ticked | VALID |
| batch-menu-phone-390 | Sheet "Batch actions" with Select all, Clear selection, Delete drafts, Void | VALID (see NOTE 3) |
| batch-confirm-1280 | Dialog "Delete 9 drafts?", 29 skipped, Cancel and Delete drafts; header box checked | VALID |
| batch-confirm-phone-390 | Same dialog as a sheet, cards ticked | VALID |
| batch-none-1280 | Dialog "No drafts to delete", "None of the 13 selected documents is a draft.", Close only | VALID |
| batch-result-1280 | Banner "1 done, 1 refused: The period is closed."; the refused invoice draft stays ticked; the sales receipt draft is gone | VALID |
| batch-result-phone-390 | Same on cards; the credit memo draft is gone | VALID |

## Findings

### BLOCKING

None.

### NOTE

1. all-ticked-phone-390, batch-result-phone-390: lower right — the shell's New FAB covers the amount, the status badge and the "More actions" button of one card. The reference shows the same and the brief confirms "the shell's New FAB stays on the list routes". — NOTE
2. All `*-phone-390` shots: toolbar third row — the Sort control is cut to one letter at the right edge, with no sign that the row scrolls. This is the kept weak point of the brief (core `PickMenu` `touch` minimum width 160 px); the reference shows the same; it is a checkpoint 3 part. — NOTE
3. batch-menu-phone-390: the two ticked cards are below the sheet, so the shot does not show a selection together with the menu (the reference does). The items draw enabled, which agrees with a selection. No shot, built or reference, shows the disabled "Delete drafts" and "Void" items on cards. — NOTE
4. all-ticked-1280-dark, all-ticked-phone-390-dark, batch-menu-1280-dark, batch-result-1280-dark, batch-result-phone-390-dark: ticked rows — the Draft badge's outline is not visible on the `bg-accent` row, so the badge reads as plain grey text. The reference dark shots show the same. — NOTE

### Nothing found

- all-ticked-1280 (light), read-only-1280, read-only-phone-390, row-menu-1280, row-menu-phone-390, batch-menu-1280 (light), batch-confirm-1280, batch-confirm-phone-390, batch-none-1280, batch-result-1280 (light): nothing found.
- Row menu content and order agree with the spec ("Open, then the actions the document's read view offers … without Edit"); Void is drawn destructive.
- The banner text "1 done, 1 refused: The period is closed." differs from the reference's punctuation and agrees with the plan's `batchResultText` test text.
- The reader shots are stricter than the reference (no sidebar New, no FAB); that agrees with the spec.

## Not judged (other checkpoints)

- Status chips are wider than in the reference, so the search field is narrower at 1280 and "Void" is off screen at 390. Toolbar, checkpoint 3.
- On a card with a long customer name the date is cut ("· No…"). Cards, checkpoint 2.

## For gate 3

- Nothing visible.
