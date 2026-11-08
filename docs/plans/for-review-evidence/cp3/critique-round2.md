# Critique round 2: for-review checkpoint 3 (Transaction drawer with Exclude)

Shots captured again after fix round 1. Delivers: the drawer with the full facts of a pressed transaction (register placement, open row highlighted), Exclude / Move to For review from it, the result or refusal line.

Not judged (later checkpoints): check boxes, select-all, selection bar, batch buttons, keys.

## State check

| shot | state | verdict |
|---|---|---|
| drawer-1280-light / -dark | drawer open on CHECK 1050 as a full-height column at the page's right edge; the row highlighted `bg-accent` with its second line readable; all seven fields and Exclude visible | valid |
| drawer-390-light / -dark | bottom sheet with amount, Spent, chip, seven fields, Exclude | valid |
| drawer-long-1280-light / -dark | drawer open on GUSTO PAYROLL ($12,843.10), Memo, no Check no.; the open row is below the visible rows (as in the reference, whose Sep 9 row is also out of view) | valid |
| drawer-long-390-light / -dark | sheet with GUSTO PAYROLL, Memo, no Check no. (light: Exclude in hover tint, a capture artifact per the capture notes) | valid |
| done-1280-light / -dark | "Excluded 1 transaction." under the toolbar, CHECK 1050 gone, "For review (7)" / "7 to review" | valid |
| done-390-light / -dark | same on the phone, the line under the filter row and above "Newest first" | valid |

0 INVALID.

## Round 1 BLOCKING: resolved

The inline drawer no longer sits inside the account card. At 1280 it is a page-level column from the header to the bottom edge, the Banking page narrowed beside it, with the whole fact list (Date, Description, Memo, Check no., Account, From file, Imported) and Exclude visible, as the reference `drawer-1280-*` decided. No clip, no blank band.

## Findings

### drawer-1280-*, drawer-long-1280-*, drawer-390-*, drawer-long-390-*

- Amount block — the status chip sits at the right of the amount, on the amount's line; the reference stacks amount, "Spent", then the chip, left aligned. The spec names the three parts but not the chip's position, so this is a layout choice. The stacked form reads as one block and keeps the right edge free. — NOTE (unchanged from round 1)

### drawer-390-light, drawer-390-dark

- Bottom of the sheet — the body is clipped at about y=797 and the Exclude button is the last item, so its bottom border is cut (visible in light); under the clip, the ~47 px to the screen edge is an empty band in a different tone from the sheet (light grey in light mode) with nothing in it. `drawer-long-390-*` (one field fewer) shows the same button whole with room under it. A bottom padding on the body or the action block (reaching the inset) would keep the 44 pt target whole at every field count and make the band read as the sheet's own inset. — NOTE (the reference clips the same way, mid-"1050"; no rule fixes an inset)

### drawer-long-390-light, drawer-long-390-dark

- nothing found. The wrap of a long description cannot be judged from the seed ("GUSTO PAYROLL" fits one line); the Description value has the full width of the sheet, as the reference.

### drawer-long-1280-light, drawer-long-1280-dark

- nothing found beyond the shared chip NOTE. Field spacing, label/value hierarchy and the divider above Exclude match `drawer-1280-*`.

### done-1280-light, done-1280-dark

- nothing found. "Excluded 1 transaction." is `text-sm text-muted-foreground` under the toolbar, the row has left the list, the counts read 7, Spent/Received columns return with the drawer closed.

### done-390-light, done-390-dark

- nothing found. The line sits under the filter row and above the "Newest first" bar, as the reference (the reference draws it in a teal tone; the spec says `text-muted-foreground`, which the build follows).

## For gate 3

- `drawer-long-1280-*`: the capture pressed GUSTO PAYROLL (row 4, Oct 12), which Playwright scrolled into view, yet the shot shows the list back at its top (Oct 27, 16, 14) with the open row out of view. The reference shows the same (its open Sep 9 row is also off screen), so it is not a design loss, but if opening the drawer resets the list's scroll (re-layout when the page narrows), the open row should stay in view after the press.
