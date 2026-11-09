# Critique 2: general-ledger checkpoint 1 — the re-captured desktop Name picker

Scope: only `new-name-open-1280-light.png` and `new-name-open-1280-dark.png` (re-capture after critique 1 marked them INVALID). Judged against spec §3 "Journal entry lines get a Name" ("a `SearchPicker` over active customers and vendors in two groups, between Account and Debit"), the open 390 sheet (`new-name-open-390-*`), and the Books `SearchPicker` style. No reference exists for the picker.

## State check

| Shot | State named | Shows | Verdict |
|---|---|---|---|
| new-name-open-1280-light | Name picker open on line 1 of a new entry at 1280 | the new entry form with a popover anchored to line 1's Name trigger (x 637): search box "Search customers and vendors", None (checked), the CUSTOMERS heading, the customers list from "Alvarez kitchen remodel" to "Harborview Events" | valid (the Vendors heading is below the popover's fold, so the second group is not verified, as on the 390 sheet) |
| new-name-open-1280-dark | same, dark | the same popover in dark tokens | valid (same caveat) |

## Findings

### new-name-open-1280-light
- Popover, placement — the list (about 10 rows, 396 px tall) does not fit under the trigger (287 px to the sticky footer), so core's Popover flips it above the trigger: it sits 8 px from the viewport top and covers the Date field's right half, the Memo field and the DEBIT heading. Correct auto-flip behaviour and the trigger stays visible under it; but at this height every line below line 1 will also open upward, hiding the entry header. A shorter max list height (about 6–7 rows, the rest scrolling) would let it open downward on the first lines. Taste, no rule. — NOTE
- Popover, "None" row and the CUSTOMERS heading — the heading sits at the same 27 px pitch as the rows (None 72 → CUSTOMERS 99 → Alvarez 126), so it reads as a row of the list rather than a divider between None and the group; the 390 sheet gives the heading more air above (39 px) than below (32 px). A few px of top margin on the heading would match the sheet. — NOTE
- Search box, None with its check, the muted small-caps group heading flush with the search box, the options indented in the foreground colour, the popover left edge aligned with the trigger (637) and wider than the column (320 px) — all consistent with the 390 sheet and the Books `SearchPicker` style. Legible. Nothing else found.

### new-name-open-1280-dark
- Popover, surface — in dark the popover's fill is the same tone as the page and the form fields behind it, with only a 1 px border and no visible shadow (light mode shows a soft shadow). It still reads as a layer because it cuts the Memo field's border, and the text is legible; the weak separation is core Popover's dark surface, not a cp1 choice. — NOTE
- Otherwise identical to light; nothing else found.

## Totals
INVALID 0 · BLOCKING 0 · NOTE 3

## For gate 3
- Neither 1280 shot (nor the 390 sheet) scrolls far enough to show the VENDORS heading; gate 3 confirms the second group renders (`entry-line-name-option-group-Vendors`) and that the loading / retry / empty rows render (still in no shot).
- The popover's search box shows no caret or focus ring in either shot; if `SearchPicker` autofocuses its search on open (lessons line 18 pattern), confirm it does so on desktop.
