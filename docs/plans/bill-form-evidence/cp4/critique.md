# bill-form checkpoint 4 — gate 2 design critique

Scope: the read view for void and reader, and the correction form, as checkpoint 4 delivers them. Checkpoint 3 notes N1–N8 are not raised again unless worse. Measurements are read from the screenshots and are approximate.

Result: 0 INVALID, 0 BLOCKING, 5 NOTE.

## void-1280-light.png / void-1280-dark.png

State check: VALID. Bill 1004 with the Void badge, "Posted by" and "Voided by" lines, actions Copy and View journal entry only (spec §3.8 "Writer on a void bill: Copy, View journal entry"). The bill was made in the capture (Summit IT Services, one account line, one product line), so it has no mailing address and no vendor's bill no.; the reference bill has both.

- void-1280 (both): below the totals — "Posted by" and "Voided by" are drawn under the totals block, at the left. The reference puts them directly under Memo, beside the totals. This is the wide form of N8 (order of memo, totals, posted-by). No rule names the position — NOTE
- void-1280 (both): totals block — the rule above Total runs to about x=1203; the amounts end at about x=1191. Same defect as N7, now seen on the read view (N7 named the form only) — NOTE

Already recorded, not worse: N5 ("Due Dec 13, 2026" under the label "Due date").

Light and dark: legible, no contrast problem.

## correction-1280-light.png / correction-1280-dark.png

State check: VALID. Title "Edit 1005", Draft badge, the replace note, Vendor has focus, both line tables with one line each, bar Cancel / Save draft / Post / Post & new. The reference shows the "Accounts only" setting of checkpoint 5; both tables are correct here in each case, because the bill has product lines.

- correction-1280 (both): action bar — a "Cancel Esc" tooltip is drawn above Cancel, and Cancel is in its hover state. The pointer was on the button at capture. The reference has no tooltip. Capture artifact, not a build defect; a recapture with the pointer off the bar gives a clean shot — NOTE

Already recorded, not worse: N1 (band divider and height), N3 (three left edges: headings 340, table header text 355, memo 344), N7 (rule above Total to 1213, amounts end 1201).

Checked and correct: Amount column ends at the same x in both tables (about 1201) and the totals align under it (spec §7). Light and dark: legible.

## reader-390-light.png / reader-390-dark.png

State check: VALID. Bill 1002, Posted badge, read-only read view, one "More" button in the bar (same as the reference). Account and product line cards show.

- reader-390 (both): bottom of the shot — the shot is one viewport (1100 px) and the bill is longer. The third product card is cut by the action bar; the totals, Memo and "Posted by" are not in the shot. Gate 2 did not judge that part of the reader's phone view (N8 covers its order for the writer's view). A full-page or scrolled shot is necessary to judge it — NOTE

Already recorded, not worse: N5 ("Due Oct 31, 2026").

Checked and correct: band order Vendor, Mailing address, Terms / Bill date / Due date, Vendor's bill no., as the reference. Cards: number and name left, amount right, description and "qty × rate" below. Negative amount is legible. Light and dark: legible, card borders show in dark.

## reader-1280-light.png / reader-1280-dark.png

State check: VALID. Bill 1002, Posted badge, only "View journal entry" in the bar (spec §3.8 "Reader: View journal entry only"). The sidebar has no "New" button, which is correct for a reader.

- reader-1280 (both): Product and service details, Description column — the column is about 290 px wide (x=569 to about 860), with about 70 px unused before Qty. The long description takes 5 lines and the first description wraps to 2 lines. The Account details Description column is about 430 px. No rule gives the width — NOTE
- reader-1280 (both): totals block — the rule above Total runs to about x=1203, the amounts end at about x=1191 (same NOTE as void-1280; counted once).

Already recorded, not worse: N5 ("Due Oct 31, 2026"). At this width the four detail values fit one row; "OSW-INV-558213" ends about 6 px from the band's inner edge.

Checked and correct: both tables read-only with their headings; "Account lines", "Products and services", Total, Balance due align under Amount; Memo and "Posted by" show. Light and dark: legible.

## For gate 3

None visible.
