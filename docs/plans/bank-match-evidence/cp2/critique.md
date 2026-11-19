# Gate 2 critique — bank-match, checkpoint 2 (Row marks and drawer match), after fix round 1

Read: 48 built shots (all captured again), 48 reference shots, the brief, the spec, the lessons, memories-design.md, the capture notes, the earlier critique.

Result: **0 INVALID, 0 BLOCKING, 6 NOTE**

## Earlier findings

- **B1 (reader saw the totals line) — fixed.** The four read-only shots end the Match section after the link row. No totals line, no refusal line, no box, no button. This agrees with the reference and with the spec ("A reader sees the suggestions as a list with links, with no boxes and no buttons.").
- **B2 (table wider than its panel with the inline drawer open at 1280) — fixed.** In each 1280 drawer shot the For review list is now cards (the panel is about 490 px wide, below the table minimum of 720). Each card shows its amount, the row highlight has the full panel width, and nothing is cut at the right edge of the list. This differs from the reference, which shows a table cut after DESCRIPTION. That is not a finding: the reference lost the Spent and Received columns there, and the rule ("A table never scrolls sideways … or switch to cards at the table's own minimum width") decides.
- **review-1280 INVALID — fixed.** The two shots now show the PACIFIC POWER AUTOPAY row with its mark.

## Findings that apply to more than one shot

- **N1 — each 1280 shot with the drawer open (drawer, drawer-many, drawer-over, drawer-none, drawer-long, drawer-loading, drawer-error, drawer-sending, drawer-refused, read-only; light and dark): toolbar above the list — the search field is cut to "Search descriptic" and the "All transactions" select has no right border (it is cut at the panel edge). The list below is now in its card layout, but the toolbar keeps its wide layout (at 390 the search field has its own line). The reference shows the same cut; the toolbar is from p4-for-review. — NOTE**
- **N2 — each writer drawer shot: option row, line 1 — the type-and-number link has regular weight; the reference shows medium weight, which separates it more from line 2. The spec gives only `text-sm text-primary`. — NOTE**
- **N3 — review-390 (light, dark): Pacific card, line 2 — the mark is cut to "1 match · Exp…", so the Books transaction cannot be read on a phone card. The spec permits it ("one line, ellipsis") and the reference shows the same cut. — NOTE**
- **N4 — drawer-sending (4 shots): "Matching…" button, left of the text — the spinner is almost not visible on the disabled primary button. Same in the reference; core `ButtonSpinner`. — NOTE**
- **N5 — drawer-refused (4 shots): between the totals line and the refusal — the gap is about 12 px; the reference puts the refusal directly below the totals (about 4 px), which ties the message to the totals. — NOTE**
- **N6 — read-only-390 (light, dark): account panel heading, behind the sheet — "1000 Business Checking" wraps to 2 lines because "View register" is beside it. The reference has the heading on 1 line. The heading is not part of this checkpoint. — NOTE**
- Not a finding: the "Reconnecting…" pill in drawer-over-1280-dark. It comes from the capture (realtime cut for the fake reads).
- Not a finding: the amount of an option row is on line 1 (the reference centres it on the 2 lines). The brief settles this (difference 1).
- Not a finding: the "+" button at 390 covers a part of an amount in review-390 (the reference shows the same; core chrome).
- Not a finding: the second account card is "2100 Company Card" (seed) where the reference has 1010 Business Savings.

## Per screenshot

### review
- review-390-light — state check: valid (For review cards; the Pacific card shows the check and "1 match · Exp…"). N3.
- review-390-dark — valid. N3. The check and the primary text are legible on dark.
- review-1280-light — valid (table; the Pacific row shows the check and "1 match · Expense 1002 · Oct 5, 2026" in primary on one line, in place of the memo; $138.37 in SPENT; no action cell, no button). Agrees with the reference. Nothing found.
- review-1280-dark — valid. Nothing found.

### drawer
- drawer-390-light — valid (one option, box checked, "Chosen $138.37 of $138.37", Match enabled). N2.
- drawer-390-dark — valid. N2.
- drawer-1280-light — valid; the list is cards and the Pacific card shows "Oct 6, 2026 · ✓ 1 match · Expense 1002" in full. N1, N2.
- drawer-1280-dark — valid. N1, N2.

### drawer-many
- drawer-many-390-light — valid (3 options, none checked, "Difference $138.37" in danger, Match disabled). N2.
- drawer-many-390-dark — valid. N2. The danger text is legible on dark.
- drawer-many-1280-light — valid; the card shows the "3 matches" chip with the warning border and triangle. N1, N2.
- drawer-many-1280-dark — valid. N1, N2.

### drawer-over
- drawer-over-390-light — valid (2 boxes checked, "Chosen $153.87 of $138.37", "Difference $15.50", Match disabled). N2.
- drawer-over-390-dark — valid. N2.
- drawer-over-1280-light — valid. N1, N2.
- drawer-over-1280-dark — valid. N1, N2.

### drawer-none
- drawer-none-390-light — valid ("Books found no transaction of $12,843.10 near Oct 12, 2026." and Find other matches). Nothing found.
- drawer-none-390-dark — valid. Nothing found.
- drawer-none-1280-light — valid. N1.
- drawer-none-1280-dark — valid. N1.

### drawer-long
- drawer-long-390-light — valid (description wraps to 2 lines; option line 2 ends with an ellipsis). N2.
- drawer-long-390-dark — valid. N2.
- drawer-long-1280-light — valid; the card description ends with an ellipsis and the mark stays on one line. N1, N2.
- drawer-long-1280-dark — valid. N1, N2.

### drawer-loading
- drawer-loading-390-light — valid (spinner in the section, fields above stay). Nothing found.
- drawer-loading-390-dark — valid. Nothing found.
- drawer-loading-1280-light — valid; the Pacific card has no mark. N1.
- drawer-loading-1280-dark — valid. N1.

### drawer-error
- drawer-error-390-light — valid ("Books could not load the matches." with Retry). Nothing found.
- drawer-error-390-dark — valid. Nothing found.
- drawer-error-1280-light — valid. N1.
- drawer-error-1280-dark — valid. N1.

### drawer-sending
- drawer-sending-390-light — valid ("Matching…", box, Find other matches and Exclude disabled). N2, N4.
- drawer-sending-390-dark — valid. N2, N4.
- drawer-sending-1280-light — valid. N1, N2, N4.
- drawer-sending-1280-dark — valid. N1, N2, N4.

### drawer-refused
- drawer-refused-390-light — valid (refusal in danger below the totals, drawer open, box checked). N2, N5.
- drawer-refused-390-dark — valid. N2, N5.
- drawer-refused-1280-light — valid. N1, N2, N5.
- drawer-refused-1280-dark — valid. N1, N2, N5.

### read-only
- read-only-390-light — valid (link row with amount; no box, no totals, no Match, no Find, no Exclude). N6.
- read-only-390-dark — valid. N6.
- read-only-1280-light — valid; the cards have no check box and the Pacific card shows its mark. N1.
- read-only-1280-dark — valid. N1.

### matched-done
- matched-done-390-light — valid ("Matched 1 transaction." below the toolbar, For review (8), Pacific card gone). Nothing found.
- matched-done-390-dark — valid. Nothing found.
- matched-done-1280-light — valid (result line, For review (8), table with Spent and Received). Nothing found.
- matched-done-1280-dark — valid. Nothing found.

## For gate 3

- N1: check in the browser if the toolbar row scrolls sideways or is only cut when the inline drawer is open at 1280.
- Reader: the totals line is gone from the screen. Check that `useBankMatch` also does not seed or keep a choice when `canWrite` is false.
