# Checkpoint 6 — Tax group dialog — gate-2 design critique

Scope judged: the Add group button, the add and edit group dialog, its rate checklist, the combined-rate line, and a stored inactive rate kept on edit. Not judged: row and agency menus, the Default for new sales card, the help icon (later checkpoints). The agency-then-name order of the inactive option is a decided change, not a finding. The second agency card ("No rates yet.") in `one-rate` is real seeded data, not a finding.

## State check

| Shot | State named | Shows it? |
|---|---|---|
| add-group-1280-light | Add group dialog, name filled, three rates checked, combined line | Yes |
| add-group-1280-dark | same, dark | Yes |
| add-group-phone-390-light | same, bottom sheet at 390 | Yes |
| add-group-phone-390-dark | same, dark | Yes |
| edit-group-1280-light | Edit group dialog, stored inactive rate checked and listed "(inactive)", combined 12.21% | Yes |
| edit-group-1280-dark | same, dark | Yes |
| one-rate-1280-light | one active rate; groups card "Add at least two rates to combine them."; Add group disabled | Yes |
| one-rate-1280-dark | same, dark | Yes |

No shot is INVALID.

## Findings

add-group-1280-light: dialog body, under "Combined rate: 8.71% · Tax on $100.00: $8.71" — about 40 px of blank space before the footer divider; the reference has about 28 px. The dialog looks a little bottom-heavy. — NOTE

add-group-1280-dark: same gap as the light shot. Legibility is good: labels, the muted hint "Choose two to ten rates.", the unchecked checkbox outlines and the combined line all read against the dark surface, as in the reference. — NOTE (same as above)

add-group-phone-390-light: bottom sheet, same structure as the reference. Long labels wrap to two or three lines with the checkbox centred, as the reference. Same extra space under the combined line (about 39 px against 27 px). — NOTE (same as above)

add-group-phone-390-dark: nothing found beyond the shared spacing note.

edit-group-1280-light: title "Edit group", "Save changes" button, stored inactive rate shown checked with "(inactive)" in the label, combined line updated to 12.21% — all as the reference and the spec ("An edit dialog keeps a stored rate that has since become inactive checked and listed (with "inactive")"). Name input carries the focus ring (autofocus); the reference shows it unfocused — a decided behaviour (data-entry forms autofocus the first input), not a finding. Same extra space under the combined line (about 40 px against 28 px). — NOTE (same as above)

edit-group-1280-dark: nothing found beyond the shared spacing note. Focus ring on Name is visible and legible in dark.

one-rate-1280-light: nothing found. Add group is disabled and reads as disabled; the groups card shows the spec's text; the agency with no rates shows "No rates yet." with Add rate under it.

one-rate-1280-dark: nothing found. Disabled "Add group" is dim but legible, as the reference.

## Totals

- INVALID: 0
- BLOCKING: 0
- NOTE: 1 (one spacing note, visible in the six dialog shots)
