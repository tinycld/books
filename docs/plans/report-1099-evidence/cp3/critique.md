# Design critique: report-1099, checkpoint 3 (Opened boxes, payments, refresh)

Scope: the Delivers line ("A reader opens a box into its payments, sees which were paid by card, opens a payment's document, gets every payment and the threshold line in the exports, and sees new posts after Refresh"). Phone arrangement at 390/375, entry points and help are checkpoint 5 and are not judged.

Pairs (D8): built 1280 vs reference 1540; built 1024 vs reference 1284; built 768 vs reference 1028.

## State check

All six built screenshots show the state "opened": Period = This calendar year, Show = All 1099 vendors, vendors open, the box "NEC 1 · Nonemployee compensation" of Jamal Okafor open with two payment rows (the journal entry line and the card expense that ends with " · paid by card"), the other boxes closed, the manual band with Refresh, the header line "1099 threshold: $2,000.00".

- opened-1280-light.png: VALID
- opened-1280-dark.png: VALID
- opened-1024-light.png: VALID
- opened-1024-dark.png: VALID
- opened-768-light.png: VALID
- opened-768-dark.png: VALID

## Findings

### opened-1280-light.png
Nothing found. Structure agrees with the reference: vendor row (semibold), box row (indented, semibold), payment rows (indented more, regular weight), figures right-aligned in three columns, Excluded blank when zero on payment, box and vendor rows, Reportable 0.00 on the card row, muted inactive vendor, heavy rule above Total. The long vendor label wraps to two lines and the figures are not cut. No sideways scroll.

### opened-1280-dark.png
Nothing found. Same layout as light; muted vendor row and the payment rows stay legible.

### opened-1024-light.png
Nothing found. Payment labels wrap to two lines and the vendor label to three (the spec permits three); figures stay on one line and are not cut. Same arrangement as reference 1284. No sideways scroll.

### opened-1024-dark.png
Nothing found.

### opened-768-light.png
- opened-768-light.png: toolbar, report title — the title reads "1099 Summ…" (the reference at this row width reads "1099 Summary and D…"; the built toolbar has the Export button, which the scratch route did not draw). The full title is in the document header below. — NOTE

The `mobile` arrangement agrees with reference 1028: label on line 1, the three figures on line 2, headings in two lines. The filter row is cut at "Order: Name" as in the reference (core's filter row). No sideways scroll of the table.

### opened-768-dark.png
- opened-768-dark.png: toolbar, report title — same truncation "1099 Summ…" as the light shot. — NOTE

## Totals

0 INVALID, 0 BLOCKING, 2 NOTE

## For gate 3

- All shots: the card payment row reads "2026-09-23 · Expense 1004 · 6210 Software Subscriptions:Design Tools · paid by card". It has no description part. The spec label is "<date> · <type> <number> · <account> · <description>" then " · paid by card", and plan D5 gives the seeded expense the description "Seed 1099: design software by card". Check if the label drops the description of an expense line, or if the seed does not write it where `expenseDetailLabel()` reads it.
