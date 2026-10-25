# CP8 critique — Close overrides panel

## State check
All 32 screenshots show the state their name says. None INVALID.
- overrides-empty: close date set, empty message, Grant button.
- grant-dialog: Dialog at 1280, bottom sheet at 390, Person/Reason/Lasts for, "Grant override".
- grant-error: Reason "ab", red border, "Enter a reason of at least 3 characters".
- overrides-active: one active row with Revoke; Expires + Granted by line.
- revoke-confirm: "Revoke Collaborator Tester's override?" dialog (1280) / sheet (390).
- overrides-past-open: "Hide past overrides (1)", past row "Ended Oct 24, 2026", no action.
- no-close-date: toggle off, "Set a close date to grant overrides.", no button.
- non-admin-accounting-override: read-only summary + own-override line.

## Findings (both widths and schemes unless named)

overrides-empty: nothing found.

grant-dialog: Reason textarea, bottom-right corner — browser resize grip shows, also inside the phone bottom sheet — NOTE.
grant-dialog: dialog header — no gap between the "Grant an override" title and the "Person" label; the other fields have a clear gap, so the title crowds the first field — NOTE.

grant-error: nothing found beyond the two grant-dialog notes.

overrides-active: nothing found. Row structure, Revoke placement, divider and Grant button match the reference.

revoke-confirm (dark, 1280 and 390): the destructive "Revoke" button is a muted rose while the light build is a full red and the primary teal in dark is full strength, so the button reads as disabled — NOTE.

overrides-past-open: nothing found. History order (empty message, toggle, past rows, Grant button) follows the reference.

no-close-date: Overrides panel — the message is body size with a paragraph gap under the heading; the reference (accounting-empty) sets it as small muted helper text tight under "Overrides", so the panel reads as a compact notice rather than a section with content. Build loses that hierarchy — NOTE.

non-admin-accounting-override: nothing found in the panel region or the own-override line. Outside this checkpoint: the 390 tab bar shows only "More" (the reference non-admin-accounting-390 shows "Books" + "More") — NOTE, not a cp8 deliverable.

## Blocking
None.

## Known, not repeated here
Settings sidebar entry under Chart of Accounts; "Save close date" inside the block.
