# Design critique — sales-tax-liability, checkpoint 5 (document rows open their document)

Shots: `populated-*`, `rate-open-*`, `collapsed-*` (scratch route, fixture) and `report-rate-open-*` (shipped report, October, "Colorado state" open), each at 390 and 1280, light and dark. Reference: the shots of the same names; `report-rate-open-*` is compared with `rate-open-*`. Figures of the shipped report differ from the reference by design (D7); the arrangement is judged. Notes already in the ledger and in `cp3/critique-recapture.md` (subtotal figure offset and pitch at 390, the cut "Scientific and Cultural Facilities District…" name, two heights of agency total rows) are still visible and are not repeated.

## State check

- populated-1280-light / -dark: VALID. Agencies open, rates closed, agency totals and Total show the tax alone.
- populated-390-light / -dark: VALID. Same state; the shot ends at "Colorado state" (viewport height, as the reference).
- rate-open-1280-light / -dark: VALID. "Colorado state" is open: three document rows, then "Total Colorado state".
- rate-open-390-light / -dark: VALID. "Colorado state" is open; the third document row is cut by the tab bar (viewport height, as the reference).
- collapsed-1280-light / -dark: VALID. Three closed agency rows with the tax, then Total.
- collapsed-390-light / -dark: VALID. Same.
- report-rate-open-1280-light / -dark: VALID. Shipped report, "Colorado state" open: six document rows, "Total Colorado state", the full report to "End of report".
- report-rate-open-390-light / -dark: VALID. Same, full length.

## Findings

### populated-1280-light / -dark, populated-390-light / -dark

Nothing found. No document row is in this state; the shots are the same as the reference.

### collapsed-1280-light / -dark, collapsed-390-light / -dark

Nothing found. No document row is in this state; the shots are the same as the reference.

### rate-open-1280-light / -dark

- rate-open-1280-*: document rows under "Colorado state" — the rows are drawn the same as in the reference (plain text, foreground colour, no underline, no icon); nothing at rest shows that a row opens a document. Spec §7 gives the link look as "hover underline, ⌘-click new tab", so the resting look agrees with the spec, but these shots cannot show the link look that the Delivers line names ("re-captured with document rows drawn as links"): no shot has a row in the hover state — NOTE

### rate-open-390-light / -dark

- rate-open-390-*: document rows under "Colorado state" — same as above; on a phone there is no hover, so a document row has no sign at all that a press opens the document (the rate rows above it have a chevron, the document rows have none) — NOTE

### report-rate-open-1280-light / -dark

Checked: order (date, then number), indents (agency, rate, document, "Total Colorado state" at the rate's indent), blank sales cells on the agency totals and Total, the sales receipt row that ends after its number, the full "Scientific and Cultural Facilities District, seven-county Denver metro area" name on one line, legibility in dark. The arrangement agrees with `rate-open-1280-*`.

- report-rate-open-1280-*: document rows — plain at rest, no hover shot (same as the rate-open-1280 finding; one cause) — NOTE (counted above, not again)

Nothing else found.

### report-rate-open-390-light / -dark

Checked: each document row has the label on line 1 and the figures on lines 2 and 3; no figure is cut; long customer names end in an ellipsis; "Total Colorado state" is under a rule; the rows below, the agency totals, Total and "End of report" are in the shot; dark is legible. The arrangement agrees with `rate-open-390-*`.

- report-rate-open-390-*: filter bar, right edge — a third chip is cut at the screen edge after "Add filter" with no fade or other sign that the bar scrolls (core's bar; the scratch-route shots have two chips and do not show it) — NOTE

## Summary

0 INVALID, 0 BLOCKING, 3 NOTE.

## For gate 3

- No shot proves the link behaviour or the hover underline of a document row. Gate 3 must confirm on the shipped report that a document row shows the underline on hover (web), opens the read view on press, and that rate, agency and total rows do not.
