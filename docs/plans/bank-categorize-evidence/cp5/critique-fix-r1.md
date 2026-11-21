# Gate 2 critique, fix round 1: bank-categorize, checkpoint 5

Scope: the 8 recaptured shots only (dialog-busy, read-only-added; 390 and 1280; light and dark). Each was compared with the reference file of the same name.

Result: 0 INVALID, 0 BLOCKING, 2 NOTE.

The earlier BLOCKING (the bar's Categorize went busy and the bar cut Clear at 390) is fixed: at 390 the bar shows Match, Categorize, Exclude, Clear as disabled text buttons in one row inside the panel, and Clear is whole. The busy sign is only on the dialog's button.

## dialog-busy-390-light
State check: valid. The sheet "Categorize 3 transactions" shows the sums line, Account "6100 Rent", Payee "No payee", Cancel dimmed, and the busy button "Categorizing…".
Findings: nothing found. The bar is the same as the reference (four disabled buttons, order Match, Categorize, Exclude, Clear, none cut).

## dialog-busy-390-dark
State check: valid. Same state as the light shot.
Findings: nothing found. The disabled bar buttons have no visible border in dark; the reference shows the same.

## dialog-busy-1280-light
State check: valid. The dialog shows the busy button "Categorizing…" and Cancel dimmed.
Findings: nothing found. The dialog covers the bar's Match and Categorize (the reference does too); Exclude and Clear show as disabled, with no spinner.

## dialog-busy-1280-dark
State check: valid. Same state as the light shot.
Findings: nothing found.

## read-only-added-390-light
State check: valid. Reader view: no FAB; the sheet shows the facts and "Added to Books" with the entry link, date, amount, the line "6200 Software Subscriptions $24.00", and "Added Nov 21, 2026 by Test User". No Undo.
Findings:
- read-only-added-390-light: Added to Books, link row — the text "Journal entry JE-23" says the type two times (the seeded number has the prefix "JE-"; the reference reads "Journal entry 1043") — NOTE.
- read-only-added-390-light: panel header behind the sheet — "View register" makes the title wrap to two lines ("1000 Business / Checking") — NOTE.

## read-only-added-390-dark
State check: valid. Same state as the light shot.
Findings: the same two NOTEs as the light shot (not counted again). Text is legible.

## read-only-added-1280-light
State check: valid. Reader view: no New, no Connect account; Reviewed tab; the row "DROPBOX BUSINESS" is selected and reads "Added · Journal entry JE-23" as a link; the inline drawer shows the facts and Added to Books with no Undo. No "Reconnecting…" pill.
Findings: the "Journal entry JE-23" NOTE applies here also (row and drawer; not counted again). Otherwise nothing found: structure, hierarchy and the place of the detail agree with the reference.

## read-only-added-1280-dark
State check: valid. Same state as the light shot. No "Reconnecting…" pill.
Findings: nothing new. Text is legible; the selected row is clear.

## For gate 3
Nothing.
