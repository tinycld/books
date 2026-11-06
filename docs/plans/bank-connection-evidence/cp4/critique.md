# Gate 2 design critique — bank-connection, checkpoint 4 (Banking page and account strip)

Scope judged: the Delivers line only (loading and error states, the no-connection introduction, the header, the account strip, the selected account's panel heading, More menu or register link, file list; writers and readers). The upload area and the Remove button (checkpoint 6) and the dialogs (checkpoint 5) are not findings.

## State check

| shot | 390 light | 390 dark | 1280 light | 1280 dark |
|---|---|---|---|---|
| intro | valid: no connection, 3 steps, Connect account button | valid | valid (sidebar "Banking" entry present and active) | valid |
| intro-reader | valid: same band, no button, reader line | valid | valid | valid |
| populated | valid: 1000 selected, 1 file, More menu, phone file card | valid | valid: table Name/Format/Size/Uploaded/Status | valid |
| card | valid: 2100 selected, strip scrolled to it, empty-files line | valid | valid | valid |
| reader | valid: 1000 selected, "View register" link, no menu, no Connect, no FAB | valid | valid | valid |
| loading | valid: full-page LoadingState | valid | valid | valid |
| error | valid: "Books could not load your bank accounts." + Retry | valid | valid | valid |

0 INVALID.

## Findings

intro-390-light, intro-390-dark, intro-1280-light, intro-1280-dark: nothing found. (The sidebar "Banking" entry is a delivered addition the reference predates; not a finding.)

intro-reader-390-light, intro-reader-390-dark, intro-reader-1280-light, intro-reader-1280-dark: nothing found.

populated-390-light, populated-390-dark: nothing found. (Seed data has 1 file where the reference fixture has 4; the brief allows this.)

populated-1280-light, populated-1280-dark: nothing found. Structure, hierarchy and detail placement match the reference: strip above, panel heading with bank-details line and More menu, table with the same five columns.

card-390-light, card-390-dark: account strip, selected 2100 card, bank line — "Northwind Card Services ••0937" truncates to "Northwind Card Services ••0…" inside the 240-wide card, so the last-4 mask (the one detail that tells two accounts at the same bank apart) is the part that is cut. The panel heading below shows it in full, so nothing is lost from the page, but the card should keep the mask (truncate the bank name first, or wrap the line) — NOTE

card-1280-light, card-1280-dark: nothing found.

reader-390-light, reader-390-dark: nothing found. (The panel title wrapping to two lines beside "View register" matches the reference.)

reader-1280-light, reader-1280-dark: nothing found.

loading-390-light, loading-390-dark, loading-1280-light, loading-1280-dark: nothing found. Matches the spec ("the page shows `LoadingState` until access, settings and the connections query are ready") and the reference.

error-390-light, error-390-dark, error-1280-light, error-1280-dark: nothing found. Matches the spec text and the reference.

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE

## Re-capture after the gate-3 fix (populated, card, reader)

Scope: the same Delivers line. The fix changed the phone strip's card gap (12 px style) and its scroll position (from the card index). Judged: populated, card and reader at 390 and 1280, light and dark.

### State check

| shot | 390 light | 390 dark | 1280 light | 1280 dark |
|---|---|---|---|---|
| populated | valid: 1000 selected, strip at its start, 2100 card partly visible at the right, 1 file card, More menu | valid | valid: two cards in a row, table with the five columns, More menu | valid |
| card | valid: 2100 selected, strip scrolled so the selected card sits flush with the panel's right edge, 1000 card partly visible at the left, empty-files line | valid | valid | valid |
| reader | valid: 1000 selected, "View register" link, no More menu, no Connect, no FAB, 1 file card / table row | valid | valid | valid |

0 INVALID.

### Findings

populated-390-light, populated-390-dark: nothing found. The strip's cards are spaced evenly (the gap between the two cards reads the same as the page gutter) and the selected border is distinct in both schemes; the panel, the file card and the FAB clearance match the earlier capture and the reference.

populated-1280-light, populated-1280-dark: nothing found. Unchanged from the earlier capture; structure and hierarchy match the reference.

card-390-light, card-390-dark: nothing new. The scroll now lands the selected 2100 card flush with the right edge of the content column (its right edge lines up with the panel's), with the 1000 card cut at the left as a sideways strip should; the card gap matches populated's. The "••0…" mask cut is already recorded above and is not repeated.

card-1280-light, card-1280-dark: nothing found. Unchanged from the earlier capture.

reader-390-light, reader-390-dark: nothing found. Strip spacing is the same as populated's; the two-line panel title beside "View register" matches the reference.

reader-1280-light, reader-1280-dark: nothing found. Unchanged from the earlier capture.

### For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE (the 1 NOTE from the earlier capture, the 2100 card's mask cut at 390, stands and is not re-counted)
