# Checkpoint 7 gate 2 critique (first pass)

State check: all shots VALID. The seeded draft "Entries seed draft" opened from the list by typing its memo into `entries-search` and pressing the row. Shots: draft-1280-light/dark, draft-390-light, draft-lines-1280-light, draft-lines-390-light, draft-menu-1280-light, draft-menu-390-light (recaptured with a wait for the open menu), draft-delete-1280-light, draft-delete-390-light. Capture needed a spec extension (fields `typeSearch`, `finalReady`, step `menuItem`, step `waitText`; a shot with one width sets that viewport before login). The 1280 draft-lines shot is identical to draft-1280 because the page fits the viewport (scrollTo is a no-op there). Reference for comparison: new-1280/390-light, new-lines-390-light (reference state has 3 lines, an auto-reverse date and a longer memo, so content differs on purpose).

Measurements (1280 light; reference in brackets):
- Header: title "Journal entry" + Draft badge (x 491-538) [badge at 540-586, title "New journal entry"]. Title/badge row y 85 [73]; header rule y 112 [100]; the header is 12 px taller. Date label y 151 [127] (24 px lower).
- Big total: right edge 1208 [1264]. More button (44 px target, dots at x 1242) occupies 1220-1264, so the total moved 56 px left. No overlap; right edge of the More button 1264 matches the reference right edge of the total and of the totals strip (1264).
- Journal no.: "Assigned when posted" in a grey disabled box, x 652-952, as reference.
- Totals strip y 703-740, text right edge 1264 [same]. Action bar y 740-800: Cancel 895-973, Save draft 981-1081, Post & new 1089-1195, Post 1203-1264. All match reference.
- Lines: seeded draft shows two populated lines: 1 "6100 Rent" debit $250.00; 2 "1000 Business Checking" credit $250.00. NOTE: the task brief said checking debit / equity credit; the real seed is rent debit / checking credit $250.00 each. Totals "Debits $250.00, Credits $250.00, In balance". Correct and consistent. No blank third line (reference has one; a loaded draft correctly adds none).
- Line grid header y 434 [398]; column offsets differ from reference as already noted in cp5 (account col starts x 384 [396]; memo col wider). Not part of cp7.
- Add line link y 595 [601].
- Dark 1280: tokens consistent (dark panel, teal Post, green In balance, grey Journal no. box), no raw-colour defects.

Measurements (390 light):
- Header: title on row 1 (y 72), Draft badge wraps to row 2 (x 16-62, y 107), big total on row 2 right-aligned, right edge 318, More dots x 352 (target 330-374). Header rule y 130 [100]; 30 px taller. Reference keeps title, badge and total on a single row (badge at x 216-262, total right edge 374). Date label y 169 [127]: 42 px lower, so less grid visible above the action bar.
- Totals strip y 693-728 and action bar 737-781 as reference. Buttons: Cancel 16-94, Save draft 112-212, Post 229-290, More 307-374 (reference Save draft 102-204, Post 214-300; the narrow Post is the known cp6 NOTE).
- FAB: not visible in any 390 shot (hidden). OK. The mobile tab bar shows (Books active).
- Lines at 390 (draft-lines): two stacked cards, "6100 Rent" with Debit $250.00, "1000 Business Checking" with Credit $250.00; card layout matches reference new-lines-390 (account + kebab, Debit/Credit pair, memo). Add line link y 668; totals strip right below.

Menu and dialog:
- 1280 menu: popover under the More button, right-aligned to x 1265, one item "Delete draft" in destructive red, y 105-146. It overlaps the Auto-reverse label slightly (y 151 label; menu bottom 146) with no clash. VALID.
- 390 menu: a top-anchored sheet titled "Entry actions" with one item "Delete draft" in red and a close X; the grabber sits at the bottom of the sheet and the sheet slides from the top. NOTE: placement is the shared Menu's phone behaviour, but a top sheet with a bottom grabber looks odd; no reference exists. Item text is indented 50 px from the title (x 70 vs 20).
- Delete dialog 1280: centred dialog "Delete this draft?", body "The draft and its lines are deleted. This cannot be undone.", Cancel and a red Delete draft button. 390: bottom sheet with the same content, Delete draft button red. Both VALID and readable; no reference exists.

## Findings
- BLOCKING? (header height, both sizes, new element): the More button added to the header makes the big total sit 56 px left of the reference right edge and, at 390, forces the Draft badge onto a second row (header 130 px vs 100 px; form starts 42 px lower). The More button itself is required (it holds Delete draft), so this is a deliberate difference. Minimal fix for 390: shrink the title row so title, badge, total and More fit on one row (title text-xl, badge inline, reduce More to 36 px wide with negative right margin), or accept the two-row header and update the reference. USER DECISION: accept two-row header at 390 or compact it. At 1280 the 12 px extra height and the 56 px shift are acceptable (NOTE): the More button right edge equals the reference total right edge.
- NOTE (title text): "Journal entry" for an existing draft vs "New journal entry" for new, as the brief states. Matches.
- NOTE (seed lines): rent debit / checking credit, not checking debit / equity credit as the brief said. Totals correct.
- NOTE (390 menu sheet): top-anchored sheet with bottom grabber; comes from the shared Menu component, so no change in books. Flag only.
- NOTE (390 Post width 61 vs 86 px): remains from cp6.
- NOTE (1280): the sidebar still shows "+ New" and "Journal Entries" (cp2); the reference shows neither. Not part of cp7.
- NOTE: line grid column offsets (cp5) remain.

BLOCKING: none that is a defect. One decision needed: the 390 two-row header (see above).
