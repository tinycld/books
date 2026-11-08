# Gate 2 critique (fix round 2) — bank-import-mapping, checkpoint 2 (CSV column mapping step)

Scope: the "Your file" sample table only, after the fix that sizes the scroll content to the box width (minimum 56 + n × 120). Shots: map, map-one, map-errors, map-preview-errors at 390 and 1280, light and dark (16). Everything outside the table was settled in earlier rounds and is not judged here.

Data note: the built pages show the seeded 3-column file (Date, Description, Amount, YYYY-MM-DD); the reference shows a 5-column file, except reference map-one-1280 (a 3-column card file). Structure was compared, not data.

## State check

- map-1280-light / -dark / map-390-light / -dark — VALID: Map step, guessed intro, every select filled, preview with 3 rows.
- map-one-1280-light / -dark / map-one-390-light / -dark — VALID: remembered intro, sign "Money out", negated preview.
- map-errors-1280-light / -dark / map-errors-390-light / -dark — VALID: "Two columns" chosen, Money in / Money out unchosen with field errors, preview prompt, summary after Continue.
- map-preview-errors-1280-light / -dark / map-preview-errors-390-light / -dark — VALID: DD/MM/YYYY chosen, three `Line n: "…" is not a date in the DD/MM/YYYY format.` rows in text-danger.

No INVALID shot.

## Findings

### map, map-one, map-errors, map-preview-errors at 1280 (light and dark; the table is identical in all eight)
- "Your file" table, right edge — the fix has no visible effect: the table measures the same as in the previous round. Header starts: LINE 785, COLUMN 1 842, COLUMN 2 1015, COLUMN 3 1187; box 777–1255 (478 outer). The column pitch is still ~173 (content 56 + 3 × 173 ≈ 575 in a 478 box), so COLUMN 3 is cut to ~76 px: its header text ends 3 px from the border, "-1200.00" ends 9 px from it, and the right cell padding the other columns have is missing. With the fix as described (content = box width when 56 + n × 120 fits) each file column would be (476 − 56) / 3 ≈ 140 wide, COLUMN 2 would start at ~982 and COLUMN 3 at ~1122, and the whole table would sit inside the border with no sideways scroll. Either the capture predates the fix or the width rule does not reach the columns (the row still lays out wider than its container, e.g. `flex-1` cells whose row is not bound to the content width, or `minWidth: '100%'` resolving against a wider ancestor). — BLOCKING (unchanged from round 1: reference map-one-1280, a 3-column file: all three columns drawn whole inside the box with room to spare; spec §Map columns: "columns at least 120 wide; the table scrolls sideways when it is wider than the screen" — a 3-column table of 416 px is not wider than a 478 box, so nothing may be cut; the fix's own rule: "columns share the box when they fit").

### map, map-one, map-errors, map-preview-errors at 390 (light and dark)
- "Your file" table — the same ~174 pitch (COLUMN 1 at 81, COLUMN 2 at 255, box 17–373 = 356): only COLUMN 1 and a cut COLUMN 2 show before scrolling, where the reference map-390 at the 120 minimum shows COLUMN 1, COLUMN 2 and the start of COLUMN 3. A 3-column table must scroll in a 356 box either way (416 > 356), so the state is right; the person just sees fewer columns than the reference decided. Same root cause as the item above; it is fixed by the same change. — NOTE

Everything else in the table is as before and clean: "LINE" column muted and tabular, header cells uppercase muted, the first row bold under header Yes, one-line cells with ellipsis, row rules legible in light and dark, no striping or tone out of place.

## For gate 3
None observed.

## Tally
INVALID 0 · BLOCKING 1 · NOTE 1
