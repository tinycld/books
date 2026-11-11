# Gate 2 design critique — invoice-form, checkpoint 3 (fresh critique after core 0d: DateField `minWidth: 0`, host column flex weights; Books line grid weights)

Delivers: `books/invoices/new` and a draft at `books/invoices/[id]`: the header band with every built-in and its fills, the four-kind line table on core `TableField`, live totals and Balance due, Save draft / Cancel / Delete draft with keys, every load state, the + New → Invoice entry, the customer form's Terms built-in, and focus on Customer at open (web).

Judged: the 12 re-captured shots (`new-1280`, `new-390`, `filled-1280`, `filled-phone-390`, `errors-1280`, `errors-phone-390`, light and dark). Not judged: tabs (cp6), Post / Post & new (cp5), other line kinds and bundles (cp4), read view and PDF (cp5/6). Findings the ledger already settled (Rebuttals, Design notes cp 3) are listed as persisting and not recounted.

## State check

| shot | light / dark | state shown | valid |
|---|---|---|---|
| new-1280 | both | empty new form, Draft badge, one empty Item line, totals $0.00 | yes |
| new-390 | both | the same as a stacked band and one card (Qty visible at the cut) | yes |
| filled-1280 | both | saved draft (title "Draft invoice", Draft badge, More), Harborview, 3 Item lines, totals $525.07 | yes |
| filled-phone-390 | both | the same draft as three cards, totals, More | yes |
| errors-1280 | both | Customer is required, due-date error, "No rows yet.", Lines is required | yes |
| errors-phone-390 | both | the same at 390 | yes |

0 INVALID.

## Fix verification

- Phone band DateFields (r0/r1 BLOCKING 3): resolved. `new-390`, `filled-phone-390`, `errors-phone-390` (light and dark): the Invoice date calendar button sits inside its input (x≈337) within the band's border, and the Due date button sits inside its input (x≈169). Nothing is clipped at the viewport edge.
- Wide grid column widths (r0/r1 BLOCKING 2 and 1, rebutted then handed to core): resolved. At 1280 the columns measure Product ≈208 px (342–549), Description ≈276 px (558–834), Qty ≈70, Rate ≈104, Amount ≈120, Tax toggle, menu; the reference's grid is Product ≈203, Description ≈271, Qty 80, Rate 112. Product names read in full ("Wireless access point", "Initial consultation", "Cat6 patch cable, 10 ft"); the 62-character description fits in two lines of the three-line cell; Qty values "2", "1", "12" are fully visible. The placeholder "Choose a product or s…" truncates as it does in the reference.
- Phone card Tax toggle (r0 BLOCKING 4): resolved, the toggle row carries a "Tax" label.
- Draft badge on a new form (r0 BLOCKING 5): resolved at both widths.

## Findings

### new-1280 (light and dark)
- new-1280: totals block, right edge — the totals are no longer under the Amount column. The row amount "$0.00" is right-aligned at x≈1155 (the Amount slot's right edge, before the Tax toggle), while the totals' figures ("$0.00" ×4) end at x≈1069, 86 px to the left, under the "Amount" header text rather than under the values. Before the column weights the two edges were ~8 px apart; the weights moved the Amount slot right and the totals block kept its old offset. — BLOCKING (spec §7 "Totals aligned under Amount: shared amount-column width constant; `tabular-nums text-right`"; brief Do 9 "`InvoiceTotals` aligned under the Amount column with the shared amount width constant … `AMOUNT_COLUMN_WIDTH`"; reference `new-1280`, `filled-1280`: the totals' right edge is the amounts' right edge, x≈1152)
- Persisting NOTEs (ledger cp 3), unchanged: "Lines *" heading over the grid; Qty / Rate / Amount headers left-aligned over right-aligned values; row menu "⋮" ~8 px above the row's input centreline; Tax (half width) alone on a band row; "Email" label with nothing under it; "BALANCE DUE" uppercase; Tax select "8.71%" vs totals "(8.71%)"; totals tax label wraps to two lines, 11 px from the Message textarea.

### new-390 (light and dark)
- new-390: header band, Due date row — with the quarter columns reflowed to halves, Terms and Invoice date share a row and Due date sits alone at half width with the right half of its row empty, while Tax below is full width. Legible and tappable now, so no rule; the reference stacks every phone band field full width. The phone face of the persisting "Tax alone on a row" note. — NOTE
- new-390: "Email" label with no value (persisting NOTE).

### filled-1280 (light and dark)
- filled-1280: totals block — same as new-1280: "$483.00", "$42.07", "$525.07", "$525.07" end at x≈1069 while the line amounts "$378.00", "$0.00", "$105.00" end at x≈1155. — BLOCKING (same basis as new-1280; counted once)
- Everything else reads well in both schemes: band fills, Bill to lines with Edit address / Edit customer, email text, Net 30 → due date +30, Denver combined, product names in full, descriptions in two lines, Qty and Rate values visible, Draft badge, Balance due figure, Cancel / Save draft / More.

### filled-phone-390 (light and dark)
- filled-phone-390: header band — Due date alone at half width (as new-390). — NOTE (counted once)
- Persisting NOTEs: card kind label "Item" without the line number; Qty / Rate / Amount each on their own row (cards about twice the reference's height); totals after Message and Memo.
- Cards read well: Tax label on the toggle row, right-aligned Amount, row menu top right, Description grows to its text.

### errors-1280 (light and dark)
- errors-1280: totals block — "$0.00" figures end at x≈1069 while the Amount header slot ends at x≈1155 (no rows, so judged against the header slot and the other 1280 shots). — BLOCKING (same basis; counted once)
- Error placement is right: "Customer is required" under Customer, "The due date cannot be before the invoice date" under Due date (two lines inside the quarter column), "Lines is required" under the Add buttons. Red text legible in dark mode.
- Persisting NOTE: Balance due "$0.00" while the form is invalid (spec "—" while invalid vs plan `balanceDueText`).

### errors-phone-390 (light and dark)
- errors-phone-390: header band — Due date alone at half width; the due-date error wraps to two lines under it inside the half column. — NOTE (counted once with new-390)
- Calendar buttons inside their inputs; errors under their fields; totals right-aligned. Nothing else found.

## Tally

Distinct findings (a finding repeated across shots is counted once):

- INVALID: 0
- BLOCKING: 1 — the totals block is not aligned under the Amount column after the column weights (new-1280, filled-1280, errors-1280; both schemes).
- NOTE: 1 new — phone band Due date alone at half width with an empty right half (new-390, filled-phone-390, errors-phone-390). The r0/r1/r2 NOTEs in the ledger persist unchanged and are not recounted.

## For gate 3
- errors-1280 / errors-phone-390: after a refused Save draft the table reads "No rows yet." — the one empty Item line the form opened with is dropped before validation and not put back (raised in r1; still visible).
