# Gate 2 design critique: bank-deposit, checkpoint 3

Scope: the Delivers line of checkpoint 3 (form with undeposited items). The Other funds section is checkpoint 4; its absence is not a finding.

## State check

- populated-1280-light: VALID. Shows the new form with the seeded list (9 items, $7,569.77), no item ticked.
- populated-1280-dark: VALID. Same state.
- populated-390-light: VALID. Same state, cards layout.
- populated-390-dark: VALID. Same state, cards layout.

No built shot has a ticked item, and the seeded list has no money-out item. Thus these shots cannot show three reference decisions: the `bg-accent` tint of a ticked row or card, the partial header tick box, and "−$20.00" in `text-danger`. See "For gate 3".

## Findings

### populated-1280-light

- populated-1280-light: Selected line under the grid — the amount "$0.00" ends at the section edge, about 7 px right of the Amount column's right edge (the rows have padding; the reference ends the Selected value on the column edge). The count "0 of 9" is in a separate column from the amount, not "0 of 9 · $0.00" as one value as the reference draws it. — NOTE
- No other finding. Header, band, grid columns, ellipsis ("St. Jude Annual Spring Gala…"), sort arrow on Date, Clear selection link, memo left of totals, totals with the top border on Deposit total, and the action bar (Cancel, Save draft, Post, Post & new) agree with the reference. The grid does not scroll sideways.

### populated-1280-dark

- populated-1280-dark: Selected line — same as light. — NOTE (same finding)
- populated-1280-dark: tick boxes, header and rows — the border of a clear box has low contrast on the dark background; the box is hard to see. The reference dark shot has the same look (shared `SelectBox`). — NOTE
- No other finding. Text, links and the band are legible.

### populated-390-light

- populated-390-light: Selected line under the cards — the amount "$0.00" ends near x=303 of 390, about 70 px left of the right edge. The card amounts end at x≈361 and the totals ("Selected items", "Deposit total") end at x≈374, so the screen has three different right edges for money. The reference puts "Clear selection" and "Selected 3 of 5 · $578.90" on one row with the value at the right. — BLOCKING (spec §3.4: "Under the list, right-aligned under the Amount column (`TotalLine`s): **Selected** ("2 of 3 · $1,500.00").")
- No other finding. "Select all" over the cards is present (lesson 28). Card structure agrees with the reference: tick box and name with the amount at the right, the link line "Sales receipt 1006 · Nov 10, 2024", the payment text below. The long name truncates with an ellipsis and the amount stays whole. Figure under the title. Bar shows Cancel, Save draft, Post, More. No sideways scroll.

### populated-390-dark

- populated-390-dark: Selected line — same as 390 light. — BLOCKING (same finding, same basis)
- populated-390-dark: tick boxes — low contrast, as 1280 dark. — NOTE (same finding)
- No other finding.

## Totals

0 INVALID, 1 BLOCKING (Selected line alignment at 390, light and dark), 2 NOTE (Selected line at 1280; tick box contrast in dark).

## For gate 3

- No built shot shows a ticked item. Read from the code or the e2e run: the `bg-accent` tint on a ticked row and card, the partial state of the header tick box and of "Select all", and that Selected and Deposit total follow the ticks.
- No seeded item is money out. Read from the code that a negative amount draws "−$20.00" (U+2212) in `text-danger`.
- The Selected text is drawn as two parts (count, amount). Spec §3.4 gives "2 of 3 · $1,500.00"; the plan gives `TotalLine` with `detail`. Check that the built text agrees with the plan and the e2e reads of `deposit-selected`.
