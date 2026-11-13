# cp4 gate-2 design critique, after the fix round — errors and draft shots

Scope: the eight shots the fix round captured again (`errors-1280-*`, `errors-phone-390-*`, `draft-1280-*`, `draft-390-*`). The first critique (`critique.md`) covers the other shots; its "Tax" header BLOCKING (deferred, core change) and its NOTEs (band gap above the Payment divider, Reference no. hint above the input, orphan Email label, totals tax label wrap, "Price" vs "Rate") still show in these shots and are not repeated here.

Built: /Users/nas/tmp/tinycld/books/books/docs/plans/sales-receipt-form-evidence/cp4/. Reference: /Users/nas/tmp/tinycld/books/books/docs/plans/sales-receipt-form-reference/.

## State check

| shot | state shown | valid |
|---|---|---|
| errors-1280-light / dark | "New sales receipt" after Post refused; Reference no. red-bordered with the inline error "Reference no. can be at most 40 characters" (the `referenceTooLong` text, no longer core's "is too long") | yes |
| errors-phone-390-light / dark | same at 390, error under the stacked Reference no. cell | yes |
| draft-1280-light / dark | "Draft sales receipt" + Draft badge; line 2 holds its own description ("Federal and state return…"); the message sits in the Message textarea; memo filled | yes |
| draft-390-light / dark | same at 390, cards | yes |

INVALID: 0.

## Findings

### errors-1280 (light / dark)
- nothing found. The refusal sits under the red-bordered Reference no. input as §3.6 asks ("Reference no. refusals under those fields"), with the spec text. Red error text is legible on both schemes. Only the known previously recorded items remain.

### errors-phone-390 (light / dark)
- nothing found. The stacked cell keeps the error directly under its input, above Deposit to; nothing clips or wraps badly.

### draft-1280 (light / dark)
- nothing found. The line-2 description and message now live where the reference puts them (line description cell; Message to customer field). Titles, badge, stored Credit card / reference / 1200 Undeposited funds, totals with Total and Amount received, and the five action buttons match §3.3, §3.5, §3.6 and the reference. Different customer and amounts than the reference are fixture data, not a finding.

### draft-390 (light / dark)
- nothing found. The long reference value clips inside its input exactly as the reference does; cards, totals and the phone action bar (Cancel, Save draft, Post, More) read well in both schemes.

## For gate 3
- The errors shot still shows one refusal only (Reference no.); the reference shows Customer, Deposit to and Line 2 refusals together. Already recorded as a known gate-3 item in the first critique.

## Totals
CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE
