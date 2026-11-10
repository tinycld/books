# Gate 2 critique — balance-sheet checkpoint 2 (Opened account lines, live re-runs)

Delivers judged: pressing an account row opens its posted lines beneath it, labelled "<date> · <entry number> · <memo>", in date order then entry sequence, Current and Prior year per line, Change and % change blank. (Live re-run is behavior, not visible in a still.)

## State check

- `opened-1280-light.png` — VALID. Shows the Balance Sheet at 1280 with 1000 Business Checking opened (down chevron) and 17 posted lines beneath it; the other accounts closed.
- `opened-1280-dark.png` — VALID. Same state in dark.

## Findings

### opened-1280-light.png
nothing found.

What was checked against the spec and the reference:
- Labels read "<date> · <entry number> · <memo>" (e.g. "2026-01-01 · JE-8 · Register fiscal year start"), as §3 "Press an account row" and §5 `detail.label` decide.
- Lines are in date order (2026-01-01, 01-02, 01-05, 09-15, 09-16, 11-01, 11-09 …), then by entry within one day.
- Current shows each line's amount by the normal side (debits positive, credits negative on a bank account); Prior year shows 0.00 on every line dated after Nov 9, 2025; Change and % change cells are empty on every opened line (N5, `detail: "blank"`). The account row keeps its Change (23,861.00) and a blank % change (Prior year 0.00), as §3 column 5 decides.
- Opened lines sit one indent level under the account row, in regular weight under the bold account label, with the same row height as the reference; a long memo truncates with an ellipsis before the figure columns, as in the reference.
- The opened account shows a down chevron; closed accounts a right chevron; computed rows are not in view here (cut off below Total Assets), so their non-opening cannot be judged from this shot.

### opened-1280-dark.png
nothing found. Detail labels, figures and the blank Change / % change cells are as in light; the regular-weight detail text and the bold account rows stay distinguishable on the dark surface.

## Outside this checkpoint (not counted)

- Both built shots have no Books package sidebar (the reference, drawn from the Books scratch route, shows Banking / Lists / Reports / Accounting). The real route is core's `/a/reports/<id>` (spec §2, "Books adds no screen and no route"), so this is the route, not this checkpoint's delivery; it was the same in checkpoint 1.
- Column headers carry core's sort glyphs (↑↓) that the reference does not draw. Core's table component; not part of the opened-lines delivery.

## For gate 3

- Three opened lines on 2026-11-09 all read "JE-10" with different memos ("Register corrected" 450.00, "Register void original" 400.00, "Void of JE-10" -400.00). Confirm the label reads each line's own entry number (the void entry and the corrected entry should carry their own numbers unless the seed reuses JE-10 on purpose). Appearance is correct either way; this is a data/behavior check.
