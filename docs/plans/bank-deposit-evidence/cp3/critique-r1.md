# Gate 2 design critique, round 1 (after fix round 1): bank-deposit, checkpoint 3

Scope: the Delivers line of checkpoint 3 (form with undeposited items). The Other funds section is checkpoint 4; its absence is not a finding. Positions are read from the screenshots by eye (about ±2 px), not measured in the page.

## State check

- populated-1280-light: VALID. New form, seeded list (9 items, $7,569.77), no item ticked.
- populated-1280-dark: VALID. Same state.
- populated-390-light: VALID. Same state, cards layout.
- populated-390-dark: VALID. Same state, cards layout.

As in the first critique, no built shot has a ticked item or a money-out item. See "For gate 3".

## Fix item 7 (Selected line right-aligned with the Amount column)

- 1280 (grid): the Selected value "$0.00" ends at x≈1255, the same right edge as the Amount cells ("$500.00" … "$64.00"). Fixed.
- 390 (cards): the Selected value ends at x≈361, the same right edge as the card amounts. Fixed. The totals under the memo ("Selected items", "Deposit total") end at x≈374, the section edge; that is their own block and agrees with the reference.
- The widths 595/596 of the fix item have no shot; not judged here.

## Fix item 8 ("Clear selection" as a ShortcutButton)

- Shown in all four shots, under the list at the left, before the Selected line. No key hint is drawn in the control. Its look changed: see the NOTE below.

## Findings

### populated-1280-light

- populated-1280-light: "Clear selection" under the grid — the link is now small text with no underline; the reference draws it underlined at body size, and the Transaction links in the same grid are underlined. Two link styles in one section. — NOTE
- populated-1280-light: Selected line — the count "0 of 9" and the amount "$0.00" are two columns with a wide gap; the reference draws one value "3 of 5 · $578.90". — NOTE (carried from the first critique; the text form is a gate 3 item)
- No other finding. The grid does not scroll sideways.

### populated-1280-dark

- populated-1280-dark: "Clear selection" — same as light. — NOTE (same finding)
- populated-1280-dark: Selected line — same as light. — NOTE (same finding)
- populated-1280-dark: tick boxes, header and rows — the border of a clear box has low contrast on the dark background. The reference dark shot has the same look (shared `SelectBox`). — NOTE (carried)
- No other finding.

### populated-390-light

- populated-390-light: under the cards — "Clear selection" is on its own row and the Selected line is on the next row; the reference puts both on one row. The spec text does not fix this, and the alignment rule is met. — NOTE
- populated-390-light: "Clear selection" — small, no underline, as at 1280; the link lines of the cards are underlined. — NOTE (same finding as 1280)
- No other finding. "Select all" is present, cards agree with the reference, no sideways scroll.

### populated-390-dark

- populated-390-dark: same three NOTEs as 390 light and the tick box contrast NOTE of 1280 dark. — NOTE (same findings)
- No other finding.

## Totals

0 INVALID, 0 BLOCKING, 4 NOTE (Clear selection link style; Selected count and amount in two columns; Clear selection and Selected on two rows at 390; tick box contrast in dark).

## For gate 3

- No built shot shows a ticked item: the `bg-accent` tint on a ticked row and card, the partial state of the header tick box and of "Select all", and Selected and Deposit total following the ticks are read from the code or the e2e run.
- No seeded item is money out: "−$20.00" (U+2212) in `text-danger` is read from the code.
- Selected text is drawn as two parts (count, amount). Spec §3.4 gives "2 of 3 · $1,500.00". Check the built text against the plan (`TotalLine` with `detail`) and the e2e reads of `deposit-selected`.
- The Selected alignment at 595/596 px section width (fix item 7 names these widths) has no shot.
