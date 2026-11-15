# Gate 2 design critique after the fix round: expense-form, checkpoint 3

Scope: the shots the fix changed (`new-*`, `no-pay-accounts-*`) and every shot that had finding N5 (hover tooltip) in the first critique (`critique.md`). 38 built files were viewed, and the 6 reference files of `new-*` and `no-pay-accounts-*`. Data differences are not findings.

Not viewed in this round (no finding to check, not changed by the fix): `phone-more-*`, `reader-*`, `loading-*`, `error-*`, `not-found-*`, `no-access-*`, `cannot-edit-*` (14 files). Their state check and N2 (`not-found`) stay as recorded in `critique.md`.

Result: 0 INVALID, 0 BLOCKING, 6 NOTE (1 new, 5 carried).

## State check

All 38 viewed screenshots show the state their name says.

| Shot | Files viewed | State shown | Verdict |
|---|---|---|---|
| new | 390, 1280 × light, dark | "New expense", Draft badge, empty band with placeholders, one empty account line, Vendor focused | valid |
| no-pay-accounts | 1280 × light, dark | Paid from with no account and the inline error "Add a bank or credit card account to the chart of accounts" | valid |
| new-card | 390, 1280 × light, dark | Paid from 2100 Company Card, balance line, Credit card, one account line $45.00 | valid |
| draft | 1280 × light, dark | "Draft expense", saved values, More in the bar | valid |
| correction | 390, 1280 × light, dark | "Edit 1004" / "Edit 1005" with the replace note | valid |
| errors | 390, 1280 × light, dark | duplicate check number refusal under Ref no. | valid |
| no-lines | 1280 × light, dark | "Add at least one account or product line" under the account table | valid |
| conflict | 1280 × light, dark | conflict notice with "Load the current expense" | valid |
| delete | 1280 × light, dark | "Delete this draft expense?" dialog | valid |
| posted | 390, 1280 × light, dark | read view, Posted badge, two account lines | valid |
| posted-card | 390, 1280 × light, dark | read view, account line and product line, both subtotals | valid |
| replaced | 1280 × light, dark | Void badge, "Voided by", "Replaced by 1010 (edited)" | valid |

## Fix check

- **B1 (blank Paid from / Payment method triggers): FIXED.** `new-390-light`, `new-390-dark`, `new-1280-light`, `new-1280-dark`: Paid from shows "Choose an account" and Payment method shows "Choose a method", as the reference. `no-pay-accounts-1280-light`, `no-pay-accounts-1280-dark`: the same two placeholders, with the inline error under Paid from, as the reference.
- **N5 (hover tooltip in the shot): FIXED.** No tooltip and no hovered button in `draft-1280-*`, `errors-390-*`, `errors-1280-*`, `posted-390-*`, `posted-1280-*`, `posted-card-390-*`, `posted-card-1280-*`, `replaced-1280-*`, `new-card-390-*`, and also none in `correction-390-*`, `correction-1280-*`, `no-lines-1280-*`, `conflict-1280-*`, `delete-1280-*`, `new-card-1280-*`. "More" on the phone read view is not tinted. The "Product and service details" heading and the "Add product line" button are no longer covered on `new-card-390-*` and `errors-390-*`.

## Findings

### BLOCKING

None.

### NOTE

N8 (new). new-390-light, new-390-dark, new-1280-light, new-1280-dark, no-pay-accounts-1280-light, no-pay-accounts-1280-dark: header band, Paid from and Payment method triggers — the placeholders "Choose an account" and "Choose a method" draw in the foreground color, the same as a picked value ("1000 Business Checking", "Check"). On the same screen "No vendor" and the line's "Choose an account" are muted. The reference draws them the same way as the build, so this is not a lost decision. — NOTE.

Carried from `critique.md`, seen again, no change:

N1. new-*, new-card-*, draft-1280-*, correction-1280-*, errors-*, no-lines-1280-*, no-pay-accounts-1280-*, conflict-1280-*, delete-1280-*: "No rows yet." under the empty Product and service details table. — NOTE (known accepted deviation of core `TableField`).

N3. errors-390-*, errors-1280-*: only the Ref no. field refusal shows; the reference also shows the `FormErrorSummary` banner and a line refusal. — NOTE.

N4. errors-390-*, errors-1280-*: Ref no. cell — the hint stays above the error text. — NOTE.

N6. Every wide form shot: left edges of the section headings (x=340), the line grid (x=342) and the Memo field (x=344) differ by 2 to 4 px. — NOTE.

N7. conflict-1280-dark: "Load the current expense" button has low contrast on the notice. Same as the reference. — NOTE.

## Per screenshot

- new-390-light, new-390-dark: N1, N8.
- new-1280-light, new-1280-dark: N1, N6, N8.
- no-pay-accounts-1280-light, no-pay-accounts-1280-dark: N1, N6, N8.
- new-card-390-light, new-card-390-dark: N1.
- new-card-1280-light, new-card-1280-dark: N1, N6.
- draft-1280-light, draft-1280-dark: N1, N6.
- correction-390-light, correction-390-dark: nothing found.
- correction-1280-light, correction-1280-dark: N1, N6.
- errors-390-light, errors-390-dark: N1, N3, N4.
- errors-1280-light, errors-1280-dark: N1, N3, N4, N6.
- no-lines-1280-light, no-lines-1280-dark: N1, N6.
- conflict-1280-light: N1, N6. conflict-1280-dark: N1, N6, N7.
- delete-1280-light, delete-1280-dark: N1.
- posted-390-light, posted-390-dark: nothing found.
- posted-1280-light, posted-1280-dark: nothing found.
- posted-card-390-light, posted-card-390-dark: nothing found.
- posted-card-1280-light, posted-card-1280-dark: nothing found.
- replaced-1280-light, replaced-1280-dark: nothing found.

## For gate 3

Nothing visible.
