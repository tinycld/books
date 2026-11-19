# Gate 2 design critique, write-off checkpoint 2, round 3

Scope: 8 built shots in `docs/plans/write-off-evidence/cp2/`, each compared with the file of the same name in `docs/plans/write-off-reference/`. Judged against the checkpoint's Delivers line (the Write off dialog on the invoice), spec §3.2, and the reference.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE (3 different findings; each is listed under every shot that shows it).

## State check

| Shot | Named state | Shows | Result |
|---|---|---|---|
| dialog-errors-390-light | date error + account error, phone, light | Sheet, date 2026-01-02 with "Date the write-off on or after the invoice date, Nov 19, 2026.", empty select with red border and "Choose an account" | VALID |
| dialog-errors-390-dark | same, dark | same content, dark theme | VALID |
| dialog-errors-1280-light | same, wide, light | centered dialog, both errors | VALID |
| dialog-errors-1280-dark | same, wide, dark | same content, dark theme | VALID |
| dialog-filled-390-light | filled form, phone | date 2026-11-19, "6050 Bad debts", reason typed, button enabled | VALID |
| dialog-filled-1280-light | filled form, wide | same content in the centered dialog | VALID |
| dialog-no-account-390-light | no expense account, phone | empty select, "Add an expense account to the chart of accounts", action button disabled | VALID |
| dialog-no-account-1280-light | no expense account, wide | same content in the centered dialog | VALID |

## Findings

Finding IDs:
- N1: summary line breaks inside the date.
- N2: notice cut by the footer in the phone error state.
- N3: read bar and back link behind the dialog (not the dialog itself).

### dialog-errors-390-light
- State: VALID.
- dialog-errors-390-light: summary line under the title — the longer customer name wraps the line and the break falls inside the date ("Nov 19," / "2026") — NOTE (N1). Real data; the reference customer name fits on one line.
- dialog-errors-390-light: notice box above the footer — its third line ("owed to the tax agency.") is cut by the footer; the reference shows the full notice in this state. The cause is the two-line summary plus the two error texts; the body scrolls. — NOTE (N2).

### dialog-errors-390-dark
- State: VALID.
- dialog-errors-390-dark: summary line — N1 — NOTE.
- dialog-errors-390-dark: notice box above the footer — N2 — NOTE.
- Dark legibility: error text, red select border, muted summary, placeholder and notice text are all readable. Nothing found.

### dialog-errors-1280-light
- State: VALID.
- dialog-errors-1280-light: summary line — break inside the date ("Nov 19," / "2026") — NOTE (N1).
- dialog-errors-1280-light: screen behind the dialog — the read bar shows a "More" button at the left beside the full row of actions, and "Download PDF" alone on a second row; the reference bar has no "More" at this width. The back link reads "Journal entries" while the sidebar marks Sales. Not part of the dialog; check it against the `invoice-*` shots. — NOTE (N3).
- Dialog structure, order, figure hierarchy, error placement, footer: same as the reference. The dialog (700 px high) fits the 800 px view.

### dialog-errors-1280-dark
- State: VALID.
- dialog-errors-1280-dark: summary line — N1 — NOTE.
- dialog-errors-1280-dark: screen behind the dialog — N3 — NOTE.
- Dark legibility: nothing found.

### dialog-filled-390-light
- State: VALID.
- dialog-filled-390-light: summary line — N1 — NOTE.
- All content, the notice included, is above the footer. Nothing else found.

### dialog-filled-1280-light
- State: VALID.
- dialog-filled-1280-light: summary line — N1 — NOTE.
- dialog-filled-1280-light: screen behind the dialog — N3 — NOTE.
- The focus ring on Reason (the reference has none) comes from real typing; not a finding.

### dialog-no-account-390-light
- State: VALID.
- dialog-no-account-390-light: summary line — N1 — NOTE.
- The error sits directly under the select (16 px), as the field errors of the error state do; the reference had a wider gap there. The build is more consistent. The disabled action button matches the reference. Nothing else found.

### dialog-no-account-1280-light
- State: VALID.
- dialog-no-account-1280-light: summary line — N1 — NOTE.
- dialog-no-account-1280-light: screen behind the dialog — N3 — NOTE.
- Nothing else found.

## Checked and not a finding
- Close "X" on the phone Sheet, while the spec says `hasCloseButton={false}`: the reference shows the same X on the Sheet.
- The no-account state keeps the select and puts the message under it (the brief's Do step 4 says "in place of the select"): the reference keeps the select, and the build follows the reference.
- The date error wraps to two lines at the date field's width: the reference does the same.
- No table or grid is in these shots; nothing scrolls sideways.

## For gate 3
- None seen in these shots.

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
