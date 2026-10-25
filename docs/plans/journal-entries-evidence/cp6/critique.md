# Checkpoint 6 gate 2 critique (first pass)

State check: all 4 shots VALID. Shots: new-unbalanced-1280-light/dark, new-unbalanced-390-light/dark. Each is the filled entry (date 2026-10-31, auto-reverse 2026-11-01, memo "Accrue October wages", debit $400.00, credit $350.00 on seeded accounts 1000 / 3000), taken after pressing Post (scratch spec step `{press:"entry-post"}`, no spec change needed). Red alert above the form, action bar at the bottom, totals strip above it. The 390 shots are top-of-page, as in the reference. No line-level error is shown in either reference or build.

Measurements (1280, light; reference in brackets):
- Totals strip: y 703-740 [702-740]; text right edge 1264 [1264]. Match.
- Action bar: y 740-800; Cancel x 895-973 [895-973]; Save draft 981-1081 [981-1081]; Post & new 1089-1195 [1089-1195]; Post 1203-1264 [1203-1264]. Order, size, gaps match. Button height 40 both.
- Alert: build y 113-187 (74 px), black 1 px border, red title (bold) plus red 12 px message. Reference y 118-154 (36 px), red border, red 14 px message only. Header-to-alert gap 13 px [18]. Form content starts 48 px lower than reference (Date label y 225 [177]).
- 390: strip y 665-728 [665-728] match. Buttons y 737-781: Cancel 16-94 [16-94], More 307-374 [307-374]. Middle buttons differ: Save draft 112-197 (85 px) [102-204 (102 px)], Post 229-290 (61 px) [214-300 (86 px)]. Alert y 114-202 (88 px) [118-176 (58 px)].
- Dark: tokens consistent; alert title and message use the dark red, button and strip colours match reference.

## Findings
- BLOCKING (alert border colour, all 4 shots): reference border is red (same hue as the message). Build border is near-black in light and white in dark (neutral foreground border). Fix: pass a destructive border class to FormErrorSummary (or the build wrapper), e.g. `border-destructive`, if the component accepts className; otherwise wrap it.
- BLOCKING? (alert title, all 4 shots, deliberate difference): build adds the title "This entry cannot be saved yet" above the message. Reference shows only the message. Effect: alert 74 px vs 36 px (88 vs 58 at 390), pushes the form down 48 px (30 at 390) so less of the grid is visible above the bar on a phone. Judged BLOCKING for fidelity but low risk. Minimal fix: option A, give FormErrorSummary an optional `title` prop (hide the title when omitted) in core. That needs core sign-off. Option B: accept the title and update the reference. User decision needed; do not hide the title with CSS.
- BLOCKING (Post and Post & new enabled when unbalanced, deliberate difference, needs a USER DECISION): reference greys both (Post at 40% tint, Post & new grey text and border, 1280 and 390). Build shows both fully enabled. Option 1 (matches reference): disable Post and Post & new while out of balance; then a user cannot press Post to see the error, so the alert would have to show on the unbalanced state without a press (it is the reference state "new-unbalanced"; the cp5 critique already flagged the missing alert), and the plan's e2e that presses Post to show the error must change. Option 2 (keep): keep buttons enabled, treat the press as the trigger, update the reference and the manifest. Disabled buttons with no stated reason are weaker accessibility, so option 2 is defensible. Decision belongs to the user.
- NOTE (390 button widths): build middle buttons are narrower (Save draft 85 px, Post 61 px) than reference (102, 86), because the reference Post has more padding or a min width. Cancel and More match. Minimal fix: same min-width or horizontal padding on the primary Post as the reference (about 86 px).
- NOTE (390): the action bar sits above the mobile tab bar (y 737-781, tab bar 790+), as in reference. The cp2 New FAB is no longer visible in these shots (hidden or covered), which resolves the cp5 FAB note for this state.
- NOTE (1280): the sidebar still shows "+ New" and "Journal Entries" (cp2); the reference shows neither. Not part of cp6.
- NOTE (1280): the blank third line and the line grid column and rule differences from cp5 remain; not part of cp6.
- NOTE: line error placement could not be compared: neither the reference nor the build marks a line in this state.

BLOCKING: alert border colour (clear fix). Needs a user decision: Post/Post & new disabled state, and the alert title.

## Second pass (after core FormErrorSummary title/variant, PR tinycld#374)

State check: all 4 shots VALID (recaptured, same filled entry, same Post press; alert visible, action bar and totals strip present, 390 shots top-of-page). Dark shots use the dark red for border and text.

Re-measured (light; reference in brackets):
- Alert height: 1280 38 px, y 113-150 [38 px, y 117-154]; 390 58 px, y 113-170 [58 px, y 117-174]. Heights match. (The first pass quoted 36 and 58 from the brief; pixel rows show 38 at 1280 for both.) Message-only, no title.
- Alert border colour: rgb(225,29,72), same as reference. Red in light and dark.
- Form offset: Date label at y 177 [177] at 1280; 390 Date label y 197 [197]. Offset 0 (was 48 / 30). The alert box itself sits 4 px higher than reference (113 vs 117); a small difference below the alert, absorbed in the gap. Not BLOCKING.
- 1280 buttons: Cancel 895-973, Save draft 981-1081, Post & new 1089-1195, Post 1203-1264. Identical to reference. Totals strip unchanged and matching.
- 390 buttons: Cancel 16-94 [16-94], More 307-374 [307-374] match. Save draft 112-212 (100 px) [102-206 (104 px)]. Post 229-290 (61 px) [214-299 (85 px)]. The build Post is 24 px narrower.

Status of first-pass items:
- BLOCKING 1 (alert border colour): FIXED, verified.
- BLOCKING 2 (alert title): FIXED, verified (title gone, height and form offset match).
- BLOCKING 3 (Post and Post & new disabled when unbalanced): USER DECISION recorded: option 2, Post and Post & new stay enabled (user approved). The reference differs on purpose (reference greys both). Reference and manifest are to follow the build, not the reverse. Not a defect.
- NOTE (390 Post width 61 vs 85 px, Save draft 100 vs 104 px): remains.
- Other NOTEs (sidebar "+ New" and "Journal Entries", blank third line, line grid) unchanged and not part of cp6.

Remaining BLOCKING difference: none.
