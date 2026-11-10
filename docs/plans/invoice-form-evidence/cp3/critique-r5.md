# Gate 2 design critique — invoice-form, checkpoint 3 (round 5: after the lines grid's numeric columns got px floors, Product and Description take the free width, and the totals footer follows the grid's slots)

Delivers: `books/invoices/new` and a draft at `books/invoices/[id]`: the header band with every built-in and its fills, the four-kind line table on core `TableField`, live totals and Balance due, Save draft / Cancel / Delete draft with keys, every load state, the + New → Invoice entry, the customer form's Terms built-in, and focus on Customer at open (web).

Judged: `new-1280`, `filled-1280` (light and dark), `filled-911`, `filled-phone-390`, `new-390`, `errors-1280`, `exempt-1280`, `no-tax-1280`, `edit-address-1280`, `errors-phone-390` (light) in `cp3/`, against the reference shots of the same names (none for 911). Not judged: tabs (cp6), Post / Post & new (cp5), other line kinds and bundles (cp4), read view and PDF (cp5/6). Findings the ledger already settled (Design notes cp 3, r0–r4 NOTEs) are listed as persisting and not recounted.

## State check

| shot | scheme | state shown | valid |
|---|---|---|---|
| new-1280 | light | empty new form, Draft badge, one empty Item line, totals $0.00 | yes |
| filled-1280 | light, dark | saved draft ("Draft invoice", Draft badge, More), Harborview, 3 Item lines, totals $525.07 | yes |
| filled-911 | light | the same draft at a 911 px viewport with the sidebar expanded (≈313 px): the form is ≈563 px wide and the table draws phone cards, not the 640 px wide grid | **INVALID** — the shot was to show the narrowest wide grid (the 640 px lines container, as r4's `cp3-fix4-911` did with the sidebar collapsed); it shows the card layout instead, so the fix's 640 px condition (item 23a: Qty "1000" and Rate "1890.00" unclipped, the Amount figure ending before the Tax slot, the Tax switch inside its slot) is not verified by this round's shots |
| filled-phone-390 | light | the draft as three cards, totals under Memo, More in the bar | yes |
| new-390 | light | empty new form stacked, one card | yes |
| errors-1280 | light | Customer is required, due-date error, "No rows yet.", Lines is required | yes |
| exempt-1280 | light | Northwind Traders, Denver combined with $0.00 tax, line Tax toggle off, Balance due $189.00 | yes |
| no-tax-1280 | light | Harborview, Tax None, no tax row, total = subtotal $189.00 | yes |
| edit-address-1280 | light | Harborview, address inputs and Email input in the band, Edit customer only | yes |
| errors-phone-390 | light | the errors form at 390 | yes |

1 INVALID.

## Fix verification (round-4 BLOCKING: the 1280 grid)

- **Resolved at 1280.** In `filled-1280` (light and dark), `new-1280`, `exempt-1280`, `no-tax-1280`, `edit-address-1280`, `errors-1280` the slots measure: Product x 342–596 (≈254 px), Description 605–866 (≈261 px, the widest), Qty 875–943 (≈68 px), Rate 951–1041 (≈90 px), Amount ≈1049–1161 (112 px), Tax 1169–1213, menu at 1242. Product ≥ 200 and Description ≥ 260 and the widest, as item 23(b) asks. Visible effects: "Wireless access point", "Initial consultation" and "Cat6 patch cable, 10 ft" read in full (r4 truncated them); the 62-character fixture description "Wi-Fi 6E ceiling-mount access point, installed and configured." fits in two lines of the three-line cell (r4 cut its last word); "A free first hour to scope the work." fits in two lines. The reference's Product ≈203 / Description ≈271 proportions are back.
- **Totals footer follows the slots.** The totals block spans the Qty + Rate + Amount slots (x 875–1161); every figure ("$483.00", "$42.07", "$525.07", "$0.00", "$189.00") ends at x≈1161, the same edge as the line amounts "$378.00" / "$0.00" / "$105.00" / "$189.00". The Total row keeps its `border-t` and bold figure across the span. Same in dark.
- **640 px worst case: not verified** — `filled-911` is INVALID (above). Recapture with the sidebar collapsed (rail only) at 911, or at a viewport that leaves the form 640 px with the sidebar open (≈990 px).

## Findings

### new-1280, filled-1280 (light and dark), exempt-1280, edit-address-1280, errors-1280
- new-1280: totals block, the tax row's label — "Denver combined (8.71%)" wraps to two lines ("Denver combined" / "(8.71%)") at 1280 because the label span is the Qty + Rate slots (≈166 px); the reference (`new-1280`, `filled-1280`, `exempt-1280`) draws it on one line with the label starting left of the Qty column (x≈865). Same in every 1280 shot with a tax (`filled-1280` light and dark, `exempt-1280`, `edit-address-1280`, `errors-1280`). Not in r4's 1280 record (r4 noted the wrap at 911 only). — NOTE (the footer follows the slots as the fix asked; a label span that may extend left into the Description slot, or a shorter label, would keep the reference's one line).
- Persisting NOTEs (ledger cp 3), unchanged: "Lines *" heading over the grid; Qty / Rate / Amount headers left-aligned over right-aligned values ("Amount" at x≈1053 while the figures end at x≈1161); row menu "⋮" ~8 px above the row's input centreline; Tax (half width) alone on a band row; "Email" label with nothing under it on a new form; "BALANCE DUE" uppercase; Tax select "8.71%" vs totals "(8.71%)"; focused cell draws a blue ring while the accents are teal (`exempt-1280` Description); the totals block starts ≈11 px right of the Message textarea's edge.

### no-tax-1280
- nothing found beyond the persisting NOTEs. Subtotal / Total / Balance due align under the Amount column with no tax row.

### new-390, filled-phone-390, errors-phone-390
- nothing found beyond the persisting NOTEs (phone band reflow: Terms and Invoice date share a row, Due date alone, Tax full width). Cards, kind labels, right-aligned Qty / Rate / Amount, row menu top right, totals under Memo, errors under their fields, "Lines is required" under the Add buttons.

### filled-911
- INVALID, not critiqued.

## Tally

Distinct findings (a finding repeated across shots is counted once):

- INVALID: 1 — `filled-911` shows the card layout (form ≈563 px, sidebar expanded), not the 640 px wide grid; the fix's 640 px condition is unverified this round.
- BLOCKING: 0 — the round-4 BLOCKING (1280 column widths, Description widest, three-line description) is resolved; the totals follow the grid's slots.
- NOTE: 1 new — the totals tax label "Denver combined (8.71%)" wraps to two lines at 1280 where the reference has one. The r0–r4 NOTEs in the ledger persist unchanged and are not recounted.

## For gate 3
- errors-1280 / errors-phone-390: after a refused Save draft the table reads "No rows yet." — the one empty Item line the form opened with is dropped before validation and not put back (raised in r1, r3 and r4; still visible).
