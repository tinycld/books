# CP7 critique — Accounting section and close block

## State check
All 20 screenshots show the state their name says. None INVALID.
- accounting: July, switch on, 2026-09-30, both Saves disabled (clean).
- accounting-empty: January, switch off, no date field.
- accounting-reopen: 2026-06-30 typed, "Reopen closed periods?" dialog (sheet at 390).
- accounting-error: 2026-02-30, "Enter a real date as YYYY-MM-DD".
- non-admin-accounting: two label/value rows, no form.

## Findings

accounting-error (all 4): Close block, under the helper text — the client validation error shows twice: inline under the field and again in `FormErrorSummary` as `close_date: Enter a real date as YYYY-MM-DD`. The raw field key `close_date` is an internal name on screen, and the summary box sits between the field and Save with no new information — BLOCKING (plan: "`FormErrorSummary` for the refusal"; spec: "Server refusals show in the block"; the summary is for the server refusal, the inline message already covers the schema error).

non-admin-accounting (all 4): under the card — no override line. The reference shows "You can post into the closed period until Nov 3, 2026 (reason: Year-end adjustments)." for this shot; the build shows nothing below the rows, so the delivered line is not evidenced — BLOCKING (Delivers: "the read-only view with the caller's own override line"; spec: "Under Accounting a line states the caller's own override ... when one is active"; reference `non-admin-accounting-*` shows that state). If the capture seeded no override, the capture must seed one; the shot as taken does not show the delivered state.

non-admin-accounting-390 (light, dark): bottom tab bar — only "More"; the "Books" tab is absent for the collaborator, although the person is inside Books. Reference shows Books + More — NOTE (shell tab bar, likely nav availability for this user; out of place).

accounting, accounting-empty, accounting-error (all): Close block — "Save close date" sits inside the bordered block; the reference puts it below the block, on the same column as the fiscal Save. Nothing is lost and the plan calls it "the block's own Save button" — NOTE.

accounting-reopen (all 4): dialog body — the date breaks across lines ("before Sep / 30, 2026" at 1280; "Sep 30, / 2026" at 390). A non-breaking space inside the date keeps it on one line — NOTE.

accounting-reopen-390 (light, dark): sheet — both an X close and a Cancel button do the same thing — NOTE (core sheet default).

accounting (all), accounting-empty (all): fiscal form — the gap between the helper text and Save (about 20px) equals the gap between Save and the Close block, so Save does not read as part of the fiscal group; the reference gives it more room above — NOTE.

Clean: dark legibility, toggle alignment, date field, helper text, read-only rows, "Sep 30, 2026" formatting in the read-only view (better than the reference's raw ISO date).
