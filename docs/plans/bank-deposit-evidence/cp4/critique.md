# Gate 2 design critique: bank-deposit, checkpoint 4

Scope: the Delivers line of checkpoint 4 (Other funds section, correction, void). The built shots show the new form with the Other funds section and no line, as the checkpoint's Gates line states. Lines, the cards of a line, the sign control, the refusal texts and the correction have no built shot; they are not judged here (see "For gate 3"). Positions are read from the screenshots by eye, not measured in the page.

## State check

- populated-1280-light: VALID. New form, seeded list (9 items, $7,569.77), no item ticked, Other funds section with heading, hint and "Add line", no line.
- populated-1280-dark: VALID. Same state.
- populated-390-light: VALID. Same state, cards layout.
- populated-390-dark: VALID. Same state, cards layout.

## Other funds section (what this checkpoint adds to the shots)

- Position: under the items and "Clear selection" / Selected, above Memo and the totals, at both widths. Agrees with the reference and spec §3.5 ("A section under the items").
- Heading "Other funds" and the hint text agree with the spec text word for word; the hint wraps cleanly to three lines at 390.
- "Add line" is a bordered button at the left, as the reference. With no line there is no table header, no "Other funds" total under the section and no "Other funds" row in the totals; this agrees with spec §3.5 ("Under the lines, when one or more exist") and §3.6 ("only with lines").
- Light and dark are both legible. No grid or table scrolls sideways at either width.

## Findings

### populated-1280-light

- populated-1280-light: "Clear selection" under the grid — small text with no underline; the reference draws it underlined, and the Transaction links in the same grid are underlined. — NOTE (carried from checkpoint 3)
- populated-1280-light: Selected line — the count "0 of 9" and the amount "$0.00" are two parts with a wide gap; the reference draws one value "3 of 5 · $578.90". — NOTE (carried from checkpoint 3)
- Other funds section: nothing found.

### populated-1280-dark

- populated-1280-dark: "Clear selection" and Selected line — same as light. — NOTE (same findings)
- populated-1280-dark: tick boxes, header and rows — the border of a clear box has low contrast on the dark background; the reference dark shot has the same look. — NOTE (carried from checkpoint 3)
- Other funds section: nothing found.

### populated-390-light

- populated-390-light: under the cards — "Clear selection" is on its own row and the Selected line is on the next row; the reference puts both on one row. — NOTE (carried from checkpoint 3)
- populated-390-light: "Clear selection" — small, no underline. — NOTE (same finding as 1280)
- Other funds section: nothing found.

### populated-390-dark

- populated-390-dark: same NOTEs as 390 light, and the tick box contrast NOTE of 1280 dark. — NOTE (same findings)
- Other funds section: nothing found.

## Totals

0 INVALID, 0 BLOCKING, 4 NOTE (all four carried from checkpoint 3: Clear selection link style; Selected count and amount in two parts; Clear selection and Selected on two rows at 390; tick box contrast in dark). No new finding from checkpoint 4.

## For gate 3

- No built shot has an other funds line. Read these from the code and the e2e run against `refused-*` and `correction-*`: the table (header Received from / Account / Description / Amount, remove column) and its switch to cards at the table's least width with no sideways scroll; the card layout ("Line 1" with Remove in the first line, fields stacked); a negative amount in `text-danger`; the "Other funds" total under the section and the "Other funds" row in the totals; the "±" sign control inside the Amount field (the reference shots do not draw it, so its look has no approved picture).
- No built shot of the correction: title "Edit deposit <number>", the bar with only Cancel and Save, the original's items ticked.
- No built shot of a refusal under a line field or of the 100-line hint (`deposit-lines-limit`).
- "Add line" draws no key hint for ⌥↵ in the shots. The reference draws none also. Check that it is a `ShortcutButton` as the plan says.
- Carried: no built shot shows a ticked item or a money-out item.
