# Gate 2 design critique — invoice-form, checkpoint 3 (round 5, re-capture: the 640 px form at a 911 px viewport)

Scope of this critique: only `filled-tablet-911-light` and `filled-tablet-911-dark`, the re-capture that replaces the INVALID `filled-911` of `critique-r5.md`. The 1280 and phone verdicts of `critique-r5.md` stand and are not redone here. No reference exists at this width; the nearest is `invoice-form-reference/filled-1280-light.png`.

Delivers: `books/invoices/new` and a draft at `books/invoices/[id]`: the header band with every built-in and its fills, the four-kind line table on core `TableField`, live totals and Balance due, Save draft / Cancel / Delete draft with keys, every load state, the + New → Invoice entry, the customer form's Terms built-in, and focus on Customer at open (web).

## State check

| shot | scheme | state shown | valid |
|---|---|---|---|
| filled-tablet-911 | light | the saved draft ("Draft invoice", Draft badge, More in the bar), Harborview, 3 Item lines, totals $525.07, at a 911 px viewport with the tablet sidebar (rail + nav ≈ 238 px); the form runs x≈256–895 (≈640 px) and the table draws the wide grid (header Product or service · Description · Qty · Rate · Amount · Tax · menu) | yes |
| filled-tablet-911 | dark | the same, dark scheme | yes |

0 INVALID.

## Fix verification (item 23(a): the 640 px condition)

Measured in the light shot (the dark shot is identical in layout):

- Slots: Product ≈258–371 (≈113 px), Description ≈380–497 (≈117 px), Qty ≈505–574 (≈69 px), Rate ≈582–671 (≈90 px), Amount ≈680–792 (112 px), Tax ≈800–847, menu at ≈873. Description is the widest slot and Product the next, as 23(a) asks — by 4 px.
- Every value shows whole: Qty "2" / "1" / "12" and Rate "189.00" / "0.00" / "8.75" right-aligned inside their boxes; the Amount figures "$378.00" / "$0.00" / "$105.00" end at x≈791, before the Tax slot at ≈800; the Tax switch (≈801–843) lies inside its slot under the "Tax" header.
- The fixture draft does not hold the strings 23(a) names (Qty "1000", Rate "1890.00"); the shot confirms the floors hold at 640 (a 69 px Qty box and a 90 px Rate box, no clipped value), and the e2e of this round asserts the exact strings.
- Totals footer: the block spans Qty + Rate + Amount (x≈505–792); every figure ("$483.00", "$42.07", "$525.07", "$525.07") ends at x≈791, the same edge as the line amounts. The Total row keeps its `border-t` and bold figure. Footer alignment holds at this width as item 21 / 23 require.
- The description cell shows three lines and clips a fourth mid-glyph ("Wi-Fi 6E / ceiling- / mount / acc…", "A free first / hour to / scope the / wo…"). The reference `filled-1280` shows the same clipped fourth line in its three-line cells ("…categorize every / line", "…leaves a written / plan. Travel inside the Portland"), so this is the reference's decision (a scrolling 3-line cell), not a finding.

## Findings

### filled-tablet-911-light, filled-tablet-911-dark
- lines grid, Product trigger — at 640 px the Product cell is ≈113 px, so every product name shows about eight characters before the ellipsis ("Wireless…", "Initial co…", "Cat6 pa…"); the numeric floors (Qty 69 + Rate 90 + Amount 112 + Tax ≈47 + menu 40 + six 8 px gaps ≈ 406 px) leave ≈230 px for Product and Description together. The names stay distinguishable in this fixture, and the reference at 1280 also truncates ("Bookkeeping catch-u…"), so no rule is broken; a tighter Tax floor or a narrower Amount floor at this width would give the two text columns more. — NOTE
- header band — at 640 the quarter-width built-ins become halves: Terms and Invoice date share a row, Due date sits alone with an empty half beside it, and Tax (half width) takes a full row below. Due date and Tax could share a row. Same in dark. (The 1280 "Tax alone on a band row" NOTE is in the ledger; this is the 640 shape of it.) — NOTE
- Persisting NOTEs (ledger cp 3, r0–r5), unchanged at 640 and not recounted: "Lines *" heading over the grid; "Product or service" header wraps to two lines at this width while Qty / Rate / Amount headers sit left over right-aligned values; row menu "⋮" above the input centreline; "BALANCE DUE" uppercase; Tax select "8.71%" vs totals "(8.71%)"; the totals tax label "Denver combined (8.71%)" wraps to two lines (r5 NOTE; at 640 the label span is the same Qty + Rate ≈166 px); the totals block starts ≈10 px right of the Message textarea's edge.
- Dark: legibility is fine — inputs keep a visible border, the off toggle reads as a track, row dividers and the Total `border-t` show, the teal accent links and Save draft read. Nothing dark-only found.
- Not judged: the tablet sidebar's truncated "Chart of Acco…" (core chrome, not this checkpoint).

## Tally

- INVALID: 0
- BLOCKING: 0 — the 640 px condition of item 23(a) is met in the shots: every cell shows its value, the Amount figure ends before the Tax slot, the Tax switch sits inside its slot, Description is the widest slot and Product the next, and the totals follow the slots' edge.
- NOTE: 2 new (Product cell ≈8 characters at 640; Due date alone beside an empty half while Tax takes a full row). The r0–r5 NOTEs persist and are not recounted.

## For gate 3
- Nothing visible in these two shots. (The r5 item — "No rows yet." after a refused Save draft — is not in this capture and stands as recorded in `critique-r5.md`.)
