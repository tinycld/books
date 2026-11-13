# cp4 gate-2 design critique — sales receipt form and read view

Scope: the checkpoint 4 Delivers line (new, draft, correction, copy forms with the Payment row and Deposit to; "No customer"; the "Tax exempt" hint; refusals under fields; the read view with payment line and actions; the PDF tab; loading / error / not-found / no-access / cannot-edit). Checkpoint 5 items (the default message fill, the hidden Deposit to) are not findings. Known gate-3 items (draft line 2 holds the message text; the errors shot shows only core's "Reference no. is too long") are not counted.

Built: /Users/nas/tmp/tinycld/books/books/docs/plans/sales-receipt-form-evidence/cp4/ (68 PNGs read). Reference: /Users/nas/tmp/tinycld/books/books/docs/plans/sales-receipt-form-reference/.

## State check

All 20 shots show the state their name says, in both widths and both schemes:

| shot | state shown | valid |
|---|---|---|
| new | "New sales receipt", empty form, Customer focused, Deposit to 1200 | yes |
| filled | copy form, Harborview, 7 line kinds, Check, 43567, $1,346.77 | yes |
| filled-phone | same at 390, cards | yes |
| no-customer | "No customer" picker and Bill to, Cash, 1000 Business Checking | yes |
| exempt | Northwind Traders, "Tax exempt" hint, tax $0.00 | yes |
| errors | Post refused, inline error under Reference no. (one error only; known) | yes |
| errors-phone | same at 390 | yes |
| draft | "Draft sales receipt" + Draft badge after Save draft (known line-2 defect) | yes |
| correction | "Edit 1001", replace note, Customer focused | yes |
| posted | "Sales receipt 1001" Posted, payment line, Posted by | yes |
| walk-in | "Sales receipt 1002", No customer, Cash to 1000 | yes |
| void | Void badge, Posted by + Voided by, Copy / View journal entry / Download PDF | yes |
| reader | posted read view, actions View journal entry + Download PDF only, no New button | yes |
| pdf-unsaved | "Save a draft to see the PDF" + Save draft | yes |
| pdf-stale | "Shows the last saved version" over the rendered PDF | yes |
| no-access | "You need bookkeeper access to create sales receipts" | yes |
| cannot-edit | "This sales receipt cannot be edited" | yes |
| not-found | "This sales receipt does not exist" | yes |
| loading | spinner | yes |
| error | "Books could not load this sales receipt." + Retry | yes |

INVALID: 0.

## Findings

### new (1280 light/dark, 390 light/dark)
- new-1280-*: Lines header, last column — "Tax" wraps to two lines ("Ta" / "x"); the column is too narrow for its own header — BLOCKING (reference decision: every reference form shot draws the "Tax" header on one line at 1280; a wrapped three-letter header is not legible). Same in filled, no-customer, exempt, errors, draft, correction at 1280. This is the shared line grid (checkpoint 3's `DocumentForm` lines), so the invoice likely shows it too; fix at the source, not per kind.
- new-1280-* and new-390-*: header band, between the Sale date / Tax row and the Payment divider — about 45 px of empty space above the `border-t` (Tax input bottom y≈495, divider y≈540 at 1280; y≈620–660 at 390), while the divider-to-label gap below is the expected 16 px. The reference band is tight. Looks like a row gap or an empty slot is added above the divider in addition to `mt-4` — NOTE. Same in every form shot.
- new-1280-*: Payment row — Reference no. draws its hint "Check or card reference" as a description above the input, so its input sits ~21 px lower than Payment method and Deposit to in the same row; the three cells no longer align. The reference uses the text as the placeholder and keeps the row aligned — NOTE. Same in every form shot (and the stacked phone cells carry the extra line).
- new-1280-* and new-390-*: band, "Email" label with nothing under it when there is no customer (no value, no input). The reference omits the Email block in the no-customer state. An orphan label reads as unfinished — NOTE. Same in no-customer-*.
- new-1280-*: totals panel — "Denver combined (8.71%)" wraps to two lines, so the tax amount sits between the two label lines; the reference and the read view keep it on one line. The label column is too narrow — NOTE. Same in every form shot at 1280.

### filled (1280 light/dark)
- Tax header wrap, band gap, Reference no. misalignment, totals label wrap: as new.
- filled-1280-*: line grid header "Price" where the spec text says "Rate" (§3.2 Tab order "Qty → Rate → Taxable"; §6 "Enter / return key in the last Rate adds a line"); the read view also says "Price". If the invoice grid says "Price" this is consistent with §3.4 "Identical to the invoice" and nothing to do; otherwise the shared header should follow the spec word — NOTE.

### filled-phone (390 light/dark)
- Band gap and Reference no. hint line as new-390. Otherwise nothing found: cards, per-card Tax toggle, totals and Amount received read well in both schemes.

### no-customer (1280, 390; light/dark)
- Tax header wrap, band gap, Reference no. misalignment, orphan "Email" label, totals label wrap: as new. The "No customer" picker value, muted "No customer" Bill to and "Edit address" link match §3.3.

### exempt (1280 light/dark)
- Tax header wrap, band gap, Reference no. misalignment, totals label wrap: as new. The muted "Tax exempt" hint under the picker, "Edit address  Edit customer" links, and $0.00 tax match §3.3.

### errors (1280 light/dark)
- Tax header wrap, band gap, Reference no. misalignment, totals label wrap: as new. The inline error sits under the red-bordered Reference no. input as §3.6 asks ("Reference no. refusals under those fields"). Text is the known gate-3 item.

### errors-phone (390 light/dark)
- Band gap and Reference no. hint line as new-390. Otherwise nothing found.

### draft (1280, 390; light/dark)
- Tax header wrap, band gap, Reference no. misalignment, totals label wrap: as new. Title "Draft sales receipt", Draft badge, stored Credit card / reference / 1200 as §3.3. The message-in-line-2 defect is the known gate-3 item.

### correction (1280 light/dark)
- Tax header wrap, band gap, Reference no. misalignment: as new. "Edit 1001", the replace note text, Customer focused, Deposit to editable with the original's account: as the brief's Titles and §3.3.

### posted (1280, 390; light/dark)
- nothing found. Header, two-column details band with the Payment line "Check · 43567 · deposited to 1200 Undeposited funds", read-only lines, totals with Total and Amount received, message, memo, Posted by stamp, and the five actions match §3.7 and the reference in both schemes; phone cards and More / Edit bar match.

### walk-in (1280, 390; light/dark)
- nothing found. "No customer", "Cash · deposited to 1000 Business Checking", no message block when the message is empty, memo and stamp as the reference.

### void (1280, 390; light/dark)
- nothing found. Void badge, Posted by and Voided by stamps, Copy / View journal entry / Download PDF (phone: More only). The built void is a plain void, so no "Replaced by" line; the reference's void was a correction. Not a finding.

### reader (1280, 390; light/dark)
- nothing found. View journal entry + Download PDF only; the sidebar has no New button for the reader (the reference, drawn with the writer's shell, shows one). Not a finding.

### pdf-unsaved (1280, 390; light/dark)
- nothing found.

### pdf-stale (1280, 390; light/dark)
- nothing found. The notice bar and the rendered PDF (Draft sales receipt, Payment line, Sold to, lines, Amount received, Notes) replace the reference's framed text page as the plan asks.

### no-access, cannot-edit, not-found (1280, 390; light/dark)
- nothing found. Plain notice under the back link, as the invoice's and the reference.

### loading (1280, 390; light/dark)
- nothing found.

### error (1280, 390; light/dark)
- nothing found. Centered message with Retry, as the reference.

## For gate 3
- Nothing new beyond the two known items (draft line-2 description holds the message text; the errors shot's "Reference no. is too long" text from core's maxLength rule instead of `referenceTooLong`).

## Totals
CRITIQUE: 0 INVALID, 1 BLOCKING, 5 NOTE
