# cp4 design critique (gate 2): Hints, finish and statement edits

Read: 44 built files and 44 reference files (11 shots, 390 and 1280, light and dark), the brief, the spec, the lessons, `memories-design.md`, `capture.json`, `cp4-capture.md`.

Result: 0 INVALID, 0 BLOCKING, 5 NOTE.

## State check

All 44 built files show the state of their name.

| Shot | Shows | Valid |
|---|---|---|
| work | Work screen in progress, difference $15.00, one-transaction hint with Show, header actions (1280), Finish bar with reason (390) | yes |
| hints | First hint (For review) with "Open Banking" and "1 more" | yes |
| hints-open | Second hint (divides by 9) open under the first, "Show less" | yes |
| balanced | Difference $0.00, "Balanced. Finish to record this reconciliation.", Finish enabled, no reason text | yes |
| finishing | "Finishing…" on the button, list and toolbar dimmed | yes |
| edit-info | "Edit statement information" with the stored balance and date (sheet at 390, dialog at 1280) | yes |
| discard | "Discard this reconciliation?" with "The 1 cleared mark of this statement is removed. No transaction changes." | yes |
| finished | Finished summary with the "Reconciled" badge, the block, the line and the two buttons | yes |
| read-only | No header actions, no Finish bar, hint without Show, check marks in place of boxes | yes |
| card | Credit card account: Charges / Payments tabs and headers. No hint line (no hint applies to this data; the reference data has one) | yes |
| not-found | "This reconciliation does not exist." with the back link | yes |

## Findings

### work, hints, hints-open, card (1280, light and dark)
- work-1280, hints-1280, hints-open-1280, card-1280: header — the reason line "The difference must be $0.00 to finish." makes the header 14 px taller than in balanced-1280 and finishing-1280. The title moves from y≈80 to y≈87 and the band from y≈126 to y≈140. All content below the header moves when the difference becomes $0.00. The reference has no reason line on wide (the plan added it), so the reference gives no decision. A fixed header height (space kept for the reason line) removes the movement. — NOTE

### hints, hints-open (390, light and dark)
- hints-390, hints-open-390: hint line — the action row ("Open Banking", "1 more" / "Show less") has a tall gap above and below it (about 43 px between text baselines, 22 px in the hint text). With one action (work-390) the action is at the right of the text, with two it is on its own row. The reference shows the same layout. — NOTE

### hints-open (1280 dark)
- Not confirmed: the capture report says the disabled Finish label is pink/red in hints-open-1280-dark. At the size I can view, the label looks the same grey as in hints-1280-dark. Not counted. Examine the file at full size.

### work-390, read-only, balanced, card-390, not-found, finished
- nothing found. Structure, hierarchy and states agree with the reference. The finished block has each item of the spec. In finished-390 the badge is on the title line (the reference puts it below a longer title); this is correct.

### finishing (390 and 1280, light and dark)
- finishing-*: Finish button — the `ButtonSpinner` is almost invisible on the dimmed primary button. At 390 it is below the label's line (y≈762, label y≈755), not at the left of the label. The reference has the same defect. — NOTE

### edit-info
- edit-info-1280 (light and dark): dialog header — no close (X) control. The reference edit-info-1280 has it, and built edit-info-390 has it. Cancel is available, so no path is lost. — NOTE
- edit-info-390: nothing found.
- The dialog does not name the account. The reference does not name it. Not a finding.

### discard
- discard-390-dark, discard-1280-dark: "Discard" button — dim, low-saturation red; it reads as disabled next to the light version. The reference dark is the same (core `ConfirmDialog`). — NOTE
- discard-390-light, discard-1280-light: nothing found.

## Not findings (settled or outside this checkpoint)
- card-1280: the band's second line wraps to three lines when statement totals are entered. Settled difference 7, and the reference wraps the same way. The band is not in this checkpoint's Delivers line.
- read-only-1280: the sidebar has no New button (reader). Shell behavior.
- No table or grid scrolls sideways in a captured width.

## For gate 3
- finishing-1280 and finishing-390: "Finish later" and the More menu stay enabled while the finish is sent; Edit info is disabled. Spec text names only the list as disabled. Check that Finish later or Discard during the write cannot leave a wrong state.

CRITIQUE: 0 INVALID, 0 BLOCKING, 5 NOTE
