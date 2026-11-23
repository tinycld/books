# Gate 2 design critique: reconciliation-report, checkpoint 4 (Admin undo and help)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 5 NOTE`

Scope: the Delivers line of checkpoint 4 (the undo item in the history menus and the finished summary's menu, the undo dialog with its blocked, sending, refused and failed states). Each built shot was read in light and dark (40 files). Each reference shot was read in light, and `undo-sending-1280` and `finished-menu-1280` also in dark.

Accepted differences, not reported: the red "Undo reconciliation" in the history's row menu (settled difference 7); the seed accounts (2100 Company Card, 1010 Business Savings); the faked refusal text.

## State check

| Shot | Widths | State shown | Result |
|---|---|---|---|
| history | 1280, 1024, 390, 375 | Populated history, admin: table at 1280, cards at 1024/390/375; More menu on the latest row of each account only | valid |
| history-row-menu | 1280, 390 | Row menu open (1280: popover with Undo; 390: sheet with View report + Undo) | valid |
| history-reader | 1280 | Read-only user: View report links, no More menu | valid |
| history-reader-card-menu | 390 | Read-only user: sheet with View report only | valid |
| finished | 1280, 390 | Finished summary, admin, More in the header | valid |
| finished-menu | 1280, 390 | Header menu open with Undo reconciliation | valid |
| finished-reader | 1280 | Finished summary, read-only user, no More | valid |
| undo | 1280, 390 | Undo dialog (sheet at 390), Cancel + destructive submit | valid |
| undo-blocked | 1280, 390 | Blocked text, "Open it", Close, no Undo button | valid |
| undo-sending | 1280 | "Undoing…" with spinner, Cancel disabled | valid |
| undo-refused | 1280, 390 | Server text in a danger box in the dialog, submit enabled again | valid |
| undo-failed | 1280 | "The change could not be sent. Check your connection and try again." in the dialog | valid |

No INVALID shot.

## Findings

- history-1280 (light, dark; also visible in history-row-menu-1280 and history-reader-1280): Cleared column, row 1010 Business Savings — "262 transactions" is cut to "262 transacti…". The column is 112 px fixed (settled difference 2), which fits a count of one digit only as far as two digits; a count of three digits is normal for a bank month. The number stays readable, the unit word is cut. — NOTE
- finished-menu-1280 (light, dark) and finished-menu-390 (light, dark): the primary button "View report" is drawn faded (disabled look) while the More menu is open. In `finished-1280` it is solid, and the reference `finished-menu-1280` keeps it solid under the open menu. At 1280 there is no scrim, so the page changes under a menu that has no relation to the button. — NOTE (see also "For gate 3")
- undo-refused-390-light: above the submit button — a hover hint "Undo reconciliation ⌘↵" is drawn on a phone shot, and it touches the lower right corner of the refusal box. The dark shot does not have it. This is a capture artifact (the pointer stayed on the button after the click); move the pointer off before the shot. — NOTE
- undo-blocked-1280 (light, dark): dialog body — the space above the link "Open it" is about 12 px larger than in the reference (text ends at y 385, link at y 429; reference 391 and 423), so the link looks detached from the sentence it belongs to. The 390 sheet matches the reference. — NOTE
- undo-sending-1280-dark: submit button — the `ButtonSpinner` is almost not visible on the disabled destructive button (dark arc on dark maroon). The reference has the same look, so this is the core component's look, not a difference. — NOTE

Nothing found: history-1024, history-390, history-375, history-row-menu-390, history-reader-card-menu-390, finished-1280, finished-390, finished-reader-1280, undo-1280, undo-390, undo-blocked-390, undo-refused-1280, undo-refused-390-dark, undo-failed-1280.

## Checked and correct

- The More menu shows only on the latest row of each account; a row with no menu keeps the 44 px spacer, so "View report" stays in one column (admin and reader).
- No table scrolls sideways at any captured width; the list is cards at 1024, 390 and 375.
- Card layout follows settled difference 3 (count on line two at the right, "Reconciled … by …" on line three).
- Dialog title, text, button order and destructive button match the spec text and the reference in light and dark; the refusal and the failure show in the dialog in `text-danger`.
- The blocked dialog has no Undo button, the link "Open it" and "Close".
- Light and dark are legible in every shot.

## Not shown by these shots

- A long account name and a long person name (the fixture's truncation cases) are not in the seed, so the built shots do not show their ellipsis. The reference shows them at 1280, 1024, 390 and 375.
- The disabled Undo while the server cannot take writes has no shot (the plan has none for it).

## For gate 3

- "View report" looks disabled while the finished summary's More menu is open (finished-menu-1280, finished-menu-390). Check whether the `ShortcutButton` is disabled by the key's `when: noMenuLayerOpen` condition; that condition must stop the key R only, not the button.
