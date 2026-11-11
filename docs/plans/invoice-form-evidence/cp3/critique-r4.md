# Gate 2 design critique — invoice-form, checkpoint 3 (round 4: after the line-grid column weights were re-set and the totals block was moved under the Amount column)

Delivers: `books/invoices/new` and a draft at `books/invoices/[id]`: the header band with every built-in and its fills, the four-kind line table on core `TableField`, live totals and Balance due, Save draft / Cancel / Delete draft with keys, every load state, the + New → Invoice entry, the customer form's Terms built-in, and focus on Customer at open (web).

Judged: every shot in `cp3/` (`new`, `filled`, `filled-phone`, `edit-address`, `exempt`, `no-tax`, `errors`, `errors-phone`, `no-access`, `not-found`, `loading`, `error`; 1280 and 390, light and dark) and the implementer's two extra shots `cp/cp3-fix4-911.png` (911 px viewport = 640 px form, the narrowest wide grid) and `cp/cp3-fix4-1280.png`. Not judged: tabs (cp6), Post / Post & new (cp5), other line kinds and bundles (cp4), read view and PDF (cp5/6). Findings the ledger already settled (Rebuttals, Design notes cp 3) are listed as persisting and not recounted.

## State check

| shot | light / dark | state shown | valid |
|---|---|---|---|
| new-1280 | both | empty new form, Draft badge, one empty Item line, totals $0.00 | yes |
| new-390 | both | the same as a stacked band and one card | yes |
| filled-1280 | both | saved draft ("Draft invoice", Draft badge, More), Harborview, 3 Item lines, totals $525.07 | yes |
| filled-phone-390 | both | the same draft as three cards, totals, More | yes |
| edit-address-1280 | both | Harborview picked, address inputs and Email input shown in the band, Edit customer only | yes |
| edit-address-390 | both | the same stacked | yes |
| exempt-1280 | both | Northwind Traders, Tax Denver combined with $0.00 tax, line Tax toggle off, Balance due $189.00 | yes |
| no-tax-1280 | both | Harborview, Tax None, no tax row in the totals, total = subtotal $189.00 | yes |
| errors-1280 | both | Customer is required, due-date error, "No rows yet.", Lines is required | yes |
| errors-phone-390 | both | the same at 390 | yes |
| no-access-1280 / 390 | both / light | back link + "You need bookkeeper access to create invoices"; no + New in the sidebar | yes |
| not-found-1280 / 390 | both / light | back link + "This invoice does not exist" | yes |
| loading-1280 / 390 | both / light | centred spinner | yes |
| error-1280 / 390 | both / light | "Books could not load this invoice." + Retry | yes |
| cp3-fix4-911 | light | filled wide form at a 640 px form width, one line (qty 1000, rate 1890.00) | yes |
| cp3-fix4-1280 | light | the same at 1280, Rate cell focused | yes |

0 INVALID.

## Fix verification

- **Totals under Amount (r3 BLOCKING): resolved.** At 1280 (`new-1280`, `filled-1280`, `exempt-1280`, `no-tax-1280`, `edit-address-1280`, `errors-1280`, both schemes) the totals' figures end at x≈1137, the same edge as the line amounts "$378.00" / "$0.00" / "$105.00" (x≈1137). At the 640 px form (`cp3-fix4-911`) the totals end at x≈791, the same edge as the line amount "$1,890,000.00" (x≈791). The Total row keeps its `border-t` and bold figure.
- **Every cell shows its value at 640 (`cp3-fix4-911`): met.** Product ≈110 px (truncates, expected at the narrowest width), Description ≈124 px (three lines, grows), Qty ≈67 px shows "1000", Rate ≈86 px shows "1890.00", Amount ≈114 px shows "$1,890,000.00" in full, the Tax toggle and the row menu have their own slots. Nothing is clipped.
- **Wide grid at 1280: regressed against r3.** See the finding below.

## Findings

### filled-1280 (light and dark), cp3-fix4-1280, new-1280, exempt-1280, no-tax-1280, edit-address-1280
- filled-1280: lines grid, column widths at 1280 — the weights that make every cell fit at 640 scale up in proportion, so at 1280 the three numeric columns take about 410 px (Qty ≈104 px for "12", Rate ≈132 px for "8.75", Amount ≈172 px for "$105.00") while Product is ≈175 px (x 342–517) and Description ≈180 px (x 525–705). Round 3 verified Product ≈208 / Description ≈276 / Qty ≈70 / Rate ≈104 / Amount ≈120 and the reference has Product ≈203, Description ≈271 (the widest column), Qty 80, Rate 112. Visible effects: "Wireless access point" and "Cat6 patch cable, 10 ft" truncate again ("Wireless access ...", "Cat6 patch cable,...") where the reference and round 3 read them in full; the fixture's 62-character description "Wi-Fi 6E ceiling-mount access point, installed and configured." now needs four lines and its last word is cut at the bottom of the three-line cell (`filled-1280`, `exempt-1280`, `no-tax-1280`, `cp3-fix4-1280`), where it fit in two lines in round 3; Description is no longer the widest column by any margin (180 vs Amount 172, Product 175). — BLOCKING (reference `filled-1280` / `new-1280`: Description the widest column, Qty 80 / Rate 112; ledger Design notes cp 3: "the approved reference made Description the widest column", the core change request that round 3 verified resolved at Product ≈208 / Description ≈276; spec §3.3 "Description cell grows to 3 lines": at 180 px the fixture description does not show in three lines). Fix direction: give Qty, Rate and Amount a minimum width sized for the 640 worst case and put the remaining width on Description (then Product) by weight, instead of proportional weights across all columns; the 640 result stays as it is and 1280 returns to the round-3 proportions.
- Persisting NOTEs (ledger cp 3), unchanged: "Lines *" heading over the grid; Qty / Rate / Amount headers left-aligned over right-aligned values (at 1280 the "Amount" header starts at x≈968 while the values end at x≈1137); row menu "⋮" ~8 px above the row's input centreline; Tax (half width) alone on a band row; "Email" label with nothing under it on a new form; "BALANCE DUE" uppercase; Tax select "8.71%" vs totals "(8.71%)"; focused cell draws a blue ring while the accents are teal (`cp3-fix4-1280` Rate, `exempt-1280` Description).

### cp3-fix4-911
- Grid: nothing found beyond the persisting NOTEs (the totals tax label "Denver combined (8.71%)" wraps to two lines and the totals block ends 10 px from the Message textarea; the "Amount" header sits left of its values).
- Band at a 640 px form: Terms and Invoice date share a row, Due date sits alone at half width, Tax below is full width — the same reflow that the r3 NOTE recorded for the phone band, now visible at the narrowest wide width too. — persisting NOTE, not recounted.

### new-1280, new-390, filled-phone-390, errors-1280, errors-phone-390, edit-address-1280, edit-address-390, exempt-1280, no-tax-1280 (light and dark)
- Beyond the BLOCKING above (1280 grid) and the persisting NOTEs: nothing found. Band fills, Bill to lines with Edit address / Edit customer, the address inputs and Email input after Edit address, Net 30 → due date +30, the exempt customer's $0.00 tax with the line toggle off, Tax None removing the tax row, errors under their fields, "Lines is required" under the Add buttons, the Draft badge and Balance due figure, Cancel / Save draft / More all read well in both schemes.

### no-access-1280 / 390, not-found-1280 / 390, loading-1280 / 390, error-1280 / 390 (light and dark)
- nothing found. Back link and text on no-access and not-found; the sidebar hides + New for the reader; spinner centred; error text bold with a Retry button centred under it; legible in dark.

## Tally

Distinct findings (a finding repeated across shots is counted once):

- INVALID: 0
- BLOCKING: 1 — the 1280 grid: the proportional column weights give the numeric columns ~410 px and Description 180 px, so product names truncate and the fixture description overflows its three-line cell; the reference (and round 3) made Description the widest column.
- NOTE: 0 new. The r0–r3 NOTEs in the ledger persist unchanged and are not recounted.

## For gate 3
- errors-1280 / errors-phone-390: after a refused Save draft the table reads "No rows yet." — the one empty Item line the form opened with is dropped before validation and not put back (raised in r1 and r3; still visible).
