# Gate 2 critique — bank-connection checkpoint 7 (Banking keys, focus and help)

Delivers judged: first-field focus in the Connect and Edit bank details dialogs (Account at 1280 in Connect, Bank name at 1280 in Edit, nothing at 390). Keys and help are not visible in these shots and belong to gates 1 and 3.

## State check

- connect-1280-light: VALID — Connect dialog open over the populated page, fields empty.
- connect-1280-dark: VALID — same, dark.
- connect-390-light: VALID — Connect sheet open on a phone, no field focused.
- connect-390-dark: VALID — same, dark.
- edit-details-1280-light: VALID — "Bank details for 1000 Business Checking" dialog, Bank name focused (ring), Last 4 "4821".
- edit-details-1280-dark: VALID — same, dark, Bank name focused.
- edit-details-390-light: VALID — Edit sheet on a phone, nothing focused.
- edit-details-390-dark: VALID — same, dark.

## Findings

connect-1280-light: nothing found. The Account trigger shows no focus ring; the reference shows none either, and the ledger records that core `SelectInput` programmatic focus draws no visible ring (core component, not a Books change). Whether the trigger holds focus is for gate 3 (`toBeFocused`).

connect-1280-dark: nothing found.

connect-390-light: nothing found (no field focused, as the spec requires on a phone).

connect-390-dark: nothing found.

edit-details-1280-light: nothing found. Bank name carries the core focus ring; this is the spec's "Edit bank details opens with Bank name focused when wide". The reference (captured before focus existed) shows no ring; the built shot adds the state the spec decided, so it is not a loss.

edit-details-1280-dark: nothing found. The ring is legible on the dark surface.

edit-details-390-light: nothing found (no field focused, so the soft keyboard does not cover the sheet).

edit-details-390-dark: nothing found.

Differences from the references that are not findings: the built sidebar lists "Banking" (real nav entry; the reference was a scratch route) and the seeded data differs (one file, "Nov 6, 2026 by Test User", "$24,121.00"; the Edit dialog's Bank name is filled from the real connection). Structure, hierarchy and where each detail lives match the references in every shot.

## For gate 3

- Connect at 1280: confirm `bank-connect-account` holds focus after open and after `n`, since the shot cannot show it.

CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE
