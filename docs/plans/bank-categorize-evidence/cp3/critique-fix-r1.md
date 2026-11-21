# Gate 2 design critique — bank-categorize, checkpoint 3, fix round 1

Scope: the 20 re-captured shots (`categorize-picker`, `payee-picker`, `match`, `sending`, `picker-failed`, each at 390 / 1280 × light / dark). All 20 built PNGs were read. 14 reference PNGs were read: the light shot of each state at both widths, plus `match-390-dark`, `picker-failed-1280-dark`, `sending-1280-dark`, `categorize-picker-390-dark`. The Split link (checkpoint 4) is not a finding. `sending-*` is compared on the button and the disabled fields only.

Result: 0 INVALID, 0 BLOCKING, 3 NOTE.

## Fix check

| Fix asked | Result |
|---|---|
| At 390 the picker sheet draws above the transaction sheet | Done. Account and Payee sheets are on top, with the full list in view. |
| Match section keeps the sentence, drops the "Match" title and border | Done. All 4 shots agree with the reference. |
| Memo is dimmed with the other fields while sending | Done. Memo text and border are dimmed in all 4 shots. |
| `picker-failed` first capture | Done. "Could not load." with Retry; Categorize is disabled. |

## State check and findings, per shot

### categorize-picker-390 (light, dark)
State: valid (was INVALID). The Account sheet is open above the transaction sheet: title, search field, groups by account type, sub-account 6210 indented, tick on 6200.
- categorize-picker-390-light, categorize-picker-390-dark: Account sheet, search field — the search field starts 8 px from the sheet edge; the title and the group headings start at 20 px. The field is not aligned with the content under it — NOTE. The same inset shows in payee-picker-390 and picker-failed-390 (one finding for the shared sheet).

### categorize-picker-1280 (light, dark)
State: valid. Popover under the Account trigger, 6200 ticked.
Nothing found.

### payee-picker-390 (light, dark)
State: valid (was valid in part). The Payee sheet is on top; "No payee" with tick, group "Customers", the full list.
Nothing found other than the inset NOTE above. The long name "Audit access customer w1-1795281448555-1" fits on one line.

### payee-picker-1280 (light, dark)
State: valid. Popover under the Payee trigger; the long customer name truncates with an ellipsis.
Nothing found.

### match (390, 1280 × light, dark)
State: valid. "Match (1)" selected; "Books transactions that fit this bank transaction." in muted text directly under the switch; no "Match" title, no second border; one suggestion ticked, totals line, Match and Find other matches.
Nothing found. The earlier BLOCKING finding is closed.

### sending (390, 1280 × light, dark)
State: valid. "Categorizing…" on a disabled button; Payee, Account, Memo, the way switch and Exclude are dimmed.
- sending-* (all 4): the "Memo" label — the label is dimmed with its field, but the "Payee" and "Account" labels keep full strength. The three labels of one column do not agree — NOTE.

### picker-failed-1280 (light, dark)
State: valid. Account popover open: search field, "Could not load." in danger color, Retry at the right. Categorize is disabled (its top edge shows under the popover).
- picker-failed-* (all 4): search field above the error row — the search field stays shown and looks usable while there is nothing to search — NOTE.

The reference shows this state with the picker closed (empty form, disabled Categorize). The build shows the same form plus the open error row, so no reference decision is lost.

### picker-failed-390 (light, dark)
State: valid. Account sheet above the transaction sheet: search field, "Could not load.", Retry. Behind it the form shows "Choose an account" and a disabled Categorize.
Nothing found other than the two NOTEs above (the inset applies to the error row too: it starts at 12 px). The danger text is legible in light and dark.

## Checked and clean across the set
- No table or grid scrolls sideways at 390 or 1280.
- Light and dark: dimmed fields, muted sentence, danger text and disabled buttons are legible.
- The spinner NOTE of the first critique (not visible on the dimmed button) is unchanged and is not repeated here.

## For gate 3 (behavior, not findings)
1. picker-failed: confirm that Retry reloads the accounts and that the search field does nothing harmful while the read has failed.
2. sending: confirm that Memo is not editable while the write is sent (it now looks disabled).
