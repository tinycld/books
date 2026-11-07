# Gate 2 critique — bank-import-mapping, checkpoint 2 (CSV column mapping step)

Delivers judged: the Map columns step (sample table, three questions, column selects pre-filled from the last import or the guesses, live first-rows preview, Continue) and the CSV paths of the Choose step (Back, the band's "Change mapping", the empty-file state). Focus, keys, help icon and statement line are checkpoint 3 and are not judged. Back-link arrow style, header, steps row and the Choose list box are checkpoint 1.

Data note: the built pages show the seeded 3-column file (Date, Description, Amount, YYYY-MM-DD); the reference shows a 5-column file. Structure was compared, not data.

## State check

- map-1280-light / map-1280-dark / map-390-light / map-390-dark — VALID: Map step, guessed intro, every select filled, preview with 3 rows.
- map-one-1280-light / -dark / map-one-390-light / -dark — VALID: remembered intro ("Books used the columns of your last import to 1000 Business Checking…"), sign "Money out", preview amounts negated.
- map-errors-1280-light / -dark / map-errors-390-light / -dark — VALID: "Two columns" chosen, Money in and Money out unchosen with field errors, preview prompt, FormErrorSummary after Continue.
- map-preview-errors-1280-light / -dark / map-preview-errors-390-light / -dark — VALID: DD/MM/YYYY chosen, three `Line n: "…" is not a date in the DD/MM/YYYY format.` rows in text-danger.
- choose-1280-light / -dark / choose-390-light / -dark — VALID: Choose step reached from Continue, Back (outline) in place of Cancel. The seeded file has no error row, so the band and "Change mapping" are not shown (see NOTE below).
- empty-1280-light / -dark / empty-390-light / -dark — VALID: "This file has no transactions." with "Back to Banking" and "Change mapping".

No INVALID shot.

## Findings

### map (all four)
nothing found. Wide: questions column left, 480-wide sample table right, as the reference. Phone: sample table above the questions, scrolls sideways (column 3 clipped at the edge, as the reference). Header row bold under "Yes". Selects, section headings, preview card and the Cancel / Continue pair match the reference's structure. Light and dark both legible.

### map-one (all four)
nothing found. The remembered intro wraps to one line on wide and three on phone; the remembered sign shows in the select and in the negated preview.

### map-errors (all four)
nothing found. Field errors draw under their selects (red border + message), the preview prompt replaces the rows in text-muted-foreground, the summary band spans the page width as in the reference. Dark summary tint legible.

### map-preview-errors
- map-preview-errors-390-light, map-preview-errors-390-dark: bottom-right — the "+" FAB covers the "Continue" button (only "Co" reads). The three wrapped error rows push the button pair into the FAB's zone; in the reference the pair clears it. — BLOCKING (brief, "Helpers each screen uses": "FAB clearance `useFabClearanceStyle` (`lib/fab-clearance.ts`)"). Caveat for the gate: a capture at scroll top cannot prove the padding is absent (a scrollable overflow of a few px looks the same), and the reference's own choose-390 shows the same overlap. Verify that the import `ScrollView` applies `useFabClearanceStyle` and that the clearance is at least the FAB's height plus its bottom offset; if it is, treat this as a capture artifact and downgrade.
- map-preview-errors-1280-light / -dark: nothing found. Error rows wrap to two lines inside the preview card; readable in both themes.

### choose (all four)
- choose-1280/390: list area — no built shot shows the error band with "Change mapping" (a Delivers item: "the band's 'Change mapping'"); the seeded file has no error row, so the band could not appear. The band is evidenced only in the reference. — NOTE (evidence gap, not a defect seen; a shot driven by DD/MM/YYYY → Continue would show it with the seeded file).
- Otherwise nothing found: Back (outline) + "Import 6 transactions", phone "Select all" bar and phone rows as the reference.

### empty (all four)
nothing found. "Change mapping" (outline) beside "Back to Banking", centered in the card on wide and on phone. "Back to Banking" is primary where the reference drew both outline; it keeps the state's main action first and matches the other states' "Back to Banking", so not a loss.

## For gate 3
None observed.

## Tally
INVALID 0 · BLOCKING 1 · NOTE 1
