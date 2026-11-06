# Checkpoint 5 design critique — Agency and rate dialogs

Scope judged: the Add/Edit agency dialog, the Add/Edit rate dialog (bottom sheets on a phone), the liability account picker and its one-tap account create, the percent field with the live tax line, and the Add agency, empty-state Add agency and per-card Add rate entry points. Not judged: Add group, row and agency menus, the Default for new sales card, the help icon.

Capture note applied: the no-account shots fake the accounts read without 2200, so the agency cards behind the dialog read "Tax goes to" with no account. That is the expected faked state, not a finding.

## State check

| Shot | Shows its named state | Result |
|---|---|---|
| add-agency-1280-light | Add agency dialog over the populated page, Name filled, 2200 Sales tax payable preselected | valid |
| add-agency-1280-dark | same, dark | valid |
| add-agency-phone-390-light | Add agency bottom sheet over the populated page at 390 | valid |
| add-agency-phone-390-dark | same, dark | valid |
| add-agency-no-account-1280-light | Add agency dialog; Liability account replaced by the note and the Create Sales tax payable account button | valid |
| add-agency-no-account-1280-dark | same, dark | valid |
| add-agency-no-account-phone-390-light | same as a bottom sheet at 390 | valid |
| add-agency-no-account-phone-390-dark | same, dark | valid |
| add-rate-1280-light | Add rate dialog opened from the Colorado card: Name, Rate with % suffix, live tax line, Agency preselected | valid |
| add-rate-1280-dark | same, dark | valid |
| add-rate-phone-390-light | Add rate bottom sheet at 390 | valid |
| add-rate-phone-390-dark | same, dark | valid |
| empty-1280-light | No agencies: question, line, core Button Add agency | valid |
| empty-1280-dark | same, dark | valid |
| empty-390-light | same at 390 | valid |
| empty-390-dark | same, dark | valid |

INVALID: 0

## Critique

Each built shot keeps the reference's structure, hierarchy and detail placement. The only differences from the reference are parts of later checkpoints (help icon, Add group, Default for new sales card, row menus). The capture fills a field before the shot, so a focus ring shows on Name (agency) or Rate (rate); the reference has no focus ring. That is capture state, not a finding.

add-agency-1280-light: nothing found.
add-agency-1280-dark: nothing found.
add-agency-phone-390-light: nothing found.
add-agency-phone-390-dark: nothing found.
add-agency-no-account-1280-light: nothing found.
add-agency-no-account-1280-dark: nothing found.
add-agency-no-account-phone-390-light: nothing found.
add-agency-no-account-phone-390-dark: nothing found.
add-rate-1280-light: nothing found.
add-rate-1280-dark: nothing found.
add-rate-phone-390-light: nothing found.
add-rate-phone-390-dark: nothing found.
empty-1280-light: nothing found.
empty-1280-dark: nothing found.
empty-390-light: nothing found.
empty-390-dark: nothing found.

Checked against the spec and found correct:
- Agency dialog title "Add agency", fields Name and Liability account, buttons Cancel and Add agency (spec: Agency dialog).
- Liability account label "2200 Sales tax payable", Sales tax payable preselected when adding (spec: "the first active account with detail type Sales tax payable is preselected").
- No-account state: note "Your chart has no sales tax liability account." and button "Create Sales tax payable account" in place of the select (spec: Agency dialog, third bullet).
- Rate dialog title "Add rate", fields Name, Rate with a "%" suffix inside the input, Agency preselected with the card's agency (spec: Rate dialog).
- Live line "Tax on $100.00: $0.75" under Rate (spec: "A live line under Rate").
- Empty state text and a core Button Add agency (spec: Empty; lesson 14: empty-state actions use a core Button).
- Phone: dialogs open as bottom sheets, cards fill the width with a 16 px gutter, the New FAB stays on the empty page (spec: "Wide and phone show the same structure").
- Light and dark: labels, muted help text and the live tax line stay legible; semantic tokens, no raw colors visible.

## Counts

INVALID: 0
BLOCKING: 0
NOTE: 0
