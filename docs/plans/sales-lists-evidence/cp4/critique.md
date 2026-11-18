# Gate 2 critique: sales-lists, checkpoint 4 (Row menus and batch actions)

Verdict: `CRITIQUE: 0 INVALID, 1 BLOCKING, 3 NOTE`

All 26 built shots were read with their 26 references. Each finding applies to light and dark unless it says otherwise.

## State check

| Shot | State shown | Result |
|---|---|---|
| all-ticked-1280 (light, dark) | Two rows ticked, `bg-accent` rows, header box mixed, Batch actions enabled | VALID (the reference also shows a part selection) |
| all-ticked-phone-390 | Two cards ticked with `bg-accent`, batch icon in the toolbar | VALID |
| read-only-1280 | No New button, no tick boxes, no Batch actions; row menus stay; left pad 16 | VALID |
| read-only-phone-390 | Same on cards; no New, no batch icon, no FAB | VALID |
| row-menu-1280 | Invoices tab, Open chip, menu of invoice 1015 open with 7 items | VALID |
| row-menu-phone-390 | Sheet "Invoice 1015" with the 7 items | VALID |
| batch-menu-1280 | Menu with Delete drafts and Void under the button, two rows ticked | VALID |
| batch-menu-phone-390 | Sheet "Batch actions" with Select all, Clear selection, Delete drafts, Void | VALID (see NOTE 3) |
| batch-confirm-1280 | Dialog "Delete 9 drafts?", 29 skipped, Cancel and Delete drafts; header box checked | VALID |
| batch-confirm-phone-390 | Same dialog as a sheet | VALID |
| batch-none-1280 | Dialog "No drafts to delete", "None of the 13 selected documents is a draft.", Close only | VALID |
| batch-result-1280 | Banner "1 done, 1 refused: The period is closed."; the refused draft stays ticked; the deleted draft is gone | VALID |
| batch-result-phone-390 | Same on cards | VALID |

## Findings

### BLOCKING

1. all-ticked-phone-390, batch-menu-phone-390, batch-confirm-phone-390, batch-result-phone-390, row-menu-phone-390 (light and dark): toolbar, right of the search field — the Batch actions icon has no border and no box. The reference draws it as a 44 px bordered square, the same as the search field, the date range and the customer picker in the same toolbar. In the build a bare check-box glyph floats beside the search field: it reads as a tick box, not as a menu button, and it is the only unframed control in the toolbar. — BLOCKING (brief, Decisions: "The scratch route is the visual reference for every rendering checkpoint. Copy its class names and sizes"; reference decision: the bordered icon button in every `*-phone-390` writer shot).

### NOTE

1. all-ticked-phone-390, batch-result-phone-390: lower right — the shell's New FAB covers the amount, the status badge and the "More actions" button of the card below it. The reference shows the same and the brief confirms "the shell's New FAB stays on the list routes", so this is not a break. The card's menu is reachable only after a scroll. — NOTE
2. All `*-phone-390` shots: toolbar third row — the Sort control is cut to one letter ("S") at the right edge, with no sign that the row scrolls. This is the kept weak point of the brief (core `PickMenu` `touch` minimum width 160 px). The reference shows the same. It is a checkpoint 3 part; no rule is broken here. — NOTE
3. batch-menu-phone-390: the two ticked cards are below the sheet, so the shot does not show a selection together with the menu (the reference does). The items draw enabled, which agrees with a selection. No shot, built or reference, shows the disabled "Delete drafts" and "Void" items on cards. — NOTE

### Nothing found

- all-ticked-1280, read-only-1280, read-only-phone-390, row-menu-1280, batch-menu-1280, batch-confirm-1280, batch-confirm-phone-390 (apart from BLOCKING 1), batch-none-1280, batch-result-1280: nothing found.
- Row menu content and order agree with the spec ("Open, then the actions the document's read view offers … without Edit"); Void is drawn destructive.
- The banner text "1 done, 1 refused: The period is closed." differs from the reference's punctuation and agrees with the plan's `batchResultText` test text.
- The reader shots are stricter than the reference (no sidebar New, no FAB); that agrees with the spec.

## Not judged (other checkpoints)

- Status chips are wider than in the reference (about 8 px each), so the search field is narrower at 1280 and "Void" is off screen at 390. Toolbar, checkpoint 3.
- On a card with a long customer name the date is cut ("· No…"). Cards, checkpoint 2; the reference cuts the same way.

## For gate 3

- Nothing visible.
