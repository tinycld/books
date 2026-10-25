# Checkpoint 8 gate 2 critique (first pass)

State check: all shots VALID. Seeded posted entry "Entries seed posted" (JE-10, $800.00, 1000 Business Checking debit / 3000 Owner's Equity credit) opened from the list with typeSearch + pressText. No dialog was confirmed, so the seeded entry is not mutated (the e2e database is recreated on each run anyway). Shots: posted-1280-light/dark, posted-390-light, reverse-1280-light/dark, reverse-390-light/dark, void-1280-light, edit-1280-light, edit-390-light. Capture needed one spec extension: step `{ button: <name> }` (the wide Void and Reverse buttons have no testID and are buttons, not menu items). Manifest uses `afterReady: entry-read-only` because a posted entry does not render `entry-screen`.

Reference caveats: the reference shows JE-1050 (long memo, auto-reverse set, line memos), so content differs on purpose. The reference reverse dialog shows a closed-books refusal state with date 2026-09-30; the built shot is the fresh dialog. The reference void-1280-light is a voided entry (JE-1049, no action bar), not the confirm dialog; no reference for the Void dialog exists. A voided-entry view cannot be captured without mutating the seed.

Posted view, 1280 light (reference in brackets):
- Header: title "Journal entry JE-10" y 70, Posted badge x 529-585 [badge x 592-649, y 67]; total "$800.00" right edge 1264 [1264]. Header rule y 96 [100]: 4 px shorter (single-row title, reference title baseline y 73).
- Meta: Date/Auto-reverse on/Posted by at y 120/138 [124/145]; columns packed (x 340/449/565) vs reference wider gaps (340/524/722). NOTE, content-driven (shorter values, auto-sizing columns).
- Lines grid: rows y 279/323 [264/308]; header # / Account / Debit / Credit / Memo present. Row rules run to x 1280 and the first rule from x 324 (full bleed), where the reference stops at 340-1264 gutters. NOTE: 16 px side inset missing on the line rules/grid header.
- Totals strip y 703-740, text right edge 1264 [same]. Action bar y 740-800 directly below the strip [same]: Void 1044-1105, Reverse 1115-1198, Edit 1207-1264, 44 px tall, order Void, Reverse, Edit [identical]. Edit is the filled teal primary; Void and Reverse are outline. Exact match.
- Dark 1280: identical layout; bar, strip, badge and teal Edit use tokens, no raw colours. Matches reference dark.

Posted view, 390 light:
- Header: title, Posted badge and total on one row (y 70) [reference wraps title/badge/total onto 2 rows because the title is longer; short JE-10 fits]. Meta stacked in two rows. Lines as two-row cards with "Dr"/"Cr" suffix [same pattern; no line memo since the seed has none].
- Totals strip y 691-728; action bar y 728-790: More 243-309, Edit 317-374 (44 px), More outline and Edit filled teal; right-aligned, same positions as reference (More 243-309, Edit 317-374). Exact match. Tab bar below, as reference.

Reverse dialog:
- 1280 light: centred dialog x 460-820 (360 wide) [same], title "Reverse JE-10" (x 481, y 265), fields "Reversal date" (hint "Not before the entry date") and "Memo" prefilled "Reversal of JE-10", footer Cancel + teal "Reverse entry" (x 697-799) [same]. Date default 2026-11-01: matches the spec (first day of the month after the entry; entry dated today 2026-10-25). Reference shows 2026-09-30 because its entry is in a closed period; not comparable. Date field has a focus ring (autofocus), reference does not; NOTE.
- Missing X close button at 1280 (reference shows X at x 793, y 219). `hasCloseButton={false}` in ReverseDialog. NOTE: Cancel closes it; also backdrop. The phone sheet does show an X (see below), so the two widths are inconsistent.
- Error placement: no refusal can be provoked for the fresh entry, so the in-dialog error box (reference: red bordered box between Memo and footer) is not captured. Component `RefusalSummary` sits in `Dialog.Body` after Memo, the same slot. Not verifiable from a screenshot; covered by e2e/unit per plan.
- Dark 1280: dark panel, same layout, teal button, focus ring light blue; no raw-colour issues.
- 390 light/dark: bottom sheet y 452-790 with grabber, title "Reverse JE-10" + X at x 364, date + memo fields, footer Cancel + "Reverse entry" (x 268-371) [same as reference]. Sheet sits above the tab bar, fields 350 wide. VALID. Matches reference layout.

Void dialog, 1280 light:
- Centred dialog x 460-820, title "Void JE-10?", text "A reversing entry is posted in the original period. The number is kept." (matches the plan text), footer Cancel + red "Void entry" (x 717-799). No X, no fields, as intended. No reference to compare; consistent with the Delete draft dialog from cp7.

Edit replacement form (`entries/new?replaces=<id>`):
- 1280: title "Edit JE-10" with grey "Draft" badge, total "$800.00" right-aligned (1264). Note line under the header rule, y 119: "Posting this replaces JE-10 under the same number. The original is voided." (matches the plan text). Fields prefilled: Date 2026-10-25, memo "Entries seed posted", lines 1000 Business Checking $800.00 debit, 3000 Owner's Equity $800.00 credit. Totals strip + bar Cancel, Save draft, Post & new, Post as for a new entry.
- 390: same note wraps to 2 lines, fields stacked, action bar Cancel, Save draft, Post, More (as cp6).

BLOCKING: none.

NOTE items:
1. Edit form shows Journal no. "Assigned when posted" while the note says the replacement keeps the same number. Contradictory; minimal fix: show "JE-10" (disabled) in the Journal no. box when `replaces` is set. Low risk, optional; needs no user decision.
2. Edit form badge reads "Draft" for a replacement. Spec does not require a different label; acceptable.
3. ReverseDialog hides the X at 1280 but the phone sheet shows it; the reference shows X at both. Minimal fix: remove `hasCloseButton={false}` (or confirm it is deliberate). Optional.
4. Reverse date field autofocus ring at 1280 (reference none). Optional.
5. Posted view lines grid/rules run full bleed (no 16 px inset); reference insets to 340-1264. Carried over from cp5/cp6 grid notes; optional.
