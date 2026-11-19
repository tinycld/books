# Gate 2 critique: ar-aging, checkpoint 2 (after core checkpoint 0 and fix round 1)

CRITIQUE: 2 INVALID, 0 BLOCKING, 2 NOTE

Scope: the Delivers line of checkpoint 2. Names and figures are not compared (D3). Core-owned chrome (sort icons in the column heads, the Export button, no Books sidebar) is not a finding (D2, D4). All 20 built shots and their 20 reference shots were read.

## State check

| Shot | State shown | Result |
|---|---|---|
| populated-1280 (light, dark) | As of Today, families open, customers closed | valid |
| populated-1024 (light, dark) | same, 1024 | valid |
| opened-1280 (light, dark) | "Cedar & Pine Landscaping" and "Harborview Kitchen" opened into items | valid |
| opened-1024 (light, dark) | same, 1024 | valid |
| item-opened-1280 (light, dark) | Invoice 1013 under the gala customer opened into 2 lines (invoice, payment) | valid |
| item-opened-1024 (light, dark) | same, 1024 | valid |
| by-balance-1280 (light, dark) | chip "Order: Largest balance", rows by Total, No customer last | valid |
| filtered-1280 (light, dark) | Customer chip and header line "Customer: Aspen Ridge Dental, All Harborview Hospitality Group sub-customers" | valid |
| past-day-1280 (light, dark) | "As of October 15, 2026" | valid |
| empty-1024-light | **INVALID.** A run in progress: "Updating…" at the top right, Export disabled, the chip reads "As of: End of last fiscal year" while the header and the empty text still read January 1, 2020. It is not the settled empty state of As of 2020-01-01. | INVALID |
| empty-1024-dark | **INVALID.** Not empty: chip "As of: End of last fiscal year", header "As of December 31, 2025", a table with the row "No customer" (3,000.00 in 91 and over), the Total row and "End of report". | INVALID |

Probable cause of the two INVALID shots (for the capture fix, not checked in code): the As of param changed to "End of last fiscal year" before the shot. That is the label of core's empty-state action button ("Show end of last fiscal year" in the reference empty-1280), so the capture possibly pressed it, or the shot was taken after it. The light shot caught the run that followed; the dark shot caught its result. Capture again with As of 2020-01-01 settled (chip "As of: Jan 1, 2020", no "Updating…").

## Do 8 d check: every Due date whole

- opened-1280 (light, dark): "Oct 2, 2026" and "Oct 27, 2026" are whole.
- opened-1024 (light, dark): "Oct 2, 2026" and "Oct 27, 2026" are whole.
- item-opened-1280 (light, dark): "Oct 22, 2026" is whole.
- item-opened-1024 (light, dark): "Oct 22, 2026" is whole.

The earlier BLOCKING finding ("Oct 27, 20…") is gone.

## Findings

### populated-1280-light, populated-1280-dark
nothing found

### populated-1024-light, populated-1024-dark
- populated-1024: rows with a two-line customer name (the two St. Jude customer rows, "Total St. Jude …") — the two lines fill the row height, so these rows look tighter than the one-line rows around them. The reference populated-1280 shows the same. — NOTE

### opened-1280-light, opened-1280-dark
nothing found

### opened-1024-light, opened-1024-dark
nothing found (the same two-line rows as populated-1024; counted with the NOTE above)

### item-opened-1280-light, item-opened-1280-dark
nothing found

### item-opened-1024-light, item-opened-1024-dark
- item-opened-1024: the two line rows under "Invoice 1013" — "2026-10-22 · Invoice 1013" wraps to two lines and "2026-11-05 · Payment 1003" to three ("2026-11-05 ·" / "Payment" / "1003"), with the number alone on the last line. The three lines fill the row and nearly touch the row above and the rule below. The reference item-opened-1280 wraps these labels to two lines; the built label is longer (a four-digit number). It stays inside the spec ("the Customer column wraps to at most three lines"), and it is legible in light and dark. — NOTE

### by-balance-1280-light, by-balance-1280-dark
nothing found

### filtered-1280-light, filtered-1280-dark
nothing found

### past-day-1280-light, past-day-1280-dark
nothing found ("Expand all" in place of "Collapse all" is correct: no family is open on that day)

### empty-1024-light, empty-1024-dark
INVALID, not critiqued (the capture's last click landed on the empty action "Show end of last fiscal year").

Captured again with a click on the period text, and judged by a fresh critic: VALID, nothing found. The chip reads "Jan 1, 2020", the header "As of January 1, 2020", the body "No rows as of January 1, 2020" with its action, and no table row; legible in light and dark. CRITIQUE (empty, second capture): 0 INVALID, 0 BLOCKING, 0 NOTE.

## Checked against the reference decisions (all kept, on the valid shots)
- Plain row at depth 0 for a customer with no sub-customers; header, indented customers and "Total <parent>" for a family.
- Eight columns on one line at 1280 and 1024; no sideways scroll; all columns inside the view.
- Blank age cells, also on the Total row; Total always has a figure.
- Muted "Old Mill Bakery (inactive)" in light and dark; legible in both.
- Due date only on item rows; item rows bold, line rows regular weight, "<ISO day> · <type> <number>".
- Heavy rule above the Total row; "End of report".
- Not confirmed: the empty text with the day in words and no rows (both empty shots are INVALID).

## For gate 3
- empty-1024: the chip reads "As of: End of last fiscal year" after a capture that sets As of 2020-01-01. If the capture did not press the empty-state action, the param changed with no user action; check which one it is. (Runner: the capture pressed it — its last action clicked the centre of `report-empty`, which is the action button; the second capture does not, and the chip keeps 2020-01-01.)
