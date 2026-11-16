# Gate 2 critique after the fix round: receive-payment, checkpoint 3

Result: 0 INVALID, 0 BLOCKING, 1 NOTE.

Scope judged: the six re-captured shots, against the two fixes (Find invoice no. field border and message; pointer off the action bar in read-credit). The notes of the first critique (`critique.md`) that did not change are not repeated: notes 4 and 6 are still visible in read-credit-390 and stay as written there.

Reference shots read: empty-390-light, empty-390-dark, find-miss-1280-light, find-miss-390-light, read-credit-390-light, read-credit-390-dark.

## State check

| Shot | State shown | Valid |
|---|---|---|
| empty-390-light / dark | No customer, find field empty with its placeholder, "Choose a customer to see their open invoices." | yes |
| find-miss-1280-light | No customer, 1099 in the find field, "No open invoice 1099" under it | yes |
| find-miss-390-light | Same at 390 | yes |
| read-credit-390-light / dark | Posted Payment 1003, nothing applied, Amount credited $250.00 with the note | yes |

## Fix check

- Find invoice no. field: the field has no danger border in the miss state. The lookup answer is a danger-tone message under the field, left-aligned with the field. This agrees with the reference (plain border, message under the field) and the spec ("no match shows "No open invoice 1099" under the field"). Fixed.
- read-credit-390: the pointer is off the action bar. "View journal entry" is in its rest state and no tooltip shows. Note 5 of the first critique is closed in light and dark.

## Findings

### empty-390-light / dark
- nothing found.

### find-miss-1280-light
- find-miss-1280: Find invoice no. field — the focused field has a blue 2 px ring, while the focused Customer trigger (empty-390 shots) has a teal ring. Two focus colors show on one form. If the blue ring is the core `TextInput` focus style, no change is necessary in Books. — NOTE (8)
- The built shot has no "Enter the amount received" refusal, and the reference has one. The reference refusal comes from a submit, not from the lookup; the find-miss state does not need it. Not a finding.

### find-miss-390-light
- Same focus ring as note 8; no other finding. The message is on one line and is legible.

### read-credit-390-light / dark
- nothing found (notes 4 and 6 of the first critique are unchanged and belong to checkpoint 2 parts).

## Not shown
- No dark shot of the miss message exists (the reference set has light only), so the danger text on the dark background has no evidence.

## For gate 3
- Nothing visible.
