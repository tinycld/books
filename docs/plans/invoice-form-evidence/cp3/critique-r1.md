# Gate 2 design critique — invoice-form, checkpoint 3 (after fix round 1)

Delivers: `books/invoices/new` and a draft at `books/invoices/[id]`: the header band with every built-in and its fills, the four-kind line table on core `TableField`, live totals and Balance due, Save draft / Cancel / Delete draft with keys, every load state, the + New → Invoice entry, the customer form's Terms built-in, and focus on Customer at open (web).

Not judged: tabs (cp6), Post / Post & new (cp5), Subtotal / Description / Percent rows and bundles (cp4), read view and PDF (cp5/6).

## State check

| shot | light / dark | state shown | valid |
|---|---|---|---|
| new-1280, new-390 | both | empty new form, one empty Item line, $0.00 | yes |
| filled-1280 | both | saved draft, Harborview, 3 Item lines, totals $525.07 | yes |
| filled-phone-390 | both | the same draft as cards | yes |
| edit-address-1280, edit-address-390 | both | address inputs and email input shown in the band | yes |
| exempt-1280 | both | Northwind Traders, taxable off, tax $0.00 | yes |
| no-tax-1280 | both | Tax None, no tax line in the totals | yes |
| errors-1280 | both | Customer is required, due-date error, Lines is required | yes |
| errors-phone-390 | both | the same at 390 | yes |
| no-access-1280, no-access-390 | both | notice with back link, no + New | yes |
| not-found-1280, not-found-390 | both | notice with back link | yes |
| loading-1280, loading-390 | both | centred spinner | yes |
| error-1280, error-390 | both | message and Retry | yes |

0 INVALID.

## Findings

### new-1280 (light and dark)
- new-1280: line grid, column widths — Product, Description, Qty and Rate all get the same ~140 px while ~120 px sits empty between the Tax toggle and the row menu; the product trigger truncates to "Choose a pr…". The reference gives Description the widest column and shows product names in full ("Wireless access point", "Cat6 patch cable, 10 ft"), with Qty and Rate narrow. — BLOCKING (reference decision: Description is the wide column, product names read in full; spec §3.3 "Description cell grows to 3 lines" — in a 140 px cell the fixture's sales descriptions wrap to 4+ lines, so the cell can never show them)
- new-1280: header band, "Email" — the label is drawn with nothing under it on a form with no customer (text-only field, "none when empty"). A dangling label reads as unfinished. — NOTE
- new-1280: header band, Tax row — Tax at half width on its own row leaves the right half of the band empty; the band is about twice the reference's height. The spec sets these widths (§4.4), so a layout choice, but the empty half-row is visible. — NOTE
- new-1280: grid header — "Qty", "Rate" and "Amount" headers are left-aligned over right-aligned values. — NOTE
- new-1280: row menu "⋮" — sits ~8 px above the row's input centreline. — NOTE
- new-1280: "Lines *" label above the grid — a redundant heading with a required asterisk over a table; the reference draws the grid under the band with no label. — NOTE
- new-1280: "BALANCE DUE" — uppercase label; the spec and the reference write "Balance due". — NOTE
- new-1280: Tax select reads "Denver combined 8.71%" while the totals line reads "Denver combined (8.71%)" — two formats of the same rate on one screen. — NOTE

### new-390 (light and dark)
- new-390: header band, Terms / Invoice date / Due date — Terms and Invoice date share a row; the Invoice date field's calendar button is pushed outside the viewport (a stray bar at the right edge, x≈388, y≈418), and Due date wraps to its own row as a half-width input with its calendar icon detached ~40 px to the right. The reference phone band draws every field full width with the icon inside the field. — BLOCKING (spec §1 "with the same screen working by touch on a phone" — a clipped calendar button cannot be tapped; reference phone band decision)
- new-390: "Email" label with no value — as new-1280. — NOTE

### filled-1280 (light and dark)
- filled-1280: line grid — "Wireless ac…", "Initial consul…", "Cat6 patch …": every product name is truncated at ~12 characters while the row has ~120 px of unused width right of the Tax toggle; Description shows 3 of 4+ wrapped lines. Same cause as new-1280's column widths. — BLOCKING (same basis as new-1280)
- filled-1280: totals block — "Denver combined (8.71%)" wraps to two lines in a ~115 px label column although the block has room; the block's left edge is 11 px from the Message textarea. — NOTE

### filled-phone-390 (light and dark)
- filled-phone-390: header band — the same clipped Invoice date calendar button and detached Due date icon as new-390. — BLOCKING (same basis as new-390)
- filled-phone-390: line cards — no line number on the kind label ("Item" vs the reference "1 · ITEM"); Qty and Rate each full width and Amount on its own labelled row, so each card is about twice the reference card's height. Spec says "fields stacked", so a choice; the missing number is the loss. — NOTE

### edit-address-1280 (light and dark)
- nothing found beyond the shared grid findings (column widths as new-1280).

### edit-address-390 (light and dark)
- edit-address-390: header band — the same clipped Invoice date calendar button and detached Due date icon as new-390 (y≈827 / 923). — BLOCKING (same basis as new-390)

### exempt-1280 (light and dark)
- exempt-1280: line 1 Description cell — the cell is scrolled to its end: the first line "Wi-Fi 6E" is cut off at the top ("ceiling-mount" is half visible), the last three lines show. The cell is focused here, but the same scroll shows unfocused in no-tax-1280. — BLOCKING (spec §3.3 "Description cell grows to 3 lines" — the cell must show its first lines, not a clipped tail)
- exempt-1280: column widths — as new-1280. — (counted once above)

### no-tax-1280 (light and dark)
- no-tax-1280: line 1 Description cell — scrolled to its end with the first line clipped, while unfocused. — BLOCKING (same basis as exempt-1280; counted with it)

### errors-1280 (light and dark)
- nothing found. Errors sit under their fields; "Lines is required" under the table; the due-date message wraps cleanly under the quarter-width field in both schemes.

### errors-phone-390 (light and dark)
- errors-phone-390: header band — the same clipped Invoice date calendar button as new-390; the Due date row here shows its error under the half-width input with the icon detached. — BLOCKING (same basis as new-390)

### no-access-1280 / no-access-390 (light and dark)
- nothing found.

### not-found-1280 / not-found-390 (light and dark)
- nothing found.

### loading-1280 / loading-390 (light and dark)
- nothing found.

### error-1280 / error-390 (light and dark)
- nothing found.

## Tally

Distinct findings (a finding that repeats across shots is counted once):

- BLOCKING: 3
  1. Wide grid column widths — product names truncated, Description as narrow as Qty, unused width right of Tax (new-1280, filled-1280, edit-address-1280, exempt-1280, no-tax-1280).
  2. Description cell scrolled to its tail with the first line clipped (exempt-1280, no-tax-1280).
  3. Phone band: Invoice date calendar button clipped off-screen, Due date half width with a detached icon (new-390, edit-address-390, filled-phone-390, errors-phone-390).
- NOTE: 9
  1. "Email" label with no value on a form with no customer.
  2. Tax half width alone on a row; band height.
  3. Qty / Rate / Amount headers left-aligned over right-aligned values.
  4. Row menu "⋮" above the row centreline.
  5. "Lines *" heading over the grid.
  6. "BALANCE DUE" uppercase.
  7. Tax select "8.71%" vs totals "(8.71%)".
  8. Totals tax label wraps; block abuts the Message textarea.
  9. Phone cards without a line number; taller than the reference cards.

## For gate 3
- errors-1280 / errors-phone-390: after a failed Save draft the table reads "No rows yet." — the one empty Item line the form opened with is dropped before validation and not put back, so the user's only row disappears on a refused save and "Lines is required" is shown for a row the user never removed.
- exempt-1280: after picking a product, focus sits in the Description cell with the caret at the end (the cell is scrolled); check that `focusNext` lands where §3.1's Tab order says and does not scroll the cell.
