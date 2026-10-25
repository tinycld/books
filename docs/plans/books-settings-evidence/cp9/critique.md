# CP9 critique — Numbering section (round 2)

## State check

All 16 screenshots show the state their name says.

- numbering (390/1280, light/dark): JV- / 2001, Save disabled, preview "Next entry: JV-2001". Valid.
- numbering-refusal (all): Next number 1, red border, "Numbers up to 9 are already used. The next number must be 10 or higher." under the field, Save enabled. Valid.
- numbering-invalid (all): Prefix A_1, red border, "Use letters, digits, and hyphens only" under the field. Valid.
- non-admin-numbering (all): label/value rows, preview, helper text, no Save. Valid.

## Previous findings

Both fixed. "Journal entries" is now larger and heavier than "Prefix" / "Next number"; the preview line is regular weight. At 1280 Prefix and Next number sit side by side as in `numbering-1280-*`; at 390 they stack and the inputs stay inside the card (the reference's row overflowed there).

## Findings

numbering-1280 (light, dark): nothing found.

numbering-390 (light, dark): nothing found.

numbering-refusal-1280 and numbering-invalid-1280 (light, dark): card body — the gap from the error text to the "Next entry" preview (about 47px) is larger than the gap from the inputs to the preview in the clean state (about 39px); the error adds its own bottom margin on top of the row gap — NOTE.

numbering-refusal-390 (light, dark): nothing found.

numbering-invalid (all): preview line — "Next entry: A_12001" joins the rejected prefix into the preview. The spec asks for a live preview of "prefix plus number", so this is acceptable; a reader may still take it as a valid number — NOTE.

non-admin-numbering (all): nothing found. Rows, preview and helper text match the read-only pattern; no Save.

Known and not repeated: Settings sidebar entry placement; mobile tab bar "More"-only for the collaborator; Prefix error text without a period.
