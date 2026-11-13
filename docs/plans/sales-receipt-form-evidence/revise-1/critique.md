# Gate 2 critique — revise-1 (hint below input)

Scope: the shots re-captured after revise-1 item 1 (`FieldCell` draws `CellDescription` after the input, above the error). Judged against the same-named reference shots as a loose anchor and against the cp4 shots for the change itself.

## State check

| Shot | State named | Shows | Valid |
|---|---|---|---|
| new-1280-light / dark | new, empty | New sales receipt, no customer, one empty line, $0.00, Deposit to drawn (Ask) | yes |
| new-390-light / dark | new, empty, phone | same at 390 | yes |
| filled-1280-light / dark | populated | Harborview, Check 43567, 1200 Undeposited funds, 7 lines, message, $1,346.77 | yes |
| filled-phone-390-light / dark | populated, phone | same at 390, line cards | yes |
| errors-1280-light / dark | errors | Reference no. over 40 chars: red border, hint, then the zod error | yes |
| errors-phone-390-light / dark | errors, phone | same at 390 | yes |

0 INVALID.

## The revised change

- 1280 (new, filled, errors): Payment method trigger, Reference no. input and Deposit to trigger now share one top edge (y≈580 new / 672 filled). In cp4 the Reference no. input sat ~22 px lower. Fixed.
- The hint "Check or card reference" draws under the input in muted text; in the error shots the red error draws under the hint (hint first), as revise-1 asks. The gap input→hint (~16 px) matches the gap hint→error; the band's bottom padding stays even.
- The same order now holds for Message to customer and Internal memo (hint under the textarea) at every width: consistent with the new rule.
- 390: hint sits between the Reference no. input and the Deposit to label with even spacing; the error shot keeps hint then error.

## Findings

new-1280-light / dark: nothing found on the revised change. Pre-existing (identical in cp4 new-1280, seen by the human at the eval gate and not raised):
- new-1280: lines grid header — the column header "Tax" wraps to "Ta / x" at the right edge (also in filled-1280 and errors-1280, light and dark) — NOTE (pre-existing; a column head whose width does not fit its one word reads as a broken word; the reference filled-1280 shows "Tax" on one line)
- new-1280: band — an "Email" label with nothing under it when no customer is chosen; the reference new-1280 draws no Email row with no customer — NOTE (pre-existing; spec §3.3 says Email "is in the band like the invoice's", so this may be the invoice's behavior)
- new-1280: band — the gap between the Sale date row and the payment divider (~40 px) is wider than the gap under the payment row; the reference band is tighter — NOTE

new-390-light / dark: nothing found.

filled-1280-light / dark: nothing found on the revised change. The "Ta / x" header wrap noted above applies.

filled-phone-390-light / dark: nothing found.

errors-1280-light / dark: nothing found on the revised change. The "Ta / x" header wrap noted above applies. Not a finding: the reference errors-1280 shows server refusals (inactive customer, Deposit to, Line 2) while the build shows the Reference no. length error; the cp4 errors shot was the same and the eval gate did not raise it.

errors-phone-390-light / dark: nothing found.

Dark mode: hint (muted) and error (red) are legible on the dark band at both widths.

## For gate 3

Nothing visible.

## Totals

CRITIQUE: 0 INVALID, 0 BLOCKING, 3 NOTE
