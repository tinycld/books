# Gate 2 critique — customer-balance, checkpoint 4 (header names the Customer picks)

Scope judged: the new document header line only (Delivers: "the Customer Balance report's document header names the picked customers and whole-group picks"). The reference shows no header line, so the line is judged by itself. The cp2 shots of the same state were used to separate this checkpoint's change from earlier ones.

## filtered-1280-light

State check: VALID. Customer chip = "Aspen Ridge Dental, All Harborview Hospitality Group sub-customers"; rows are Aspen Ridge Dental and the Harborview family with its total; no No customer row.

Findings: nothing found.

- The header line "Customer: Aspen Ridge Dental, All Harborview Hospitality Group sub-customers" is under "As of November 16, 2026", in the same muted style and left edge as the period line. Hierarchy holds: organization, title, period, picks.
- The line names the record pick by its label and the group pick by its `groupLabel` text, joined by ", " (spec §3 Params, Customer: "the document header names the picks").
- The table moved down by one line only; the spacing below the header block is the same as in cp2.

## filtered-1280-dark

State check: VALID. Same state as the light shot.

Findings: nothing found. The line has the same contrast as the period line above it and is legible.

## filtered-390-light

State check: VALID. Same picks (chip visible in the scrolled chip row), same rows.

Findings: nothing found.

- The header line wraps to two lines at a word boundary ("…All Harborview" / "Hospitality Group sub-customers"). No truncation, no overflow past the right edge, line height consistent with the period line.

## filtered-390-dark

State check: VALID. Same state as the light phone shot.

Findings: nothing found. The two-line wrap is legible.

## Notes for all four shots

- filtered-*: document header, picks line — the line repeats the Customer chip's text directly above it on screen — NOTE. The spec asks for the line, and it is what an export heading keeps; no change needed.
- filtered-390-*: document header, picks line — the line has no line limit; a long pick list would push the table down by many lines on a phone. Not visible with two picks — NOTE.

## Differences from the reference that are not findings of this checkpoint

Present in the cp2 built shots too, so not introduced here: no Books sidebar (the built URL is core's `/a/reports/<id>`), no Share button in the toolbar, sort marks in the column headers, the seeded book's names and figures (plan D9), the chip row scrolled at 390.

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
