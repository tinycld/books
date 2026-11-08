# Critique: for-review checkpoint 3 (Transaction drawer with Exclude)

Delivers: the drawer with the full facts of a pressed transaction (register placement, open row highlighted), Exclude / Move to For review from it, the result or refusal line.

Not judged (later checkpoints): check boxes, select-all, selection bar, batch buttons, keys.

## State check

| shot | state | verdict |
|---|---|---|
| drawer-1280-light / -dark | drawer open on CHECK 1050, row highlighted `bg-accent` | valid |
| drawer-390-light / -dark | bottom sheet with the full facts and Exclude | valid |
| drawer-long-1280-light / -dark | drawer open on GUSTO PAYROLL ($12,843.10) | valid (the open row is below the visible rows, see gate 3) |
| drawer-long-390-light / -dark | sheet with GUSTO PAYROLL, Memo, no Check no. | valid (light: Exclude in hover tint, a capture artifact per the capture notes) |
| done-1280-light / -dark | "Excluded 1 transaction." under the toolbar, CHECK 1050 gone, count 7 | valid |
| done-390-light / -dark | same on the phone, line under the filters above "Newest first" | valid |

0 INVALID.

## Findings

### drawer-1280-light, drawer-1280-dark, drawer-long-1280-light, drawer-long-1280-dark

- Account panel, right of the list — the inline drawer is nested inside the account card beside the list and is clipped at the card's height. At 1280×800 only "Transaction", the close button, the amount and the chip show; "Spent" is cut through its glyphs, and the Date, Description, Memo, Check no., Account, From file and Imported fields and the Exclude button are not visible at all. Below the cut "Spent" the card leaves about 60 px of blank space, so the clip looks like a layout fault, not a scroll. The reference puts the drawer as a full-height column at the page's right edge (header to bottom), with the whole fact list and Exclude visible and the Banking page narrowed beside it. — BLOCKING (spec §3 "opens the transaction in a core `Drawer` with the register's placement (`EntryDrawer`): inline on the right on wide desktop"; spec §3 "Content (test id `bank-txn-drawer`), top to bottom: The amount … Fields as label/value rows … Actions (writers only, at the bottom of the drawer)"; reference `drawer-1280-*`: the drawer is a page-level column at full height, the detail lives beside the page, not inside the card.) Note for the driver: the plan's step 9 ("`<View className="flex-1 flex-row">` with the list … and the inline drawer beside it" inside `ReviewTabBody`) is what produced this; the register's `EntryDrawer` placement puts the inline drawer beside the screen, not inside the tab body.

### drawer-1280-*, drawer-long-1280-*, drawer-390-*, drawer-long-390-*

- Amount block — the status chip sits at the right of the amount, on the amount's line. The reference stacks amount, "Spent", then the chip, left aligned under them. The spec does not fix the chip's position, so this is a layout choice; the stacked form reads as one block and leaves the right edge free for a later Reviewed label. — NOTE

### drawer-390-light, drawer-390-dark

- Bottom of the sheet — the Exclude button is the last item of the scrolling body and touches the sheet's bottom edge; its bottom border is cut (light shot) and there is no inset below it, while `drawer-long-390-*` (fewer fields) shows the same button with room under it. A bottom padding on the body or the action block would keep the 44 pt target whole at every field count. — NOTE

### drawer-long-390-light, drawer-long-390-dark

- nothing found (the hover tint on Exclude is a capture artifact).

### done-1280-light, done-1280-dark

- nothing found. The line reads "Excluded 1 transaction." in `text-sm text-muted-foreground` under the toolbar, as the reference; the row has left the list and the counts read 7.

### done-390-light, done-390-dark

- nothing found. The line sits under the filter row and above the "Newest first" bar, as the reference.

## For gate 3

- `drawer-long-1280-*`: the capture pressed GUSTO PAYROLL (row 4, Oct 12), which Playwright scrolled into view, yet the shot shows the list back at its top (Oct 27, 16, 14) with the open row out of view. Opening the drawer appears to reset the list's scroll (the list re-laid out or re-mounted when the drawer column appeared). The open row should stay in view after the press.
