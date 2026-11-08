# Gate 2 critique (fix round) — bank-import-mapping, checkpoint 2 (CSV column mapping step)

Scope: the fix that changed appearance (the "Your file" sample table's columns: at least 120 wide, growing to fill the table) and the new `choose-errors` shots. Items the first critique settled are not repeated: the map-preview-errors-390 FAB overlap (rebutted: `useFabClearanceStyle` padding; fixed-height capture), the empty state's primary "Back to Banking", the choose evidence gap (now closed by `choose-errors`).

Data note: the built pages show the seeded 3-column file (Date, Description, Amount, YYYY-MM-DD); the reference shows a 5-column file, except reference map-one-1280 which shows a 3-column card file. Structure was compared, not data.

## State check

- map-1280-light / -dark / map-390-light / -dark — VALID: Map step, guessed intro, every select filled, preview with 3 rows.
- map-one-1280-light / -dark / map-one-390-light / -dark — VALID: remembered intro, sign "Money out", negated preview.
- map-errors-1280-light / -dark / map-errors-390-light / -dark — VALID: "Two columns" chosen, Money in / Money out unchosen with field errors, preview prompt, summary after Continue.
- map-preview-errors-1280-light / -dark / map-preview-errors-390-light / -dark — VALID: DD/MM/YYYY chosen, three `Line n: "…" is not a date in the DD/MM/YYYY format.` rows in text-danger.
- choose-errors-1280-light / -dark / choose-errors-390-light / -dark — VALID: Choose step with every row in error, the band "6 rows have errors and cannot be imported. Change the mapping to read them, or import the other rows." with "Change mapping", "0 selected · Money in $0.00 · Money out $0.00", disabled boxes, raw date and amount cells, Back + "Import".

No INVALID shot.

## Findings

### map, map-one, map-errors, map-preview-errors at 1280 (light and dark; the table is identical in all eight)
- "Your file" table, right edge — the columns do not fill the 480 box: they overflow it. Measured from the header starts: LINE 785, COLUMN 1 842, COLUMN 2 1015, COLUMN 3 1187; box right border 1255. Each file column is ~173 wide, so the content is 56 + 3 × 173 ≈ 575 against a 478 box: COLUMN 3 is clipped to 68 px, its header text ends 2 px from the border with no right gutter, and the table scrolls sideways although three 120-wide columns (416 with the Line column) fit the box. Before the fix the strip was empty; now the last column is cut. — BLOCKING (reference map-one-1280, a 3-column file: all three columns drawn whole inside the box, nothing clipped; spec §Map columns: "columns at least 120 wide; the table scrolls sideways when it is wider than the screen" — a 3-column table is not wider than the box, so it must not scroll or clip; the fix's own intent: "grow to fill the table"). Expected: with 3 columns each is (478 − 56) / 3 ≈ 141 wide and COLUMN 3 ends inside the border with the same inner padding as the other columns.

### map, map-one, map-errors, map-preview-errors at 390
nothing found. The same ~174 pitch is measured on phone (COLUMN 1 at 81, COLUMN 2 at 255), but a 3-column table must scroll in a 356 box anyway, so the phone shots look as the reference does (column 2 cut at the edge). The root cause is the one above.

### choose-errors (all four)
nothing found. Wide: band (amber tint, text left, "Change mapping" outline right), summary "6 transactions · 6 with errors", selection line, list with error text in text-danger in the description cell and the raw date / amount cells, Back (outline) + "Import", as reference choose-1280. Dark: band border and text legible; "Change mapping" draws as the reference's dark outline button. Phone: band wraps to three lines with the button beneath, "Select all" bar, two-line error rows with the amount right, Back + Import clear of the FAB, as reference choose-390. The empty area below the six rows inside the fixed-height list box is checkpoint 1's list, not judged here.

## For gate 3
None observed.

## Tally
INVALID 0 · BLOCKING 1 · NOTE 0
