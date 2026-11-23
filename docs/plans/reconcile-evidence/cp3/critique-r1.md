# Gate 2 critique, fix round 1: reconcile, checkpoint 3 (Transaction list and clearing)

Scope judged: the toolbar, the result line, the list (table and cards), the empty and no-match states, the read-only list. Not judged (checkpoint 4): the hint line, the header's action buttons, the phone Finish bar. The band is checkpoint 2.

Shots read: all 40 built shots of the new capture (10 names, 390 and 1280, light and dark). Reference shots read in this round: `work`, `refused`, `batch-done` at 1280 and 390 (light), `filtered-390-light`, `balanced-1280-light`. The other reference shots were not read again; the first critique compared them, and the built structure outside the toolbar spacing did not change.

Result: 0 INVALID, 0 BLOCKING, 0 new NOTE. The 4 NOTEs of the first critique (`critique.md`) are not changed by the fix and are not repeated here.

## State check

| Shot | 1280 light | 1280 dark | 390 light | 390 dark | Shows |
|---|---|---|---|---|---|
| work | valid | valid | valid | valid | Populated list, All tab, no filter, header box mixed, no result line. |
| filtered | valid | valid | valid | valid | Deposits tab, search "Reconcile seed", "Clear filters", one cleared row, no result line. |
| no-match | valid | valid | valid | valid | "No transactions match these filters." with the Button "Clear filters". |
| empty | valid | valid | valid | valid | "No transaction on 1010 Business Savings up to Sep 30, 2026 waits to be cleared." |
| read-only | valid | valid | valid | valid | No boxes, no header box, a check mark on the cleared row, filters present. |
| refused | valid | valid | valid | valid | Result line "Journal entry JE-29 is void." in danger color, the row not checked, the band not changed. |
| batch-busy | valid | valid | valid | valid | Spinner in place of the select-all box, rows dimmed, no result line. |
| batch-done | valid | valid | valid | valid | Result line "Cleared 1 transaction.", all boxes checked, header box checked. |
| card | valid | valid | valid | valid | Credit card words (Charges, Payments); no result line. |
| balanced | valid | valid | valid | valid | Rows on both sides, "Clear matched (2)", the matched icon; no result line. |

## Toolbar spacing (the subject of the fix)

Measured from the screenshots (approximate pixels, bottom edge of the search / Show controls to the next element).

| Case | Built | Reference |
|---|---|---|
| 1280, no result line: toolbar bottom to header-row text | 369 to 402 (33) | 525 to 558 (33) |
| 1280, result line: toolbar bottom to result text, result text to header-row text | 369 to 387 (18), 387 to 430 (43) | 525 to 543 (18), 543 to 586 (43) |
| 390, no result line: Show bottom to phone-bar text | 344 to 378 (34) | 440 to 474 (34) |
| 390, result line: Show bottom to result text, result text to phone-bar text | 344 to 362 (18), 362 to 406 (44) | 440 to 458 (18), 458 to 502 (44) |

- The space with no result line is the same in `work`, `filtered`, `read-only`, `batch-busy`, `card` and `balanced`, at both widths and in both schemes. The zero-height result line adds no visible gap.
- The space with a result line is the same in `refused` and `batch-done`, at both widths and in both schemes, and equals the reference.
- The result line adds 28 px; the list moves down by that amount and nothing else moves.
- `no-match` and `empty`: the toolbar position equals that of `work`; the message stays centered in the list area.

## Findings

### work (4 shots)
Nothing found.

### filtered (4 shots)
Nothing found.

### no-match (4 shots)
Nothing found.

### empty (4 shots)
Nothing found.

### read-only (4 shots)
Nothing found.

### refused (4 shots)
Nothing found. The danger text is legible in light and dark.

### batch-busy (4 shots)
Nothing new. The two NOTEs of the first critique (dark spinner contrast; the phone bar label goes away while the batch runs) are unchanged.

### batch-done (4 shots)
Nothing found. The muted result text is legible in light and dark.

### card (4 shots)
Nothing new. The NOTE of the first critique (the gap before "·" on card line one) is unchanged.

### balanced (4 shots)
Nothing new. The NOTE of the first critique ("Journal entry JE…" cut beside the matched icon) is unchanged. At 390, "Clear matched (2)" is on the Show line and the space to the phone bar equals that of `work`.

## Coverage (not findings)

The three coverage gaps of the first critique are unchanged: no cleared row in `work`, no "Clear matched" disabled while a batch runs, no "Clear filters" with "Clear matched" together at 390 (the reference `filtered-390` puts "Clear matched" on a third toolbar line; no built shot shows that wrap with the new inner gap).

## For gate 3

Nothing visible.
