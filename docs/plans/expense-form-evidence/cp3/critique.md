# Gate 2 design critique: expense-form, checkpoint 3

Scope: the 19 shots of this checkpoint, 52 built files, each compared with the reference file of the same name. Data differences (vendors, refs, amounts, numbers, "Test User") are not findings.

Result: 0 INVALID, 1 BLOCKING, 7 NOTE.

## State check

All 52 built screenshots show the state their name says.

| Shot | Files | State shown | Verdict |
|---|---|---|---|
| new | 390, 1280 × light, dark | "New expense", Draft badge, empty band, one empty account line, Vendor focused | valid |
| new-card | 390, 1280 × light, dark | Paid from 2100 Company Card, balance line, Credit card, one account line $45.00 | valid |
| draft | 1280 × light, dark | "Draft expense", saved values, More in the bar | valid |
| correction | 390, 1280 × light, dark | "Edit 1004" / "Edit 1005" with the replace note | valid |
| errors | 390, 1280 × light, dark | duplicate check number refusal under Ref no. | valid (narrower than the reference, see N3) |
| no-lines | 1280 × light, dark | "Add at least one account or product line" under the account table | valid |
| no-pay-accounts | 1280 × light, dark | empty Paid from with the inline error | valid |
| conflict | 1280 × light, dark | conflict notice with "Load the current expense" | valid |
| phone-more | 390 × light, dark | More sheet with Post & new and Delete draft | valid |
| delete | 1280 × light, dark | "Delete this draft expense?" dialog | valid |
| posted | 390, 1280 × light, dark | read view, Posted badge, two account lines | valid |
| posted-card | 390, 1280 × light, dark | read view, account line and product line, both subtotals | valid |
| replaced | 1280 × light, dark | Void badge, "Voided by", "Replaced by 1010 (edited)" | valid |
| reader | 390, 1280 × light, dark | read view with View journal entry only (More on phone) | valid |
| loading | 1280 × light, dark | spinner | valid |
| error | 1280 × light, dark | "Books could not load this expense." with Retry | valid |
| not-found | 1280 × light, dark | "This expense does not exist" | valid |
| no-access | 1280 × light, dark | "You need bookkeeper access to create expenses" | valid |
| cannot-edit | 1280 × light, dark | "This expense cannot be edited" | valid |

## Findings

### BLOCKING

B1. new-390-light, new-390-dark, new-1280-light, new-1280-dark (also visible in no-pay-accounts-1280-light/dark): header band, Paid from and Payment method triggers — the two required selects are blank boxes with no placeholder text. The reference shows "Choose an account" in Paid from and "Choose a method" in Payment method. On the same screen the Account cell of the line shows "Choose an account" and Vendor shows "No vendor", so the two blank required fields look unfinished or disabled, mainly in dark mode where the box has almost no contrast. — BLOCKING (reference decision, new-390 and new-1280, light and dark: Paid from trigger "Choose an account", Payment method trigger "Choose a method").

Remark for no-pay-accounts: spec §3.3 says "the select is empty with the inline error", so a blank Paid from is permitted there. The reference still shows "Choose an account" in that state. One placeholder rule for both states is sufficient.

### NOTE

N1. new-*, new-card-*, draft-1280-*, correction-1280-*, errors-*, no-lines-1280-*, no-pay-accounts-1280-*, conflict-1280-*, delete-1280-*: Product and service details table — "No rows yet." shows under the empty table; the reference shows no text. — NOTE (known accepted deviation of core `TableField`, recorded as the brief requires).

N2. not-found-1280-light, not-found-1280-dark: page body — the message is plain text at the top left under the back link. The reference shows the message in the center with a "Back to journal entries" button and no back link. The build is the same as the merged bill screen (bill-form-reference and bill-form-evidence/cp3 not-found shots) and as the reference's own no-access and cannot-edit shots, and the spec says each behavior it does not restate is the bill's. — NOTE.

N3. errors-390-*, errors-1280-*: the built shots show only the Ref no. field refusal. The reference also shows the `FormErrorSummary` banner (close-date refusal) and a refusal under an account line. The appearance of those two is not in the built evidence. — NOTE.

N4. errors-390-*, errors-1280-*: Ref no. cell — the hint "Check number or card reference" stays above the error text; in the reference the error replaces the hint. Three lines of small text under one input at 1280. — NOTE.

N5. new-card-390-*, errors-390-*, errors-1280-*, draft-1280-*, correction-*, no-lines-1280-*, conflict-1280-*, delete-1280-*, posted-1280-*, posted-card-1280-*, replaced-1280-*, posted-390-*, posted-card-390-*: action bar — a button is in its hover state and its shortcut tooltip shows ("Save draft ⌘S", "Post ⌘↵", "Post & new ⌘⇧↵", "View journal entry j"; "More" tinted on the phone read view). On new-card-390 and errors-390 the tooltip covers part of the "Product and service details" heading or the "Add product line" button. This is a capture artifact (pointer left over the bar), not a design defect; move the pointer away before the shot. — NOTE.

N6. new-1280-* and every wide form shot: left edges — section headings start at x=340, the line table grid at x=342, the Memo field at x=344. The reference has 340 / 340 / 344. — NOTE.

N7. conflict-1280-dark: conflict notice — the "Load the current expense" button has a dark fill on the slate notice and a thin border, so it has less contrast than in light mode. Same as the reference. — NOTE.

## Per screenshot

- new-390-light, new-390-dark: B1, N1.
- new-1280-light, new-1280-dark: B1, N1, N6.
- new-card-390-light, new-card-390-dark: N1, N5.
- new-card-1280-light, new-card-1280-dark: N1.
- draft-1280-light, draft-1280-dark: N1, N5.
- correction-390-light, correction-390-dark: N5.
- correction-1280-light, correction-1280-dark: N1, N5.
- errors-390-light, errors-390-dark: N1, N3, N4, N5.
- errors-1280-light, errors-1280-dark: N1, N3, N4, N5.
- no-lines-1280-light, no-lines-1280-dark: N1, N5.
- no-pay-accounts-1280-light, no-pay-accounts-1280-dark: B1 (Payment method; see the remark for Paid from), N1.
- conflict-1280-light: N1, N5. conflict-1280-dark: N1, N5, N7.
- phone-more-390-light, phone-more-390-dark: nothing found.
- delete-1280-light, delete-1280-dark: N1, N5.
- posted-390-light, posted-390-dark: N5.
- posted-1280-light, posted-1280-dark: N5.
- posted-card-390-light, posted-card-390-dark: N5.
- posted-card-1280-light, posted-card-1280-dark: N5.
- replaced-1280-light, replaced-1280-dark: N5.
- reader-390-light, reader-390-dark: nothing found.
- reader-1280-light, reader-1280-dark: nothing found.
- loading-1280-light, loading-1280-dark: nothing found.
- error-1280-light, error-1280-dark: nothing found.
- not-found-1280-light, not-found-1280-dark: N2.
- no-access-1280-light, no-access-1280-dark: nothing found.
- cannot-edit-1280-light, cannot-edit-1280-dark: nothing found.

## Checked and correct

- Band: thirds at 1280 with the split at Payment method; full-width stack at 390 in Tab order.
- Balance line under Paid from, muted, in light and dark.
- Hints draw below their inputs (lesson 27).
- Big figure "Amount paid" top right (wide) and under the title (phone).
- Totals: subtotals only for a table with an amount, Total with a top border and semibold, no row after Total.
- Action bar order: wide — Cancel, Save draft, Post, Post & new, More; phone — Cancel, Save draft, Post, More.
- Read view: band with Vendor, Paid from, Payment date and the Payment row under a border; line tables; memo; "Posted by", "Voided by", "Replaced by".
- The conflict notice text follows the brief ("Load the current expense, then review it…"), not the reference text.

## For gate 3

Nothing visible.
