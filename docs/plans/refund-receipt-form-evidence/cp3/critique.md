# Design critique: refund-receipt-form, checkpoint 3 (Refund receipt form and read view)

Result: 0 INVALID, 0 BLOCKING, 5 NOTE.

Read: all 80 built shots (40 names x light/dark). References read: the light shot of each name at 1280, and the 390 light shot for new, draft-phone, correction, posted-phone, phone-more, void. Dark references and the other 390 references were not opened; the built dark shots were judged on their own.

## State check

All 80 shots show the state of their name. None is INVALID.

| Shot | Widths | Shows |
|---|---|---|
| new | 390, 1280 | New form, Customer focused, Refund from default 1000 Business Checking with Balance line |
| walk-in | 1280 | Posted read view, "No customer", Payment "Cash · refunded from 1000 Business Checking" |
| exempt | 1280 | Posted read view, Northwind Traders, tax line $0.00 |
| draft | 1280 | Draft form with stored values, long customer and reference |
| draft-phone | 390 | Draft form, stacked band, line cards |
| correction | 390, 1280 | "Edit 1001" with the replace note, all line kinds |
| errors | 390, 1280 | Refund from refusal under the field, with the Balance line (per carry: one refusal only) |
| no-refund-from | 390, 1280 | Empty Refund from with the inline empty-chart error |
| pdf-unsaved | 390, 1280 | "Save a draft to see the PDF" + Save draft |
| pdf-stale | 390, 1280 | "Shows the last saved version" + the server page |
| posted | 1280 | Posted read view, no source link row (checkpoint 4) |
| posted-phone | 390 | Posted read view, line cards |
| phone-more | 390 | More sheet over the posted read view |
| void | 390, 1280 | Void badge, "Voided by …", actions Copy / View journal entry / Download PDF |
| reader | 1280 | Posted read view, actions View journal entry / Download PDF only |
| no-access | 390, 1280 | "You need bookkeeper access to create refund receipts" |
| cannot-edit | 390, 1280 | "This refund receipt cannot be edited" |
| not-found | 390, 1280 | "This refund receipt does not exist" |
| loading | 390, 1280 | Spinner |
| error | 390, 1280 | "Books could not load this refund receipt." + Retry |
| pdf-posted | 390, 1280 | PDF tab with the server page of refund receipt 1001 |
| void-dialog | 390, 1280 | VoidDialog (dialog at 1280, sheet at 390) |
| customer-inactive | 390, 1280 | Customer refusal under Customer |
| line-refusal | 390, 1280 | "Line 1: …" refusal under line 1 |

## Findings per screenshot

Light and dark of a shot have the same findings unless a scheme is named. Dark shots: text, borders, error red, badges and the focus ring are legible in each one.

- new-390, new-1280: band, Email — the label "Email" has nothing below it while no customer is picked; it reads as an unfinished field — NOTE (the reference has the same)
- new-1280 (also draft-1280, correction-1280, errors-1280, no-refund-from-1280, customer-inactive-1280, line-refusal-1280): band, between the Refund date / Tax row and the rule above Payment — the blank space is about twice the other row gaps — NOTE (the reference has the same)
- walk-in-1280: nothing found
- exempt-1280: nothing found
- draft-1280: lines table, line 1 Description — the cell cuts its fourth text line in half ("be printed again by the…") — NOTE (shared lines table; the reference has the same)
- draft-phone-390: line card 1, Description — the same half-cut fourth line — NOTE (same finding as draft-1280, counted once)
- correction-1280, correction-390: lines, last Item line Description — the same half-cut line (same finding as draft-1280, counted once). No other finding.
- errors-390, errors-1280: nothing found. The refusal and the Balance line show together under Refund from, as the plan decision "Refund from shows the Balance line and the field error together" says.
- no-refund-from-390, no-refund-from-1280: nothing found (Email remark as new-*)
- pdf-unsaved-390, pdf-unsaved-1280: nothing found
- pdf-stale-390, pdf-stale-1280: nothing found. Dark: the white page on the dark frame is correct for a PDF.
- posted-1280: nothing found. Network visit line shows 1 x $420.00 and "as one flat amount", as the fixture.
- posted-phone-390: nothing found
- phone-more-390: More sheet, key hints — "v", "c", "j" are lower-case letters beside "⌘P"; the mix looks unplanned — NOTE (the reference has the same letters)
- void-390, void-1280: nothing found
- reader-1280: nothing found
- no-access-390, no-access-1280: nothing found
- cannot-edit-390, cannot-edit-1280: nothing found
- not-found-390, not-found-1280: nothing found
- loading-390, loading-1280: nothing found. Remark: the reference loading-1280-light is a "Something went wrong" crash screen, not a loading state; the build was judged on its own.
- error-390, error-1280: nothing found
- pdf-posted-390, pdf-posted-1280: nothing found
- void-dialog-390, void-dialog-1280: nothing found
- customer-inactive-390, customer-inactive-1280: nothing found
- line-refusal-1280: lines table, line 1 — the refusal wraps to two lines inside the Product column and makes the row taller than its neighbours' controls; legible — NOTE
- line-refusal-390: nothing found

No table or grid scrolls sideways at 390 or 1280: the lines draw as cards at 390 and as flex columns at 1280.

## Carry items (not findings)

- Hint under Message to customer reads "Shown on the refund receipt and its PDF." in every built form shot. Correct.
- Back link "Journal entries", column header "Price": present in the build, not reported.
- Built posted-*, posted-phone-*, void-* have no source link row. Correct for this checkpoint.

## For gate 3

- errors-*, customer-inactive-*, line-refusal-*: after a refused Post from `/a/books/refund-receipts/new`, the title reads "Draft refund receipt", not "New refund receipt" (the reference errors-* keeps "New refund receipt"). Check which write the capture refused and whether a draft row exists at that point; if the first write was refused, the title is wrong.
- pdf-posted-*: the PDF page prints "Refund of sales receipt 1001" for the seeded refund; the plan's seed pick names sales receipt 1004. Check the seed link.
