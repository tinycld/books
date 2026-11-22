# general-ledger — helix run ledger

- mode: unattended
- unit: p5-general-ledger
- started: 2026-11-06
- package branch: books/p5-general-ledger (from books main 54dd94b)   core checkout: main aa16a677; checkpoint 0 on core branch books/p5-general-ledger
- spec: docs/specs/general-ledger-design.md
- checkpoints: docs/plans/general-ledger-checkpoints.md
- reference: docs/plans/general-ledger-reference/
- evidence: docs/plans/general-ledger-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- ~~scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both~~ (deleted by finish.mjs 2026-11-08)
- capture manifest: docs/plans/general-ledger-capture.json
- review mode: C — none (unattended)
- core extension: report spec v3 and engine extensions F1–F11 (spec §4) — checkpoint 0, core PR on branch books/p5-general-ledger, merges before checkpoint 1; MAJOR, lane purchases takes `exclusive` before the core build. Core merge: pre-approved by the human (2026-11-06) — merge when checks are green, unless the checkpoint 0 runner reports an out-of-plan file, a deferral, a rebuttal, or STOPPED. Runs as writing-plans → the human's plan review → subagent-driven development → core PR.
- sparks:
  - one continuous document → needs extension (accepted): core `groups[].open` (E13) + F7 paged grouped reports + core's report view

## Deferrals
(none yet)

## Rebuttals
- **finding:** reviewer B (engine), checkpoint 0, deferral list: "Task 2: formula.go mixed check climbs through coalesce/if (Q4)."
  **rebutted because:** the approved core plan states this cost in R24: "fieldGuard and the args' `mixed` OR also read the code of an `if` branch that the row does not take … that account's beginning balance, running balance and rollup are blank and a `mixedCurrency` notice names Balance; a one-currency book is unchanged (Q4 …)", and the human's Q4 answer (2026-11-06): "a mixed-currency book shows blank balances with the `mixedCurrency` notice, for now".
- **finding:** reviewer B (engine), checkpoint 0, deferral list: "Task 6: … an opening cell that reads a row value is blank with no refusal (the brief mandates this; the deferral is the missing refusal)."
  **rebutted because:** an opening cell compiles on its level ("Cells compile on the opening's own level (`levelCtx`)", plan R5(a)), and the plan's rule for a level formula that reads a row value is blank, not refused: "A rollup that reads a row value the level has none of — a `record` leaf of a group the row is not inside (the Total), a bare path — is blank as a whole" (F6), and F2 "blank on a group/subtotal/total row as a bare path is". A refusal for opening cells alone would break that one rule.
- **finding:** reviewer B (engine), checkpoint 0, deferral list: "Design notes (engine review): M3: page cost grows with the period."
  **rebutted because:** it is the plan's paging design, not a deferral: "Window values are computed before the keyset (`SELECT * FROM (<select with windows>) d WHERE <keyset>`, as today, `run.go:707`), so running values continue across pages" (F7). A running balance on page N needs the rows before it. Listed under Design notes for the human.
- **finding:** gate 2 critic, checkpoint 0 (re-capture), BLOCKING 2: "Label column at the 8-character floor while the figure columns carry spare width … "Full width" of a figure column is its widest figure, not an average-character estimate; the text columns should narrow only as far as the line needs."
  **rebutted because:** spec F10 orders it so: "first narrows its text columns (the label first, then the other text columns from the widest, each to a floor of 8 average characters, with an ellipsis; figure columns keep their full width)", and core implements that order (`core/reports/lib/table-lines.ts` `fitOneLine`: "the label narrows toward its floor (labelFloor), then the text columns are lowered to one cap … Figure columns keep their width"). At 1280 nine columns share a 956 px view, so the one line does not fit at natural widths. Measuring figure widths from content is a change to F10, for the human (Design notes).
  **human (2026-11-07):** rebuttal accepted — F10 stays (text columns narrow first; figure columns keep full width).
- **finding:** gate 2 critic, checkpoint 0 (re-capture), BLOCKING 3: "populated-1024 … drawn as the two-line tablet layout, not one narrowed line".
  **rebutted because:** spec §3: "When the one line does not fit, text columns … narrow with an ellipsis first … If it still does not fit, the row wraps (the tablet layout, else core's automatic lines)". At a 1024 window the view is about 700 px (the Books sidebar is shown), not the 944 px Q2 assumed, so F10's wrap is the specified behavior; Q2's expectation rested on a wrong width (Design notes; checkpoint 3 must expect the tablet layout at 1024).
  **human (2026-11-07):** at a 1024 window the GL draws the tablet layout (the view is about 700 px); checkpoint 3's 1024 assertion and `populated-1024` expect the tablet layout, and checkpoint 3 fixes the No. column cutting "JE-41" (plan checkpoint 3 amended).
- **finding:** reviewer B, checkpoint 1, finding 4 / deferral 1: "the group heading is core `Menu.Section`, not the heading row Do 7 asks for ("muted text, `text-xs`, not pressable")".
  **rebutted because:** core `MenuSection` (`core/ui/menu/index.tsx:525-549`) is that row: a `Text` with `uppercase text-muted-foreground`, `fontSize: 11`, inside a `View role="group"`, not pressable, with the `testID` Do 7 names; CLAUDE.md prefers core components to package one-offs. The gate-2 critic: "the CUSTOMERS group heading in muted small caps left of the indented options … consistent with the core Sheet / Books `SearchPicker` style".
  **human (2026-11-07):** rebuttal accepted — core `Menu.Section` is the picker's group heading.
- **finding:** reviewer B, checkpoint 1, deferral 3: "Do 10 `RegisterEntryLine` "gains the party name" → materialized `customerRow` / `vendorRow`, with `partyName` worked out in `entryDetail`."
  **rebutted because:** nothing agreed is missing: the checkpoint's Produces line is `EntryDetail['lines'][number].partyName: string`, which `entryDetail` returns, and the drawer shows it (the e2e desktop drawer step asserts `entry-line-party-0` shows V). Reviewer B: "The interface … is still met, so the effect is the same."

## Design notes
- cp 0 · engine: page cost of a grouped report with running values grows with the whole period (F7 computes windows before the keyset).
- cp 0 · fix review round 2 BLOCK, open after the round cap: `core/reports/hooks/useReportRun.ts:53,86` + `run-client.ts:172-181` — the fold target's `groupRow` is the last group row loaded, not the one in view; after Collapse all the first page holds every group row, so Expand all joins pages (200 rows each) until the report's last group arrives — a large book loads the whole report serially before the run lands. Fix asked: take the group row in view (FlashList `onViewableItemsChanged` into a ref or the view store), cap any fallback, ask `RUN_MAX_PAGE` per request once the detail target is reached; test: Collapse all at the top, Expand all, one request. (cp0-fix-review-2.md) — **FIXED** by core PR https://github.com/tinycld/tinycld/pull/444 (merged, core main 796d81c8).
- cp 0 · fix review NOTE: in a context that cannot probe its rows (a fill's `where`, an exists' joined row, a param's options), a `count` lookup whose `where` reads a mixed sum drops the unknown rows with no notice (`lookup.go:156`).
- cp 0 · fix review NOTE: a having's lookup-where probe reads `lv.allRows` without the `inShown` conditions, so a where unknown only under a hidden parent group can give a false notice (`levels.go:1223`); figures are right.
- cp 0 · fix review NOTE: `useReportRun.ts:93` writes `shown.current` during render (harmless today; polish: a layout effect).
- cp 0 · fix review NOTE: at the 5,000-group-row cap, an open subtotalled group whose subtotal row is past the cap now shows no figures (`rows.ts endsInSubtotal`).
- cp 0 · reviewer A (client) NOTE: two heading presses inside one frame read a stale sort from the URL (`useReportView.ts onSortColumn`).
- cp 0 · reviewer A (client) NOTE: the heading's sort arrow shows the new sort while the previous run's rows are still the placeholder (`ReportTable.tsx:570`).
- cp 0 · reviewer A (engine) NOTE: a cursor's fingerprint covers groups and sort keys only; a filter/column/having edit keeps it valid (`paging.go fingerprint`; the client resets the list on a spec change).
- cp 0 · reviewer A (engine) NOTE: `c.pivotMixed` is set per level, last wins; levels agree today (`pivot.go`).
- cp 0 · for the Books plan: the sort control's label is "Sort by <column>, sorted ascending|descending" while sorted (`ReportTable.tsx:584-590`); checkpoints 2–3 assert `Sort by Debit, sorted descending` in the `sorted` state.

- cp 0 · CI fix (PR #443, red e2e reports-ledger-v3:290; root cause: a live rerun's `refetch()` cancelled the next-page fetch, 8bd9b6e3; fix round 1 c6dbf4b1; fix review round 2 clean) NOTE: `core/tests/fake-pb-server.ts:39-41` says `vi.unstubAllGlobals()` restores `fetch` but nothing calls it (safe only by vitest per-file isolation).
- cp 0 · CI fix NOTE: `core/reports/hooks/useReportRun.ts:138-146` — after a params change, a waiting call that wakes before the observer moves to the new query sends one request on the old run (nothing wrong on screen).
- cp 0 · gate 2 (books-side re-capture on core 796d81c8, done in checkpoint 1; `docs/plans/general-ledger-evidence/cp0/critique.md`): BLOCKING 1 — **FIXED** by core PR https://github.com/tinycld/tinycld/pull/445 (merged, core main 0cdbe24d: in the one-line layout a group row's label spans the empty cells after it) — was: core defect: on a one-line (F10) row a group heading is held to the label column's width though nothing else is on its line, so at 1280 every open section reads "1000 …" (spec §3: "labelled "<number> <full name>""); source `core/reports/components/ReportRow.tsx` `OneLineRow`. Core change request before checkpoint 2: staging `cp/cp0-gate2-core-request.md`. The reference (`general-ledger-reference/`) is NOT replaced yet; re-capture after the core fix, and fix the INVALID shots then (rows-all-390, filtered-390: scroll the chip strip; more-390: scroll to the page end — manifest `actions`).
- cp 0 · gate 2 NOTE: at 1024 (view about 700 px, sidebar shown) the GL's one narrowed line does not fit, so F10 wraps to the authored tablet layout; Q2's premise (one narrowed line at 1024) does not hold — `populated-1024` and checkpoint 3's 1024 assertion must expect the tablet layout. In it the No. column (1 track) cuts "JE-41" to "JE-…" (Books layout, checkpoint 3).
- cp 0 · gate 2 NOTE: figure columns keep core's fixed `AMOUNT_WIDTH`, so at 1280 the label sits at its 8-character floor ("ACCOU…", "Oct 23…", "Total 10…"); measuring figure widths from content would be an F10 change (see Rebuttals).
- cp 0 · gate 2 NOTE: wrapped detail rows' lines 2–3 (Name, Description, Split) start at the table's left edge, left of the row's indented date (390, 1024).
- cp 0 · gate 2 NOTE: on the phone, figure-only rows' labels ("Beginning …", a folded section "1000 Busi…") are cut to the label track though nothing else is on that line.
- cp 0 · gate 2 NOTE: the heading's sort glyph after "ACCOU…" draws smaller than the others (narrowed label column); re-check after the core fix.
- cp 0 · gate 2 NOTE: `more-1280` — the next-page spinner sits half outside the viewport.
- cp 1 · new-lines-1280: Account trigger's "Choose account" is foreground, the new Name trigger's "Name" is muted (placeholder tone); side by side they differ.
- cp 1 · new-lines-1280 / posted-1280: the line table's rules and ⋮ column run edge to edge while the fields above are inset (reference inset); pre-existing layout, not a cp1 change.
- cp 1 · new-lines-1280: the Name column is about 165 px; a long name ("Harborview Hospitality Group") ellipsizes in the trigger.
- cp 1 · new-lines-390: the card's Name field shows the label "Name" and the placeholder "Name" ("Name / Name").
- cp 1 · posted-390: the Name line on a read card uses the memo's muted second-line style; a name cannot be told from a memo.
- cp 1 · new-name-open-1280: the Name popover (about 10 rows, 396 px) does not fit under line 1, so core's Popover opens it upward over the Date and Memo fields; a shorter list height would let it open downward.
- cp 1 · new-name-open-1280: the CUSTOMERS heading sits at the rows' pitch, so it reads as a row more than a divider (the 390 sheet gives it more air above).
- cp 1 · new-name-open-1280-dark: core Popover's dark fill matches the page, with a 1 px border and no visible shadow (core surface).
- cp 1 · reviewer A NOTE: the inactive-party refusal has no "Line %d:" prefix, so it lands in the form summary, not on the line (`server/lines.go` `refuseNamed(msgLinePartyInactive…)`; P7 fixes the text — a plan change).
- cp 1 · reviewer A NOTE: a search that matches nothing shows "No active customers or vendors" (Do 9's text) even when the book has many; a no-match text would read better.
- cp 1 · reviewer A NOTE: `lib/register-query.ts` — each register row materializes every line of its entry and two party subqueries per line; with the 260-line seeded section that is large in theory (no probe).
- cp 1 · fix review NOTE: `EntryLineCard.tsx:19`, `EntryDrawer.tsx:79` — the empty Name node sits in the card's `gap-0.5` column, so a line with no Name gets about 2 px more space under the account.
- cp 0 · gate 2 re-capture on core 0cdbe24d (`evidence/cp0/critique-2.md`): 0 INVALID, 0 BLOCKING, 5 NOTE — (1) the sort glyph after the narrowed "ACCOU…" draws smaller (scratch route only; the real report at cp 2 prints "ACCOUNT / DATE ⇅" in full); (2) the fixture mixed "0.00" and blank on zero sides of totals (the real report at cp 2 prints 0.00 on every total); (3) wrapped rows' lines 2–3 start at the table's left edge, left of the row's date (carried); (4) on the phone, figure-only rows' labels ("Beginning …", a folded "1000 Busi…") are cut to the label track — PR #445 spans a group label only in the one-line layout, not in a wrap layout (core); (5) `more-1280` spinner half outside the viewport (capture framing).
- cp 2 · all 1280 states: Name is blank in every visible line row in the November period; the seeded party lines (spec §6) are dated October 14 and 20 (with Last month, 1100's line shows "Northwind Tra…").
- cp 2 · all 1280 states: the five text columns get equal widths (about 128 px), so Type cuts "Reversal of JE…" / "Void reversal …" and Description cuts most memos while Name is empty and No. has slack — core's `tableLines` / `ReportTable` shares the slack, not Books.
- cp 2 · customize-1280: with the panel open the narrowed table wraps with core's automatic lines; the authored tablet layout is checkpoint 3's (`display`).
- cp 2 · reviewer A NOTE 1: section totals print "0.00"/"$0.00" on a zero side (`Rollup: sum`, P10); spec §3 blanks a zero side on lines only and asks for the sums on the total row.
- cp 2 · reviewer A NOTE 4: `entryDocTypeOptions` takes the `journal` filter label from the `manual` origin label ("Journal entry"), so a change to one changes the other; both are pinned by tests.
- cp 2 · fix review NOTE: `tests/e2e/general-ledger.spec.ts:636` — the live test's second context is closed outside a `finally`, so a failed assertion leaves it open until the worker ends.
- cp 3 · populated-390, 900, 1024 (wrap layouts): no heading draws a sort control; sort is reached through the toolbar Sort item and the "Sort: …" chip, and the active sort still draws "↓ DEBIT" (core's wrapped-layout header).
- cp 3 · more-390: the toolbar and chips scroll away with the rows on a phone (core layout decision: the top area scrolls away inside the list); deep in a 260-line section the reader scrolls back to change Period or Accounts.
- cp 3 · collapsed-390: a folded section with no lines in the period (1500 Office Equipment, 2100 Company Card) prints "0.00 0.00" in Debit and Credit (P10 `rollup: sum`; see cp 2 reviewer A NOTE 1).
- cp 3 · outside the checkpoint: the Period chip reads "Period: This month to date" without the date range the reference chip shows (core `ParamPeriodControl`).
- cp 3 · reviewer A NOTE 3: the GL and TB shipped specs changed to v4 inside `Revision: 1`; a database that stored the v3 rev-1 specs keeps them and v4 `Load` refuses them (core `shipped.go:99`, `spec.go:354`). Accepted by the plan (unreleased, no backward compatibility); raise the revisions only if dev databases must keep working.
- cp 3 · reviewer A NOTE 5: the TB phone test runs over the ten seeded accounts only; an account name needing three lines at 390 is cut by `LineClamp: 2` and no test covers it.
- cp 3 · reviewer A NOTE 7: from January to mid-September the seeded long section (09-15, 09-16 of the current year) is future-dated (plan P5; e2e 9 uses All dates).
- cp 3 · populated-900 / 1024 (after fix round 1): tablet line 2 is Name ~168 px, Description ~444/568 px, Split ~180 px — not the authored 3·5·4 tracks (core v4 places an authored line from each column's min/natural; spans share only the spare room); nothing the reader needs is cut.
- cp 3 · populated-1280: the "ACCOUNT / DATE" heading wraps onto two lines (core PR #451 wraps between words), so the header row is taller.
- cp 3 · populated-1280: Description shows about 22 characters while Name holds ~167 px of blank on every seeded row in the period (the Name 16ch floor; no seeded line in November has a party).
- cp 3 · populated-390: phone line 2 gives Name ~168 px and Description ~178 px (about half each; the authored layout gives Description two of three tracks) — the Name 16ch floor.
- cp 3 · fix review NOTE: the Name/Split floors (36ch) widen the one line's minimum, so between 1040 and about 1280 px a book with a long Type or Description can draw the tablet layout where it drew the one line before; nothing is cut; the e2e checks the layouts at 390, 900, 1024 and 1280 only.
- cp 2 · fix review NOTE: `server/report_sources_test.go:228` — the comment on the expected vendors catalog gives the older, shorter left-out list (the source comment has the full one).

## Out-of-plan changes
Core (checkpoint 0; each is now also named in the core plan's File Structure, fix item 24):
- core/server/reports fill.go, rules.go, detail.go, lookup.go, levels.go (Task 22 + fix rounds: engine defects the balance-shaped test found — a 1m51s detail run, quadratic per-row lookups under a joined list rule, multi-hop linkBound dropping rows). rules.go: a DISTINCT list rule is applied as `+id IN (SELECT id FROM (<rule select>))` for every report — the driver names this in the core PR description.
- core/server/reports pivot.go, layout.go (Task 2 fix rounds: mixed flag in pivot cells and computed sections); label.go (Task 7 `Sortable`); nest.go (`push` signature); assemble.go, run.go (branch fix M2, M5, M6, I1).
- core/server/reports tests: run_test.go, v2_test.go, fill_test.go, having_test.go, lookup_test.go, lookuphoist_test.go, mixedbool_test.go, mixedcondition_test.go, mixedsort_test.go (helpers and tests for the fixes above).
- core/lib/forms/fixtures/formula-cases.json (the shared formula table the brief's "gains `lookup` sum/count, `outer`, `bound` rows" means).
- core/reports/lib/builder/__tests__/draft.test.ts (Task 10, ruling P3); formula-type.ts (Task 16a); draft.ts openingCellRows (Task 18, P9).
- core/reports/screens/NewReportScreen.tsx, ReportScreen.tsx (`ReportViewInput.layouts` became `spec`, for `rowLevels`); core/reports/hooks/useReportRun.ts (fold keeps the reader's place, fix items 9, 27).
- app/a/(app)/settings/audit-log.tsx (explicit `queryKey`; fixes a `useLiveQuery` warning the full vitest run printed).
- core/tests/fake-pb-server.ts (CI fix round 1: shared test helper that fakes only fetch and the realtime stream, so the useReportRun hook test mocks no module of ours, as CLAUDE.md requires); core/reports/hooks/__tests__/useReportRun.test.tsx (CI fix: red/green proof).
- tests/e2e/reports-scroll-anchor.spec.ts (R14 drops a figure-less wrapped group row's empty line; the phone fixture sums its amount so a group row keeps its figures line); tests/e2e/reports-wrap.spec.ts (a column so it still wraps under R21; polls).
- docs/plans/2026-11-06-report-engine-v3.md (P1 text; File Structure; R14 sentence).
- Books scratch route helix-mockup.tsx (git-excluded): gained sort, onSortColumn, onClearSort, sortProblem, rowLevels.
Books (checkpoint 1):
- tinycld/books/hooks/useRegisterQuery.ts (passes `parties` to `registerLinesQuery`; customers and vendors join its retry sources — needed by Do 10's drawer Name).
- tinycld/books/hooks/useOpeningDraftWrites.ts, lib/transfer.ts, lib/transfer-fixture.ts, lib/journal-entries-fixture.ts, lib/account-register-fixture.ts (`customer: ''` / `vendor: ''` on the now-required line fields; type ripple).
- tinycld/books/lib/vendor-form-fixture.ts (a static Summit IT Services id for the party seed, fix item 3).
- tinycld/books/components/entries/EntryLoadError.tsx (new), EntryScreenSwitch.tsx, screens/entries/new.tsx (the read view's load error with Retry, fix item 1).
- tests/accounts-form-harness.ts, collections.test.ts, entry-initial.test.ts, entry-lines.test.ts, register-query.test.ts, register-test-data.ts, register.test.ts, transfer.test.ts, use-entry-actions.test.tsx, use-entry-save.test.ts, use-entry-submit.test.ts, useEntryForm.test.ts (the new fields and collections; no assertion loosened — reviewers A and B).
- tests/e2e/journal-entries-read-only.spec.ts:100 (the line-row count excludes the new `entry-line-party-` cells).
- docs/plans/general-ledger-evidence/cp0/ (checkpoint 0's gate-2 capture and critique, made at the start of checkpoint 1).
Books (checkpoint 2):
- docs/plans/general-ledger-reference/*.png, general-ledger-capture.json, general-ledger-evidence/cp0/* (the cp0 states captured again on core 0cdbe24d, as the driver asked; the 390 shots of rows-all, filtered and more split per width with `scrollTo` actions).
- docs/plans/general-ledger-checkpoints.md (checkpoint 3 amended for the human decisions of 2026-11-07); docs/specs/general-ledger-design.md §5 (`books.vendors` lists `mobile`, fix item 1).
- server/report_trial_balance_test.go (the `TestTrialBalanceSpecLoads` golden the Tests bullets ask for; the Files block does not name the file).
- Git-excluded `tests/e2e/helix-capture.spec.ts`: actions `scrollTo` and `clickRole`, and test titles carry the widths (for the driver: the skill template has none of these, and a shot split per width gives duplicate titles there).
Books (checkpoint 3, in the tree, not committed):
- help/reports.md outside the new section: tags gain "general ledger"; "Who sees Books reports" names the General Ledger too (the share sync shares both reports).
- docs/plans/general-ledger-checkpoints.md (checkpoint 3 amended by the runner for core PR #447 and spec v4; the review script lists it because a plan does not name itself).
- server/report_sources_test.go, server/report_trial_balance_test.go: now named in checkpoint 3's Files (amended), on the same bullet as `report_trial_balance.go`, which the review script reads as one path; listed by the script, changes caused by core spec v4.
- docs/specs/trial-balance-design.md (e2e item 9 corrected for core PRs #447, #450, #451; named in the amended Files block).

## Phase notes
- phase 1: packet generated by look-ahead (staging/p5-general-ledger/), built against books p5-trial-balance f9e7003 and core 40a3b225. Core moved to aa16a677 (4f5fe989, b821c618: `runKey` on `ReportTable`, `rowsKeyOf` in run-client) — additive; kept the packet, raised Q10.
- phase 3: design gate 2026-11-06 — human picked direction **A**. Every open question Q1–Q10 as recommended (Q1: journal lines get an optional customer or vendor now). Human note: the artboard's Credit column was cut off at the right edge; not allowed — use the report engine's resize and wrap so every column fits at every width → added **F10** (fit, never clip; replaces the desktop sideways scroller) and a tablet `display.layouts` entry for the GL. Q10 → **F11** (`rowsKeyOf` includes `options.sort`). Q8 moot: p2-pdf's core migration already merged; no lane holds `exclusive`.
- phase 3 pass 2 (2026-11-06, unattended, core main aa16a677): direction **A**; no spark dropped (the one spark is needs-extension: F7 + `groups[].open`). Fixture `tinycld/books/lib/general-ledger-fixture.ts`: the e2e book's accounts with Sept 30 beginning balances (balanced), October's 8 posted entries (split, transfer, void pair, a line memo over the entry memo, a long customer name, Name from customer and vendor), Rows / Accounts / sort / collapsed / All dates / first-page variants as core `RunResult`s, the spec's params as core `ParamDef`s, the phone and tablet `display.layouts`, and seed descriptors (`GENERAL_LEDGER_PARTY_SEED` on a local line shape the Q1 migration checkpoint replaces with the generated `customer`/`vendor` fields; `GENERAL_LEDGER_LONG_SECTION`, 260 lines). Scratch route hands core's real `ReportView` a static `ReportViewModel` (the p5-trial-balance model); it must import the fixture relatively (`../lib/…`): Metro does not resolve `~/tinycld/books/…` from a package screen. Reference: 14 states in `docs/plans/general-ledger-reference/` (populated at 390/1024/1280, the rest at 390/1280; light and dark; 58 shots): populated, collapsed, rows-all, filtered, sorted, all-dates, more, customize, empty, empty-filtered, loading, error, timeout, no-access. The Books FAB ("New") is hidden in every shot: the real report lives at core's `/a/reports/<id>`. No human reference approval (unattended).
  - **F10 (design-gate note) shown as the target, with stand-ins:** at 1280 every column fits on one line — text columns about 96 px with an ellipsis, Debit/Credit/Balance at core's 128 px, no sideways scroll — drawn by a reference-only 30-track desktop layout (`F10_ONE_LINE_STAND_IN`; core refuses > 12 tracks in a saved spec, F10 measures widths instead, so the GL spec ships no desktop layout). At 1024 the one line does not fit and the rows wrap to the tablet layout (`F10_WRAP_STAND_IN`). Core today scrolls both sideways.
  - **Spec change:** §5 tablet layout moves Name to line 2 (on line 1, 12 tracks leave Name one track at 1024).
  - **States that depend on core work not in core yet:** every shot's "Beginning balance" row is a plain detail row (F5 adds kind `opening`, detail depth, muted label); every running and ending Balance is precomputed (F1–F3, F6); `sorted` reorders lines by Debit with balances kept, but no heading has a sort control and the URL has no `s=` (F8, F11); `all-dates` writes "All dates" in the header but the chip reads "Period: Any" (F4 adds the preset and its label); `more` is a first page ending inside the document with the loading footer and no Total yet (F7); populated-1024 and every 1280 shot (F10).
  - **For checkpoint 0 (seen in the capture, core today):** in a wrap layout a row whose cells are only figures (Beginning balance, section Total, Total) keeps an empty 44 px line for each text line — on a phone the Beginning balance row is four lines tall with the balance at the bottom. Spec §3 Phone says section and total rows draw "label, then figures"; F5/F10 must collapse those empty lines, the opening row included. Line-2 cells (Name) start at the table's edge, not under the indented date. A section whose lines are all debits shows Credit "$0.00" on its Total row (sum of stored zeros; spec blanks a zero side on lines only).
  - Not shown: the Accounts picker (unchanged from the Trial Balance's reference); the business-name path (the reference heading is the fixture's).
- phase 4 (2026-11-06, unattended): plan `docs/plans/general-ledger-checkpoints.md` — checkpoint 0 (core report engine v3, F1–F11, core branch `books/p5-general-ledger`; writing-plans core plan, then STOP for the human's core plan review, then SDD and the core PR; merge pre-approved on green checks; carries the empty-text-line finding into F5/F10) + 3 package checkpoints: 1 customer or vendor on lines, 2 General Ledger report for readers, 3 phone, tablet and large books. plan-check: 0 errors, 27 warnings (own-checkpoint names and core names that land with checkpoint 0). Review mode C: 25 findings (R1–R25), 25 fixed, 0 open. Decisions P1–P10 in the plan: new migration 2100000009 for line parties (P1); 9 GL + 3 entry-screen e2e runs (P2); `CurrentVersion` 3 breaks `TestTrialBalanceSpecLoads`, so its assertion moves to `reports.CurrentVersion` on the books branch right after the core merge (P3); reversals and replacement drafts keep the party (P4); long section = two 131-line entries (P5); GL_DAY_1/2 = 2026-08-04/18 (P6); refusal texts + TS mirror (P7); loading/error/timeout/no-access/unfiltered empty are core-owned (P8); Name is not in the Enter walk (P9); zero side blank by formula + rollup (P10).
- review mode switches: none
- human decisions 2026-11-07 (before checkpoint 2): (a) at a 1024 window the GL draws the tablet layout (the view is about 700 px); checkpoint 3's 1024 assertion and `populated-1024` expect the tablet layout, and checkpoint 3 fixes the No. column cutting "JE-41" — plan checkpoint 3 amended (Files, Gates, `TestGeneralLedgerLayouts`, e2e 8, Do 1); (b) rebuttal accepted: F10 stays (text columns narrow first; figure columns keep full width); (c) rebuttal accepted: core `Menu.Section` is the picker's group heading. cp0 gate-2 BLOCKING 1 fixed by core PR #445 (core main 0cdbe24d).
- human decision 2026-11-08 (checkpoint 3, test dispute 2): neither (a) nor (b) as asked; core changed instead — report layout fit, core PR #447 merged (core main b9254bde; plans tinycld/docs/plans/2026-11-07-report-layout-fit-part-1.md and -part-2.md; decisions staging layout-decisions.md). Columns are measured from content; figures, dates and short text are never cut; non-detail rows span empty cells; the layout is chosen by a fit test; wrapped lines are compact and indented; the grand Total shows only with the last page plus an end-of-report row; one notice band; on a phone the top area scrolls away inside the list and stays mounted. The human's requirement: nothing the reader needs is cut (no "…" on a date, No., Type, figure, or the Beginning/Total labels). Settle dispute 2 against the new core at 390, 900, 1024 and 1280; amend checkpoint 3's text and e2e; STOP with evidence if the new core still cuts one of these. The workspace core is branch chore/sentry-react-native-8.34 (main b9254bde + @sentry/react-native 8.34, PR #448); not edited. Expected Books e2e changes from the core change: general-ledger.spec.ts ~821–912 and trial-balance.spec.ts:553 (staging tb-phone-diagnosis.md).
- plan and spec amended 2026-11-08 (checkpoint 3 runner, for core PR #447): spec §3 Phone ("Opening, section and total rows: label and figures on one line when they fit, else label, then figures") and Every width fits (nothing the reader needs is cut: dates, Type, No., Debit, Credit, Balance, Beginning balance and Total labels; long text columns narrow first); plan checkpoint 3: the spec quotes, Gates (`populated-1024` = tablet layout by the fit test; `populated-1280` added), `TestGeneralLedgerLayouts` rationale (no sidebar premise), e2e 7 (opening/total rows one or two lines; nothing-cut check), e2e 8 (adds 1280: the one line; nothing-cut check at each width), Files (`tests/e2e/trial-balance.spec.ts`, the phone test at :553, a test change caused by core). plan-check: 0 errors.

## Checkpoint 0
- core plan: `tinycld` branch `books/p5-general-ledger` (from main aa16a677), `docs/plans/2026-11-06-report-engine-v3.md`, commit 3b13a5d6 (not pushed; the driver pushes). Written with writing-plans: one agent wrote the head and outline, four wrote the task bodies in parallel. 25 tasks (Task 1 … Task 22 with 2b, 13a, 16a), 24 rulings (R1–R24), 4 open questions (Q1–Q4), verdict MAJOR (lane purchases holds `exclusive` before the build). Every ruling and question states its cost if wrong.
- plan review: two reviewers (coverage; code accuracy and seams) → 4 BLOCK, 15 NOTE, all accepted and fixed. Main fixes: per-row-currency money could not combine a lookup amount with a path amount, so the GL's `opening`, `balance` and `rollup` would have been refused by `Validate` (new Task 2b: `currency.field`, run-time `fieldGuard` with the `mixedCurrency` notice; R24); the e2e moved before the UI tasks (Task 13a) so they are red first; `reports-wrap.spec.ts:504` gets a column so it still wraps under R21; Task 6 receiver; Task 16 split; the outline, File Structure and Coverage check rebuilt from the bodies. Fix review: round 1 → 1 BLOCK, 5 NOTE (fixed); round 2 → 1 BLOCK, 1 NOTE (fixed by the runner: text in the Global Constraint and in Task 22's time budget). Rounds: 2.
- open questions for the human (in the core plan): Q1 an authored layout for the current width applies even when the one line fits (recommended yes); Q2 at a 1024 window the GL's narrowed line (864 pt) fits the 944 pt line, so the GL draws one narrowed line and never its tablet layout on desktop, unlike spec §5 and the `populated-1024` reference (recommended: keep F10's order and re-capture); Q3 F10 narrows on phones too (recommended yes, per "at every width"); Q4 a book with journal lines in more than one currency shows blank balances with the `mixedCurrency` notice (recommended: acceptable for now).
- Books plan changes the core plan reports back (amend before checkpoint 1): the spec §5 `balance` rollup becomes `byNormal(add(opening, coalesce(sum(net), 0)))` (R23: `add` passes a blank, so an account with no line in the period had no ending balance); the GL is right only where an org's journal lines share one currency (R24, Q4); the scratch route's static `ReportViewModel` must set `sort`, `onSortColumn`, `onClearSort`, `sortProblem` after core Task 15; if Q2 stays as recommended, `populated-1024` and checkpoint 3's tablet assertion change. No Produces name changed.
- stopped: Do step 2 — the human's review of the core plan. Resume: fold the human's answers into the core plan, then subagent-driven development (Do step 3).
- core plan review (Do step 2): the human APPROVED the core plan on 2026-11-06 and accepted the recommended answer to each open question: Q1 yes (an authored layout for the current width applies even when the one line fits); Q2 keep F10 as written (the GL draws one narrowed line at 1024; `populated-1024` is re-captured at gate 2); Q3 narrow on phones too; Q4 a mixed-currency book shows blank balances with the `mixedCurrency` notice, for now. Recorded in the core plan's Open questions (core 2d8fbc94).
- resumed (Do step 3): subagent-driven development of the core plan; SDD ledger `tinycld/.superpowers/sdd/2026-11-06-report-engine-v3/progress.md`.
- SDD (Do step 3): Tasks 1–22 (with 2b, 13a, 16a) committed, each reviewed with fix rounds; whole-branch review in two halves (engine, client), fix rounds and re-reviews to clean (last: branch-fix-i1-rereview.md, 0 Critical/Important, 2 Minor → fix items 12, 13). SDD ledger: core `.superpowers/sdd/2026-11-06-report-engine-v3/progress.md`.
- test writer: SDD per task (red first per task brief); fix round 1: Go v3_test, v2_test, fieldcurrency_test, opening_test, formula-cases.json rows, e2e polls and the fold-after-page-2 test (red for the right reason: yes; one test found a defect → fix item 25); fix round 2: e2e "Expand all from closed groups keeps the reader at the group in view" (red: yes); untestable: none
- implementer: SDD implementers per task; fix round 1 two implementers (client items 9–11; engine items 12–25, one hand-off), fix round 2 item 27; DONE
- test disputes: none
- self-declared differences: fix round 1 client — item 9 loads pages to clamp(remaining, 200, 1000), a refetch of a joined page keeps its length; item 11 draft-edit moment. Engine — item 21 test was already green (one refusal per path), refusal moved to the source; item 22 zod `.max()` already counts code points (pinned by a vitest); item 19 the detail sort-key probe stays its own statement; item 12 `parts` only for a multi-sentence notice; item 18 rt<L> frame, linkBound V inline when it reads the looked-up row; item 20 contexts with no probe name the reading column/condition, a count there gives no notice; a having's lookup-where probe reads all level rows. Round 2 — `untilRow` = last group row loaded; stop when the row AND the detail target are held.
- gate 1: tests unedited: yes · reports-scroll-anchor phone test fail (driver run at 148f7953) → root cause: R14 prunes a wrapped group row's figure-less line, and the fixture's group rows had no figures, so the `report-cell-amount` cell of the group row the test waits for was never rendered (trace: waitForSelector on `report-cell-amount-g:["2026-01-11","USD"]` never attached; screenshot shows label + Booked lines only) → fixture sums its amount (09936b6a) → 3/3 pass · non-e2e (tinycld-pkg check, go test reports + coreserver, check:core-isolation) green after each round · e2e after the fix rounds: ledger-v3 10/10, scroll-anchor 3/3; the other 14 report files (wrap, view, source-params, groups-v2, filter, create, formula-layout, formulas-v2, group-pivot, share, tab-order, shipped, failure-states, formula-leaves): all pass, driver run on the final tree (staging cp/e2e2-summary.log)
- gate 2: n/a (core checkpoint; the Books screens are captured from checkpoint 2) — struck: the plan's checkpoint 0 Gates line and Do step 5 ask for the books-side re-capture after the merge; done at the start of checkpoint 1 (see Checkpoint 1, "checkpoint 0 gate 2").
- gate 3 A (correctness), split engine/client: engine 0 BLOCK, 6 NOTE (v1 load test, label runes, bound rows → fixed as items 2, 22, 7; allDates contract doc → item 23; fingerprint, pivotMixed → Design notes); client 1 BLOCK (a fold in a paged grouped report loses the reader's place) → accepted+fixed (items 8, 9, then 26, 27); 2 NOTE → Design notes
- gate 3 B (conformance), split: script lines: 0 real, 1 false positive (`test.skip(skipWithoutReportsStub())`, the shared stub guard that throws under CI) · engine 4 findings (out-of-plan files → item 24; detail.go SQL text replace → 14; mixedHelpers → 15; pvm index → 16) accepted+fixed; client 4 findings (out-of-plan audit-log, screens, scroll-anchor → item 24; one-shot layout reads → item 1) accepted+fixed
- fix review: round 1: 1 BLOCK (Expand all from closed groups still loads one page) → fixed in round 2 (items 26, 27); 5 NOTE → Design notes (one comment NOTE fixed in item 26) · round 2: 1 BLOCK (the fold target is the last group loaded, so Expand all after Collapse all loads the whole report) · after round 2: open BLOCK moved to Design notes (not data loss, leak, or crash)
- gate 3 A notes: 4, listed under Design notes
- reviewer-caught deferrals: reviewer B listed 13 SDD "minor (deferred)" / design-note items; 10 fixed now (items 3–6, 12, 17–22 — the implementer had recorded them as minors, not as deferrals: that gap is signal), 3 rebutted (see Rebuttals), 0 remain as deferrals
- commit: 0f61088a (core, branch books/p5-general-ledger; on 09936b6a; not pushed)
- human: n/a (mode C); the pre-approved core merge does not apply — 3 rebuttals and the open round-2 BLOCK go to the human first

## Checkpoint 1
- core: main 796d81c8 (PR #443 report engine v3, PR #444 Expand-all fix, both merged).
- Do 1 (merged core check): P3 — `TestTrialBalanceSpecLoads` asserts `reports.CurrentVersion` with `UpgradedFrom` 0 (runner, one line); `go test ./...` ok; `trial-balance.spec.ts` 12/12.
- checkpoint 0 gate 2 (books side, plan cp0 Do 5): fixture + scratch route moved to core v3 (opening rows, sort state, F10 stand-ins removed, All dates, view model fields; implementer, 5/5 fixed, `pageRows: 11` for `more`); 7 states re-captured into `docs/plans/general-ledger-evidence/cp0/` (30 shots). Critic: 6 INVALID (rows-all-390, filtered-390, more-390 ×2 schemes), 3 BLOCKING, 4 NOTE. BLOCKING 1 (group heading clipped on a one-line row) is a core defect → core change request before checkpoint 2 (Design notes); BLOCKING 2 and 3 rebutted (see Rebuttals). The reference is not replaced; re-capture after the core fix. Notes → Design notes.
- test writer: server/line_parties_test.go, tests/entry-schema.test.ts, entry-messages.test.ts, line-party-options.test.ts, help-journal-entries.test.ts, tests/e2e/journal-entries-name.spec.ts (3 runs), journal-entries-helpers.ts (`LineInput.name`); red for the right reason: yes (29 tests; no Go stubs needed — the Go tests use the P7 texts as literals); untestable: none
- implementer: Do 2–14 (migration 2100000009, guards, reversal copy, client data, SearchPicker groups/loading/retry/empty, Name picker, edit/read/card/drawer Name, fixture, seed, e2e helper, help); seeded-entry specs run one by one (list-table 6, list-paging 5, read-only 11, register-table 2, customer-actions 2, vendor-actions 2, trial-balance 12); DONE
- test disputes: `tests/entry-schema.test.ts:273` expected default lines without the party fields; settled for the implementer by the Tests bullet "`emptyLine()` has `customer: ''` and `vendor: ''`" → test writer fixed the expectation (31/31).
- self-declared differences: `isChanged` compares the parties; `RegisterEntryLine` carries materialized `customerRow`/`vendorRow`, `entryDetail` derives `partyName` (rebutted as a deferral, see Rebuttals); `registerLinesQuery` gains `parties`; "None" option + search box in the picker; group heading is core `Menu.Section` (rebutted, see Rebuttals); `LineError` shows the `customer` issue; migration comment; collections moved above `lineRelations`; card/drawer hid the empty Name (fixed, item 2). Fix round: Retry also recovers the accounts, linked-entries and access queries; new `EntryLoadError`; a held draft screen stays mounted on a failed reload.
- gate 1: tests unedited: yes · check (biome, tsc, vitest 3660) pass, 1 biome warning in the git-excluded `tests/e2e/helix-capture.spec.ts` (identical to the skill template; fix at the template — driver) · go test pass · e2e `general-ledger:` 3/3 · after the fix round: same, 3/3; journal-entries-read-only 11/11 (fix implementer)
- gate 2: invalid shots: new-name-open-1280 ×2 (the capture's actions ran once before the first width, so 1280 showed the closed picker) → manifest split per width, re-captured, fresh critic (critique-2.md): 0 BLOCKING · blocking: none · notes: 8 (5 + 3), listed under Design notes
- gate 3 A (correctness): 0 BLOCK, 7 NOTE — NOTE 7 (read-only spec selector) fixed (item 5); NOTEs 3 and 5 duplicated B's findings 3 and 2 (fixed); NOTE 4 = B finding 4 (rebutted); NOTEs 1, 2, 6 → Design notes
- gate 3 B (conformance): script lines: 0 real, 1 false positive (two live queries in `useLinePartyOptions`: two unrelated lists, Do 8) · findings: 1 out-of-plan (recorded under Out-of-plan changes; the ledger edit is the runner's) · 2 read-view load error → accepted+fixed (item 1) · 3 empty Name row → accepted+fixed (item 2) · 4 `Menu.Section` → rebutted · 5 evidence 1280 picker shot → fixed (re-capture) · 6 `vendorFixtureId` throws → accepted+fixed (item 3) · 7 not-both after entry lookup → accepted+fixed (item 4) · 8 template biome warning → driver
- fix review: round 1: clean (0 BLOCK); 1 NOTE (an empty Name node adds the column's 2 px gap under the account on a card/drawer line with no Name) → Design notes
- gate 3 A notes: 3, listed under Design notes
- reviewer-caught deferrals: reviewer B listed 4: deferral 2 (blank Name row) and 4 (read-view load error) fixed now — the implementer had declared 2 as a difference and 4 in its self-check ("I did not add one"), not as deferrals: that gap is signal; deferrals 1 and 3 rebutted (see Rebuttals); 0 remain
- commit: 151a57a (books, branch books/p5-general-ledger; not pushed)
- human: n/a (mode C)

## Checkpoint 2
- core: main 0cdbe24d (PR #445 merged: a one-line group row's label spans the empty cells after it).
- cp0 gate 2 re-capture (on core 0cdbe24d): reference `docs/plans/general-ledger-reference/` and `docs/plans/general-ledger-evidence/cp0/` captured again from the scratch route (manifests split per width; the 390 shots of rows-all and filtered scroll the chip strip to their chip, more-390 scrolls to `report-loading-more`, through a new `scrollTo` action in the git-excluded capture spec; the capture spec's test titles now carry the widths so a split shot is not a duplicate title). Fresh critic (`evidence/cp0/critique-2.md`): 0 INVALID, 0 BLOCKING (BLOCKING 1 gone), 5 NOTE → Design notes.
- test writer: server/report_general_ledger_test.go (15), report_sources_test.go, entry_type_labels_test.go, report_trial_balance_test.go (golden copy; green by design until the move), tests/register.test.ts, tests/e2e/books-report-helpers.ts (GL helpers), tests/e2e/general-ledger.spec.ts (6 runs); Do 0 stubs report_general_ledger.go, entry_type_labels.json `{}`, entry_type_labels.go; red for the right reason: yes (28; e2e all red at the missing hub row); untestable: none. Differences: the live test's page B is a second page of the same context (the Trial Balance live test's pattern; the checkpoint says "a second context, same user" — same user either way, each page has its own app and realtime connection); the vendors source test asserts the field list, not `Widths`.
- implementer: Do 1–8 (helpers moved to report_spec_helpers.go, entry type label table in Go + TS, sources: doc_type options, line `position`/`customer`/`vendor`, `books.vendors`; report_general_ledger.go per §5 with P10 and R23; shipped and registered); no core gap (Validate and Run accept the spec); DONE
- test disputes: `tests/e2e/general-ledger.spec.ts:313` pressed B's `report-row-g:` heading, which core's sticky copy (`report-sticky-group`, `ReportRow.tsx` StickyGroup) covers at scroll 0 → the test was wrong: the checkpoint says "a press on B's section heading folds it", and what a user presses there is the sticky copy (the implementer proved that press folds B) → test writer presses the sticky copy holding B's label; same section, same assertions (cp2-tests-fix.md).
- self-declared differences: vendors source without `mobile` (reversed in the fix round, see gate 3 B); Split correlates on `&reports.Node{Outer: Path{{Link: "entry"}}}` (`outer` ends in a field hop); `account` column is a path, not a link formula; `debit`/`credit` have P10's Rollup, no `Aggregate`; Type `case` arm order fixed (manual transfer, reversal origins in JSON order, others by key), default the manual label; `entryDocTypeOptions` labels from `entryTypeLabels`; the account-number sort key is `rec("byAccount","number")` (the `number` column is the entry's No.); helpers `blankZero`, `splitCase`; `reportSources` header comment; capture.json reformatted by biome.
- gate 1: tests unedited: yes · check (biome, tsc, vitest 3663) pass · go test ./... pass · e2e `general-ledger:` 9/9 · trial-balance + transfer-read 15/15 (implementer)
- gate 2: capture via the hub (`/a/reports?package=books` → General Ledger; the shipped report id is random per DB) with chip actions; first attempt chose Last month, but the seeded October has one line per section, so sorting could not show → states moved to the default period (This month to date, Nov 1–7); a role click (`clickRole`) added to the git-excluded capture spec for picker checkboxes. invalid shots: none · blocking: none · notes: 2 → Design notes (critique.md)
- gate 3 A (correctness): 0 BLOCK, 6 NOTE — NOTE 2 (live test same context) = B finding 3 → fixed (item 2); NOTE 3 (`mobile`, comment) = B finding 2 → fixed (item 1); NOTE 5 (e2e 1 posts 1,234,567.89 to the seeded Business Checking on the shared DB) → accepted+fixed (item 4, weak-test); NOTEs 1, 4, 6 → Design notes / Out-of-plan
- gate 3 B (conformance): script lines: 0 · finding 1 out-of-plan → recorded (Out-of-plan changes) · 2 `books.vendors` without `mobile` → accepted+fixed (item 1; Do 3 "including `mobile` (the `books.customers` pattern)"; spec §5 vendors list gains `mobile` to match "the customers source's shape") · 3 live test page B same context → accepted+fixed (item 2) · 4 `net` defined twice → accepted+fixed (item 3)
- reviewer-caught deferrals: reviewer B 2 (= findings 2, 3) — fixed now; the implementer had declared `mobile` as a difference and the test writer the same-context page, not as deferrals: that gap is signal; B's item 3 (P10 replaces `aggregate: sum`) is the plan's own decision, not a deferral; 0 remain
- fix round 1: items 1–4 (cp2-fix.md) — test writer (items 1 red half, 2, 4; cp2-fix-tests.md), implementer (items 1, 3; cp2-fix-impl.md); gate 1 again: tests unedited yes · check pass · go test pass · e2e `general-ledger:` 9/9; no shot changed (the spec JSON is unchanged), no re-capture
- fix review: round 1: 0 BLOCK, 3 NOTE → Design notes (the --fix input left out the two test files, staged before it was built; the reviewer read them directly)
- gate 3 A notes: 3 (NOTEs 1, 4 → Design notes; NOTE 6 → Out-of-plan changes)
- human: n/a (mode C)
- commit: d0d7671 (books, branch books/p5-general-ledger; not pushed)

## Checkpoint 3
- core: main 0cdbe24d.
- test writer: server/report_general_ledger_test.go (`TestGeneralLedgerLayouts`), tests/help-reports.test.ts (13), tests/e2e/general-ledger.spec.ts (runs 7 phone, 8 tablet 900 + 1024, 9 paging); red for the right reason: yes (17; logs staging cp/cp3-red-*.log); untestable: none. The Go test pins the tablet layout to Do 1's example (line 1: account, type, number, debit, credit, balance, 2 tracks each; line 2: name 3, description 5, split 4).
- implementer: Do 1–5 (`generalLedgerLayouts()` mobile + tablet, `Display` on the spec; `seedLongSection` two 131-line entries; fixture tablet layout and long-section shape; spec §5 tablet sentence; help "Read the General Ledger"; packages:generate). Do 3 re-runs, one file each, all green: transfer-read 3, transfer-actions 4, transfer-form 3, transfer-elsewhere 2, opening-balances 43, banking-connect 3, chart-of-accounts-balance 1, account-register-table 2, journal-entries-list-table 6, list-paging 5, trial-balance 12. go test ok; tinycld-pkg check ok (3676). DONE with 2 disputes.
- test disputes:
  1. e2e 9 (paging) `general-ledger.spec.ts:966` expected the first page's last row to be a detail row; core F7 `pageWindow` (`core/server/reports/assemble.go:372-380`: "each page of a report without groups ends in its totals") ends every page in the report Total. Settled: the test is wrong in its literal check; the checkpoint's "ends inside the savings section" is about the document's detail rows → test writer checks the last row before the trailing total rows (a savings detail row; no subtotal on page 1); 1 passed (cp3-tests-fix.md).
  2. e2e 8 (tablet), the 1024 pass: `textOnNextLine` false — core draws F10's one narrowed line, not the tablet layout. Verified by the runner: the real route `/a/reports/<id>` is core's Reports package, which has no package sidebar (`core/components/workspace/WorkspaceLayout.tsx:41` `hasSidebar = !isMobile && activePkg?.sidebar != null …`), so at 1024 the view is about 960 px, not the 700 px of the 2026-11-07 decision (that width came from the scratch route, which renders the Books sidebar). The implementer's failed-run screenshot shows every column inside the view, but "Nov 7, …", "Journal e…", "Beginn…", "Total GL …" cut. The 900 pass is green. **Not settled: needs the human (run stopped).**
- self-declared differences: `GENERAL_LEDGER_LONG_SECTION` gains `days` and `linesPerEntry` (replaces `count`); spec §5 adds why No. has two tracks; help: tags gain "general ledger", "Who sees Books reports" names the General Ledger too, the section also describes paging and the tablet wrap, does not describe the retained-earnings fold; the help's tablet sentence describes the authored tablet layout (true at 768–1023; at a 1024 desktop window it depends on the human's answer).
- gate 1: tests unedited: yes (the only change is dispute 1's, by the test writer) · go test pass · check pass · e2e `general-ledger:` 10 passed, 2 failed (the two disputes) before the dispute 1 fix; paging 1/1 after it; the 1024 pass still red (dispute 2).
- gate 2: not run (gate 1 not green) · gate 3 A / B: not run · fix review: n/a
- stopped: checkpoint 3, test dispute 2 — a decision only the human can make. The question: at a 1024 window the General Ledger (core's `/a/reports/<id>`, no Books sidebar, view about 960 px) draws F10's one narrowed line, with the date, Type, "Beginning balance" and section total labels cut by an ellipsis; the 2026-11-07 decision expected the tablet layout there on a 700 px premise that does not hold. Choose: (a) keep F10 at 1024 — e2e 8's 1024 pass asserts the narrowed line (figures inside the table, No. whole, no sideways scroll) and `populated-1024` is judged as one narrowed line; or (b) a core change so the GL wraps at 1024 (for example a legibility floor in F10's narrowed line, or a fit rule that prefers the authored tablet layout when text columns would be cut), then checkpoint 3 resumes on the new core. The checkpoint's code and staged tests stay in the tree, not committed; a fresh runner continues: settle dispute 2, finish gate 1, gates 2 and 3, commit.
- resumed 2026-11-08 on core main b9254bde (report layout fit, PR #447; workspace core branch chore/sentry-react-native-8.34). First run of `general-ledger:` with the old tests: 11 passed, 1 failed — e2e 7 (phone): the opening row is now one line (expected from the core change); e2e 8 passed at 900 and at 1024 (the poll saw the tablet layout at 1024). Plan checkpoint 3 and spec §3 (Phone, Every width fits) amended (see Phase notes); brief rebuilt; plan-check 0 errors.
- test writer (test changes caused by core: plan checkpoint 3 e2e 7, e2e 8, and Files `tests/e2e/trial-balance.spec.ts`; staging cp/cp3-tests-core-fit-report.md): e2e 7 — opening and section total rows on at most two lines (seeded shape at 390: opening one line, section total two), nothing-cut check (date, Type, No., figures, Beginning balance and Total labels); e2e 8 — widths 900, 1024 (tablet layout) and 1280 (one line), nothing-cut check at each width; trial-balance.spec.ts:553 per staging tb-phone-diagnosis.md (debit beside the account, credit wraps; `tableFits` leaves out `report-controls`). Results: trial-balance 12/12; `general-ledger:` 11 passed, 1 failed — e2e 8 at 1024. Both test files staged.
- dispute 2 on the new core — CORE-CUT at 1024: core draws the ONE line, not the tablet layout, and cuts Type: "Journal entry" shows as "Journal e…" (`report-cell-type-…` scrollWidth 85 > clientWidth 71; table 960 px; Description 226/124 and Split 122/75 also narrowed, which is allowed). At 390, 900 and 1280 nothing the reader needs is cut. Evidence: staging cp/cp3-core-cut-1024.png, cp/cp3-tests-core-fit-report.md §CORE-CUT. The earlier pass of the old e2e 8 at 1024 (same session, before the test change) shows the layout choice at 1024 is not stable: the poll once saw the tablet layout; the probe and the new test see the cut one line.
- gate 1: tests unedited: yes (only the test writer changed tests) · e2e red at 1024 (core) · gate 2: not run (capture manifest written: docs/plans/general-ledger-evidence/cp3/capture.json; the git-excluded capture spec gains `holdNextPages` and `scrollListToEnd` for the `more` shot) · gate 3 A / B: not run · fix review: n/a
- stopped (2026-11-08): checkpoint 3 — the new core still cuts a column the human requires whole (Type at a 1024 window); the prompt says to stop on that. Out of scope for Books (core may not be edited in checkpoints 1–3; the GL authors no desktop layout on purpose, and designing around a core gap is banned). Core change request: core's fit test must not pick the one line when a short-text column (Type "Journal entry") would show an ellipsis — its measured minimum is under its drawn text width (85 px text in a 71 px cell, 960 px table); with that fixed the GL wraps to its tablet layout at 1024. Also check why the choice at 1024 differs between runs. The checkpoint's code, the amended plan and spec, the cp3 capture manifest, and the staged tests stay in the tree, not committed. A fresh runner continues on the fixed core: run `general-ledger:` (e2e 8 at 1024 must be green unchanged), then gate 2 (cp3 capture.json), gate 3, commit.
- resumed 2026-11-08 on core main 047f71cb (report spec v4, PR #450: the report definition owns column fit, staging `column-fit-decisions.md`; PR #451: words never split). Work done between the stop and this resume by driver-dispatched agents (not the implementer; staging `books-v4-followup-report.md`, `books-tb-phone-report.md`): `generalLedgerDisplay()` (one line from 1040 px, type 12ch, figures and No. max-content, description flexGrow 2, tablet layout minWidth 600px); the Trial Balance `Display.Columns` (account wraps on two lines, decision 3); `TestGeneralLedgerSpecLoads`, `TestTrialBalanceSpecLoads` (golden v4), `report_sources_test.go` (`debitToDay` v4) for v4; e2e GL 7/8 assert the settled layout with core's `waitForTableFit` (`mobile`; `tablet` at 900 and 1024; `one-line` at 1280); TB phone test narrowed to the seeded accounts, automatic lines, whole words, nothing cut (valid at 375 and 390). These test changes are caused by core and are accepted as resolved, the same as the 2026-11-08 test-writer changes for PR #447.
- dispute 2 settled on core 047f71cb: the human's column-fit decision 1 ("GL at 1024: tablet layout") answers it; the GL spec's `oneLine.minWidth` 1040px makes the 1024 choice independent of the data (the unstable choice the last stop saw is gone); e2e 8 green at 900, 1024 and 1280.
- plan and spec amended (runner, for spec v4): spec §5 gains the `display` column-fit sentence; spec §3 Every width fits names the one accepted Type exception (column-fit design §3: "Journal entry" whole, "Void reversal of JE-10" may end in "…"); plan checkpoint 3 Files (GL `Display` fit, TB `report_trial_balance.go` + its test, `report_sources_test.go`, TB phone test text, `docs/specs/trial-balance-design.md`), Interfaces (`DisplayOneLine`, `ColumnFit`, `waitForTableFit`; Produces `generalLedgerDisplay`), Gates (1024 reason), Spec quotes, `TestGeneralLedgerLayouts` also pins the column fit, e2e 8 `waitForTableFit`, Do 1. `docs/specs/trial-balance-design.md` e2e item 9 corrected (automatic lines, whole words). plan-check 0 errors; brief rebuilt.
- test writer (v4 addition; staging cp/cp3-tests-v4.md): `TestGeneralLedgerLayouts` pins `OneLine.MinWidth` 1040px, tablet `MinWidth` 600px and the whole `Columns` map from spec §5; shown red with two wrong expectations (1040→1024, 12ch→8ch), then green. All test files staged.
- implementer: no new dispatch — the source already held every setting (cp3-impl.md for Do 1–5; the v4 follow-up for `Display`).
- gate 1 (resume): tests unedited: yes · check pass (biome, tsc, vitest 192 files / 3676) · go test ./... ok · e2e `general-ledger:` 12/12 · trial-balance.spec.ts 12/12 (logs staging cp/cp3-g1-*.log).
- gate 2 capture: 13 shots × 2 schemes (populated 390/900/1024/1280, more 390/1280, and the 390 shot of collapsed, rows-all, filtered, sorted, all-dates, customize, empty-filtered; loading, error, timeout, no-access and unfiltered empty are core-owned, P8, as at cp 2). First run: customize-390 failed — at 390 Customize sits in core's toolbar overflow menu, so `report-customize-open` is not on screen → manifest opens `toolbar-more-button`, then "Customize"; re-captured.
- gate 2 (critique.md): invalid shots: none · blocking: 3, one root cause — on the tablet layout's line 2 (900, 1024) Split is cut ("Accounts rec…") and Name is about 82 px while Description has spare room; core v4 places an authored line from each column's min/natural and uses spans only for spare room (column-fit design §3.2), so the authored 3·5·4 tracks are not what the reader sees → accepted, fix item 1 (Books column fit for Split/Name in `generalLedgerDisplay()`; the 1280 Split NOTE folds into it) and item 2 (e2e 8 checks Split whole) · notes: 4 more → Design notes.
- gate 3 A (correctness): 0 BLOCK, 11 NOTE — NOTEs 1, 2, 4, 8 (comment/text in touched files) → fix items 3, 4, 8, 6; NOTE 6 (help regexes match unrelated text) → fix item 7 (weak-test); NOTE 3 → spec §11 corrected by the runner (item 9), the revision part → Design notes; NOTEs 5, 7 → Design notes; NOTEs 9–11 (out-of-plan files, no test weakened) → Out-of-plan changes.
- gate 3 B (conformance): script lines: 0 · finding 1 (plan file out-of-plan) → recorded under Out-of-plan changes (the runner's amendment, as at cp 2) · 2 → item 3 · 3 → item 4 · 4 TB screenshot leftover → item 5 · 5 plan item 9 text → item 9 (runner) · 6 help retained earnings → item 6 · 7 spec §7 10a → item 9 (runner); deferrals: none.
- reviewer-caught deferrals: none.
- gate 3 A notes: 3 to Design notes (NOTEs 3 revision part, 5, 7).
- fix round 1 (staging cp/cp3-fix.md, items 1–9): test writer items 2, 3, 5, 7, 8 (cp3-fix-tests.md; e2e 8 red "Split cut at 900/1024/1280" with a long entry memo — with a short memo Split kept its width; help "sections are open" pinned); implementer items 1, 4, 6 (cp3-fix-impl.md: `name` minWidth 16ch, `split` minWidth 20ch — core `shareWidth` gives each column its min first; spec §5 sentence extended; fixture tablet `minWidth`; help retained-earnings sentence); the settled Go expectation from spec §5 by a fresh test writer (cp3-fix-tests-2.md, red → green); item 9 by the runner. Test disputes: none. Declared differences: none.
- gate 1 after the fix: tests unedited: yes · check pass · go test ./... ok · e2e `general-ledger:` 12/12 · trial-balance 12/12. Every shot re-captured (13 × 2); first critique kept as `evidence/cp3/critique-1.md`.
- fix review: round 1: 0 BLOCK, 1 NOTE → Design notes (cp3-fix-review.md) · fresh critic on the re-captured set (critique.md): 0 INVALID, 0 BLOCKING (the 3 are gone: Split and Name whole on tablet line 2), 8 NOTE — 4 new → Design notes, 4 already there (heading sort control on wrap layouts, more-390 toolbar, collapsed 0.00; and the 1280 Split note is fixed). Rounds: 1.
- deferrals: none · rebuttals: none.
- human: n/a (mode C)
- commit: bdaec3b (books, branch books/p5-general-ledger; not pushed)

## Final review
- eval: approved 2026-11-08 by the human; CI full suite green at 3f5e261 (PR books#34, run 42537025783 attempt 2, after core PR #452 report-engine performance fix); CI fixes: Banking dialog ⌘↵ scope owner (cb19429, 3f5e261); retro items pending the human.

## Performance (p5-report-engine-scale)

Measure: `BOOKS_SCALE=1 BOOKS_SCALE_OUT=<dir> go test -run 'TestGLScale$' -timeout 60m -v .` in `books/server` (`report_general_ledger_scale_test.go`). The book is the A/R Aging bulk writer's book with its income spread over 100 income accounts (107 accounts) and its monthly balances stored. Bar, as the human changed it on 2026-11-20 (section "Task 7" below): at 500,000 journal lines, median of 5, a run of one month with an Accounts filter (runs 3, 4) takes 1 s or less, and a run of a year with an Accounts filter (run 5) may be slightly over 1 s; the measure holds it to 2 s. Until 2026-11-20 the bar was 1 s or less for runs 3, 4 and 5.

### Baseline (2026-11-19, core 4690f72e, books 381fe701)

| run | 10,000 lines | 100,000 lines | 500,000 lines |
|---|---|---|---|
| 1 all accounts, month | 467 ms | 4,328 ms | refused after 19.3 s (time limit) |
| 2 all accounts, year | 572 ms | 5,208 ms | refused after 19.6 s |
| 3 busy account, month (filtered) | 326 ms | 2,527 ms | 13,772 ms |
| 4 small account, month (filtered) | 142 ms | 1,434 ms | 7,219 ms |
| 5 three accounts, year (filtered) | 401 ms | 3,472 ms | refused after 17.2 s |

Every run grows in line with the journal lines. Run 3 at 500,000 lines: statement 4 (the section rows) takes 2.4 s, statement 5 (the Total row) 3.9 s and statement 6 (the page of detail rows) 7.2 s. They read `books_journal_lines` by `SCAN` 3, 9 and 12 times (the report's rows, read again by each part of the statement; the earlier-years P&L lookups) and by `SEARCH … idx_books_jlines_account_date (account>? AND account<?)` 3, 4 and 6 times (the beginning balance: three subqueries for one sum, read again for each detail row of the page).

### Decision: the beginning balance reads the stored monthly balances

Direct SQL on the 500,000-line book (7 accounts, best of 3):

| read | time | plan |
|---|---|---|
| rows of one account and one month, as the engine writes the filter | 81 ms | no search of `books_journal_lines` |
| the same rows, bounds on the stored `account` and `date` | 0.6 ms | `SEARCH idx_books_jlines_account_date (account=? AND date>? AND date<?)` |
| beginning balances, 3 correlated subqueries per account (today) | 1,056 ms | 3 × `SEARCH (account=? AND date<?)` |
| beginning balances, one grouped aggregate over the lines | 414 ms | `SCAN … USING INDEX idx_books_jlines_account_date` |
| the same, one account's keys pushed in | 84 ms | `SEARCH (account=? AND date<?)` |
| beginning balances from `books_account_balances` | 0.08 ms | `SCAN books_account_balances USING INDEX idx_books_balances_account_period` |
| earlier-years P&L sum from the lines (today) | 131 ms | `SEARCH l (account=?)` per P&L account |
| earlier-years P&L sum from `books_account_balances` | 0.04 ms | `SEARCH g (account=? AND period<?)` |

A beginning balance read from the lines costs time in line with the account's whole history, whatever the query form. `books_account_balances` (one row per account and month, written by posting, with verify and rebuild) answers it at any size. The beginning balance becomes the stored months before the period's first month plus the lines of that month before the period. The filter bounds and the grouped lookup are still needed for the period's own lines. Plan: `tinycld/docs/plans/2026-11-19-report-engine-scale.md`.

### Changes

(Each later task of the plan adds its change here: the SQL before and after, its plan, its time.)

#### Task 2: the filter bounds the base table (core `server/reports/bounds.go`)

The WHERE of `w` (the report's rows), before: `(posted IS ? AND (substr(NULLIF(substr(t1.date, 1, 10), ''), 1, 10) >= ? AND … <= ?) AND (NULLIF(t2.id, '') IN (SELECT +value FROM json_each(?))))`. After: `t1.date >= ? AND t1.date <= (? || x'ff') AND t1.account IN (SELECT +value FROM json_each(?)) AND <the filter as before>`.

| run, 100,000 lines | before (baseline) | after |
|---|---|---|
| 1 all accounts, month | 4,328 ms | 3,734 ms |
| 2 all accounts, year | 5,208 ms | 4,682 ms |
| 3 busy account, month (filtered) | 2,527 ms | 2,109 ms |
| 4 small account, month (filtered) | 1,434 ms | 1,132 ms |
| 5 three accounts, year (filtered) | 3,472 ms | 2,998 ms |

Plan of `books_journal_lines` in run 3: every read of the report's rows is now `SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)` (1 in statement 4, 7 in statement 5, 8 in statement 6); before, each was a `SCAN`. What stays: the beginning-balance lookups, `SEARCH … (account>? AND account<?)` (3 in statement 4), and the earlier-years P&L lookups, `SCAN books_journal_lines` (2 in statements 4 and 5, 4 in statement 6). Statement times of run 3: 384 ms, 552 ms, 1,117 ms.

Every run fell, by 10 % to 21 %. Most of the time is still in the beginning-balance and earlier-years lookups, which tasks 4 and 5 change.

#### Task 4: the beginning balance reads the stored months (2026-11-19)

Before: each section's beginning balance was a sum over every posted line of the account before the period (`lk1`, in each of a run's three long statements), and over every income and expense line of earlier fiscal years on retained earnings. After: the stored months before the period's first month (`books_account_balances`, by `month_start`), plus the posted lines of that month before the period. Core gained `Field.SameCurrencyAs` so that the two sources' amounts add (core money rule R24, extended). The rows are the same: `TestGeneralLedgerBeginningBalanceFromStoredMonthsEqualsTheLines` compares 21 runs row for row.

| run, 100k lines | before | after |
| --- | --- | --- |
| 1 all accounts, month | 3,734 ms | 730 ms |
| 2 all accounts, year | 4,682 ms | 2,157 ms |
| 3 busy account, month | 2,109 ms | 334 ms |
| 4 small account, month | 1,132 ms | 194 ms |
| 5 three accounts, year | 2,998 ms | 1,205 ms |

Run 3, plan lines of `books_journal_lines` and `books_account_balances`, statements 4, 5 and 6 (the harness writes only the lines that name `books_journal_lines`, so no `books_account_balances` line is shown):

Statement 4 (45.7 ms):

```
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
```

Statement 5 (44.8 ms): 7 × `SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)`, then 3 × `SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)`.

Statement 6 (214.5 ms):

```
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)   (× 7)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)          (× 3)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)          (× 3)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (entry>? AND entry<?)               (× 2)
```

No `SCAN books_journal_lines` is left in a filtered run (the earlier-years P&L sum now reads the stored months). Every run fell, by 54 % to 84 %; no filtered run is slower.

What is left in the time: the detail statement (statement 6) is the longest of each run (run 3 214.5 ms of 334 ms, run 5 947.4 ms of 1,205 ms), and in it the month-to-date lookup is still read as three subqueries by `SEARCH … (account>? AND account<?)`, which reads the account's whole history and not its first month (tasks 5 and 6), next to the period's own rows, read 9 times by `SEARCH … (account=? AND date>? AND date<?)`.

#### Task 5c: a detail statement with sections computes its rows once (core `server/reports/rows.go`, 2026-11-19)

The detail statement read the period's lines once for each CTE that names `w` (the section's fills, its aggregates, the sorted rows). `w` is now `MATERIALIZED` there, as in the group statement, and in the Total row's statement (its level CTEs read `w`). A detail page with no section CTEs keeps `w` inline.

| run, 100k lines | before | after |
| --- | --- | --- |
| 1 all accounts, month | 730 ms | 583 ms |
| 2 all accounts, year | 2,157 ms | 1,601 ms |
| 3 busy account, month | 334 ms | 240 ms |
| 4 small account, month | 194 ms | 122 ms |
| 5 three accounts, year | 1,205 ms | 824 ms |

Plan, the detail statement of run 5, reads of `books_journal_lines` by `(account=? AND date>? AND date<?)`: before 9; after 1. The Total statement of run 5: before 7, 122.4 ms; after 1, 85 ms.

Every run fell, by 20 % to 37 %; runs 1 and 2 (no Accounts filter) are not slower. Run 5 fell by 381 ms, more than the 100 to 270 ms the plan expected. The detail statement is still the longest of each run (run 5 651.9 ms of 824 ms, run 3 138.4 ms of 240 ms).

#### Task 6: a day comparison in a lookup's where bounds the stored day (core `server/reports/lookup.go`, 2026-11-19)

A lookup's where compared a line's day through `substr()`. A comparison of the day with a day of the period now also bounds the stored column (`date >= lo AND date <= (hi || x'ff')`), next to the where. Alone it changes no plan line: the account is still bound by a range, so SQLite does not use `date` after it (task 5).

| run, 100k lines | before | after |
| --- | --- | --- |
| 1 all accounts, month | 583 ms | 545 ms |
| 2 all accounts, year | 1,601 ms | 1,626 ms |
| 3 busy account, month | 240 ms | 254 ms |
| 4 small account, month | 122 ms | 130 ms |
| 5 three accounts, year | 824 ms | 824 ms |

Plan, the detail statement of run 5 (statement 6, 201 rows), reads of `books_journal_lines`: before and after the same, 1 × `SEARCH … idx_books_jlines_account_date (account=? AND date>? AND date<?)`, 6 × `SEARCH … idx_books_jlines_account_date (account>? AND account<?)`, 2 × `SEARCH … idx_books_jlines_entry (entry>? AND entry<?)`. Every plan line of every run is the same as in task 5c; only the statement text grew (run 5 statement 6: 31,868 -> 33,059 chars).

The measure was taken twice. The first run (log `scale-task6.log`) ran on a loaded machine (another lane's e2e run: load average 11.8; the fixture write, which no reports code touches, was 23 % slower) and gave 670 / 2,057 / 291 / 162 / 1,020 ms. The second run, on a quiet machine (`scale-task6-b.log`), is the one recorded above: every run is within 7 % of task 5c, no run is slower by more than the run's variation.

#### Task 5: a lookup on a known link searches the link and the day (core `server/reports/lookup.go`, 2026-11-19)

A lookup's where bounded the account column by a range, so that a blank account (the Total row, a section with no account) reads the lines with no account; under a range SQLite did not use the day. Each part of the lookup is now written in two forms: where the account is known, `account = V` with the day bound of task 6; where it is blank, the range as before. A row runs one form.

| run, 100k lines | before | after |
| --- | --- | --- |
| 1 all accounts, month | 545 ms | 357 ms |
| 2 all accounts, year | 1,626 ms | 1,363 ms |
| 3 busy account, month | 254 ms | 178 ms |
| 4 small account, month | 130 ms | 140 ms |
| 5 three accounts, year | 824 ms | 713 ms |

Plan, the detail statement of run 5 (statement 6, 201 rows), reads of `books_journal_lines`: before 1 × `SEARCH … idx_books_jlines_account_date (account=? AND date>? AND date<?)`, 6 × `SEARCH … idx_books_jlines_account_date (account>? AND account<?)`, 2 × `SEARCH … idx_books_jlines_entry (entry>? AND entry<?)`; after 7 × `(account=? AND date>? AND date<?)`, 6 × `(account>? AND account<?)` (the range form, which a row with a known account does not run), 2 × `idx_books_jlines_entry (entry=?)` and 2 × `(entry>? AND entry<?)` (the Split lookups on the entry link get the two forms too). The detail statement: run 5 622.8 ms to 544 ms, run 3 134.3 ms to 107.2 ms. Its text grew (run 5: 33,059 -> 43,517 chars).

Runs 1, 2, 3 and 5 fell, by 13 % to 34 %; run 3 fell more than the 5 to 20 % the plan expected. Run 4 is 8 % slower (its detail statement 63 ms to 76.6 ms): the cost of the `CASE` test over the two forms on a page with few lines; under the 25 % limit of the task. Measured on a quiet machine (`scale-task5.log`).

#### Task 5d: a detail row's own lookups run for the page's rows (core `server/reports/run.go`, 2026-11-20)

The detail statement computed every cell of every row of the period and cut the page last, so the Split and name lookups ran for each row of the period to show 200. The statement is now two selects: below the page cut, each row with its sort keys, its running balance and the beginning balance the running balance reads; above it, the row's own lookups and the cells, for the page's rows.

| run, 100k lines | before | after |
| --- | --- | --- |
| 1 all accounts, month | 357 ms | 310 ms |
| 2 all accounts, year | 1,363 ms | 706 ms |
| 3 busy account, month | 178 ms | 167 ms |
| 4 small account, month | 140 ms | 144 ms |
| 5 three accounts, year | 713 ms | 377 ms |

The detail statement (statement 6, 201 rows; run 4: 1 row): run 5 544 ms to 248.2 ms, run 3 107.2 ms to 97.9 ms, run 2 1,070.2 ms to 487.9 ms, run 4 76.6 ms to 79.8 ms. Plan, the detail statement of run 5, reads of `books_journal_lines`: before and after the same, 7 × `SEARCH … idx_books_jlines_account_date (account=? AND date>? AND date<?)`, 6 × `(account>? AND account<?)`, 2 × `idx_books_jlines_entry (entry=?)`, 2 × `(entry>? AND entry<?)`. Its text: 43,517 -> 42,435 chars. What stays in the statement (measured before the change, `parts.md`): the rows, their records and the sort, the beginning balance for each account, and the running balance.

The measure was taken twice. The first run (`scale-task5d.log`, quiet machine, core 9dacb519) gave 422 / 754 / 220 / 194 / 431 ms: run 4 39 % above task 5 (detail statement 76.6 -> 130.4 ms), over the 25 % limit. Cause: SQLite flattened the layers above the page cut into the cells select and copied each hoisted value into each read (859 scalar subquery lines in the plan against 563; the earlier-years balance 25 times, about 40 ms on every run). Fix (core 9f515b30, tests 10029574): the page and the cells are each a `MATERIALIZED` select of a nested `WITH`, so each layer is computed once. The second run (`scale-task5d-b.log`, quiet machine, load 2.75, core 10029574) is the one recorded above: runs 3 and 4 within 7 % of task 5, run 5 47 % lower, run 2 48 % lower.

#### Task 7: the result at 500,000 lines, and the changed bar (2026-11-20)

Measured on a quiet machine (1-minute load 2.75), core 10029574, books 9a68a199, `BOOKS_SCALE=1`, the 500k size. Median of 5.

| run, 500k lines | baseline (2026-11-19) | now | bar |
| --- | --- | --- | --- |
| 1 all accounts, month | refused (time limit) | 582 ms | none |
| 2 all accounts, year | refused (time limit) | 2.733 s | none |
| 3 busy account, month | 13,772 ms | 231 ms | 1 s |
| 4 small account, month | 7,219 ms | 147 ms | 1 s |
| 5 three accounts, year | refused (time limit) | 1.418 s | 2 s |

The long statements, one sample each (statement 4 the section rows, 5 the Total row, 6 the detail page): run 3 34.6 / 30.6 / 144.6 ms; run 4 25.1 / 19.5 / 80.5 ms; run 5 192.9 / 203.7 / 986.2 ms; run 1 113 / 108.3 / 342.5 ms; run 2 346.7 / 379.4 ms / 1.9985 s. Plan, the detail statement of run 5 (201 rows, 42,435 chars), reads of `books_journal_lines`: 7 × `SEARCH … idx_books_jlines_account_date (account=? AND date>? AND date<?)`, 6 × `(account>? AND account<?)`, 2 × `idx_books_jlines_entry (entry=?)`, 2 × `(entry>? AND entry<?)`; no `SCAN`. The detail statement of run 2 (no Accounts filter, no bar) has 1 `SCAN books_journal_lines`.

Runs 3 and 4 meet the old bar of 1 s or less. Run 5 is 1.418 s: over it. The human decided on 2026-11-20: the bar is changed, not the engine. A filtered run of one month takes 1 s or less at 500,000 lines; a filtered run of a year may be slightly over, and run 5's 1.418 s is accepted. The human set the year bar to 2 s on 2026-11-20. The four further cuts for run 5 that were written up (options A to D) are not built. The measure (`TestGLScale`) now holds each run to its own bar: `glMonthBar` 1 s for runs 3 and 4, `glYearBar` 2 s for run 5, none for runs 1 and 2; `TestGLScaleBars` pins them. The same bar applies to the Trial Balance, the Balance Sheet and Transaction Detail.

A separate decision of the human on 2026-11-19 (not built yet; a later part of this unit) takes the reports that read all journal lines, the General Ledger among them, off live refresh: once it is built, a year run over 1 s costs the reader one wait, when the reader asks for it.

### Trial Balance, Balance Sheet and Transaction Detail: the measure and its baseline

The measure is `TestStatementsScale` (`server/report_statements_scale_test.go`): the General Ledger's scale book with cash-basis rows for one entry in four, and eleven runs. The bars at 500,000 lines are the human's decision (2026-11-20) and map so: Transaction Detail's runs with an Accounts filter take 1 s or less for a month and 2 s or less for a year (the General Ledger's runs); Transaction Detail's two runs with no Accounts filter take 2 s or less (month and year); a Trial Balance with an Accounts filter takes 1 s or less; the Trial Balance of every account and the Balance Sheet (no Accounts filter, two days) take 2 s or less, on Accrual and on Cash. `TestStatementsScaleBars` pins the runs and the bars.

Baseline at 100,000 lines (median of 5, core ff0d61b4, books 4fe9210c, before any change for these reports):

| lines | run | median of 5 | group rows | rows |
|---|---|---|---|---|
| 100000 | TB 1 all accounts, as of | 744ms | 106 | 107 |
| 100000 | TB 2 busy account, as of | 480ms | 1 | 2 |
| 100000 | TB 3 three accounts, as of | 565ms | 3 | 4 |
| 100000 | BS 1 accrual, as of | 1.389s | 10 | 20 |
| 100000 | BS 2 cash, as of | 1.708s | 10 | 20 |
| 100000 | TD 1 all accounts, month | refused after 10.056s: reports: the report took too long to run | n/a | n/a |
| 100000 | TD 2 all accounts, year | refused after 10.128s: reports: the report took too long to run | n/a | n/a |
| 100000 | TD 3 busy account, month | refused after 10.06s: reports: the report took too long to run | n/a | n/a |
| 100000 | TD 4 small account, month | 312ms | 1 | 4 |
| 100000 | TD 5 three accounts, year | refused after 10.087s: reports: the report took too long to run | n/a | n/a |
| 100000 | TD 6 busy account, month, cash | refused after 10.071s: reports: the report took too long to run | n/a | n/a |

Before this unit (`other-reports-scale.txt`, 2026-11-19): Trial Balance 960 ms and Balance Sheet 1,280 ms at 100k (5,225 ms and 6,496 ms at 500k); Transaction Detail refused at 100k, also with one account.

Reads of the line tables in the longest statement of each report (`scale-task9a/st-plans.md`):

Run TB 1 all accounts, as of:

### statement 5: 488.1ms, 106 rows, 10129 chars

```
SCAN books_journal_lines
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
```

Run BS 1 accrual, as of:

### statement 5: 1.2785s, 14 rows, 68537 chars

```
SCAN books_journal_lines
SCAN books_cash_basis_lines
```

Run TD 3 busy account, month (refused; the statement with the most chars):

### statement 6: not timed (the run was refused), 12399 chars

```
SCAN books_journal_lines
SCAN books_cash_basis_lines
```

#### Task 9b: a bound on a union source is written inside each part (core `server/reports/stmt.go`, 2026-11-20)

The Balance Sheet and Transaction Detail read the union source `books.basis_lines` (parts `books_journal_lines` and `books_cash_basis_lines`). Before: a scope read the union's rule CTE (`FROM r<n> t<n>`) and the bounds of the filter and of a lookup's where were conditions on the union's rows. SQLite moves no condition into the parts of a `UNION ALL`, so each read was a `SCAN` of both tables, and a lookup read them once for each row of the report. After: the scope writes the union itself, each part from its own collection's rule CTE with the bounds on the part's own columns: `FROM (SELECT … FROM r<a> p WHERE p.account IN (…) AND p.date >= ? AND p.date <= (? || x'ff') UNION ALL SELECT … FROM r<b> p WHERE …) t<n>`. A part that does not store a key of a bound reads its rows without that bound. The switch `legacySQL.noPartBounds` gives the old statement; `partbounds_test.go` holds the plans and the same-result tests.

Not fixed by this task: Transaction Detail with no Accounts filter (TD 1, TD 2). Its lookups search by entry now, but its base rows have a day bound alone, and no index of the two tables starts with the day: the plan still shows `SCAN books_journal_lines` and `SCAN books_cash_basis_lines`, and `SEARCH t1 USING AUTOMATIC PARTIAL COVERING INDEX (currency=?)`. A later task of this unit handles it.

At 100,000 lines (median of 5, core f4296bb0, books d9a695a7):

| run | baseline (task 9a) | after task 9b | group rows | rows |
|---|---|---|---|---|
| TB 1 all accounts, as of | 744ms | 738ms | 106 | 107 |
| TB 2 busy account, as of | 480ms | 432ms | 1 | 2 |
| TB 3 three accounts, as of | 565ms | 516ms | 3 | 4 |
| BS 1 accrual, as of | 1.389s | 1.373s | 10 | 20 |
| BS 2 cash, as of | 1.708s | 1.746s | 10 | 20 |
| TD 1 all accounts, month | refused | 153ms | 2 | 201 |
| TD 2 all accounts, year | refused | 1.554s | 1 | 201 |
| TD 3 busy account, month | refused | 29ms | 1 | 201 |
| TD 4 small account, month | 312ms | 18ms | 1 | 4 |
| TD 5 three accounts, year | refused | 125ms | 1 | 201 |
| TD 6 busy account, month, cash | refused | 31ms | 1 | 201 |

Reads of the line tables in statement 6 (the page of detail rows) of TD 5 three accounts, year, and of TD 2 all accounts, year (scale-task9b/st-plans.md):

TD 5 three accounts, year (statement 6: 70.1ms, 201 rows, 14691 chars):

```
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)
SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_date (account=? AND date>? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_entry (entry>? AND entry<?)
SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_entry (entry>? AND entry<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_entry (entry>? AND entry<?)
SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_entry (entry>? AND entry<?)
```

TD 2 all accounts, year (statement 6: 1.4916s, 201 rows, 17000 chars):

```
SCAN books_journal_lines
SCAN books_cash_basis_lines
SEARCH books_journal_lines USING INDEX idx_books_jlines_entry (entry>? AND entry<?)
SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_entry (entry>? AND entry<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_entry (entry>? AND entry<?)
SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_entry (entry>? AND entry<?)
```

The measure prints only the plan lines that name `books_journal_lines`, `books_cash_basis_lines` or `books_account_balances`, so an `AUTOMATIC` index on `t<n>` and a `MATERIALIZE` line do not show in `st-plans.md`; the `AUTOMATIC` line of TD 2 named above is from the small book. The Balance Sheet's one statement still reads both tables with 7 `SCAN`s each (BS 1 1.3141 s, BS 2 1.6385 s), and each Trial Balance statement has one `SCAN books_journal_lines`, also with an Accounts filter.

No run is refused at 100k.

#### Task 9c-1: the Trial Balance reads the stored months (books `server/report_trial_balance.go`, 2026-11-20)

Before: every figure of the Trial Balance was a sum over the posted lines of the account up to the As of day, so each run read the account's whole history (`SCAN books_journal_lines` in each statement, also with an Accounts filter). After: the report's rows are the posted lines of the month of the As of day; Debit and Credit add a lookup over the stored month balances (`books_account_balances`) of the months before it; the Total adds the account rows shown; an account with stored months and no line in the month gets a row through the fill. The figures do not change: `TestTrialBalanceStoredMonthsEqualTheLines` runs the line read beside the new read.

What the reader sees (human decision, 2026-11-20): an opened account shows "Balance before" and the month of the As of day, then the posted lines of that month up to the day. Lines of earlier months do not show there; a press on the Debit or Credit figure still opens every line. The opened Retained earnings row no longer lists the lines of earlier fiscal years: its opening row holds them.

At 100,000 lines (median of 5, core 7433b88b, books a651fe8f):

| run | after task 9b | after task 9c-1 | group rows | rows |
|---|---|---|---|---|
| TB 1 all accounts, as of | 738ms | 330ms | 106 | 107 |
| TB 2 busy account, as of | 432ms | 149ms | 1 | 2 |
| TB 3 three accounts, as of | 516ms | 178ms | 3 | 4 |
| BS 1 accrual, as of | 1.373s | 1.424s | 10 | 20 |
| BS 2 cash, as of | 1.746s | 1.852s | 10 | 20 |
| TD 1 all accounts, month | 153ms | 163ms | 2 | 201 |
| TD 2 all accounts, year | 1.554s | 1.646s | 1 | 201 |
| TD 3 busy account, month | 29ms | 30ms | 1 | 201 |
| TD 4 small account, month | 18ms | 18ms | 1 | 4 |
| TD 5 three accounts, year | 125ms | 130ms | 1 | 201 |
| TD 6 busy account, month, cash | 31ms | 32ms | 1 | 201 |

Reads of the line tables and of the stored months in the longest statement of TB 1 all accounts, as of, and of TB 2 busy account, as of (scale-task9c1/st-plans.md):

TB 1 all accounts, as of (statement 5: 245.5ms, 106 rows, 38673 chars):

```
SCAN books_journal_lines
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_account_balances
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_account_balances
SCAN books_account_balances
SEARCH books_account_balances
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
```

TB 2 busy account, as of (statement 5: 102.2ms, 1 rows, 38921 chars):

```
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_account_balances
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_account_balances
SCAN books_account_balances
SEARCH books_account_balances
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date<?)
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account>? AND account<?)
```

A `SCAN books_journal_lines` line is still in a Trial Balance statement only in TB 1 all accounts, as of (statements 5 and 6: the base rows of the month have no Accounts filter, and no index of the table starts with the day); TB 2 and TB 3 read the lines by `SEARCH` on `idx_books_jlines_account_date` alone.

No run is refused at 100k.

#### Task 9c-2: the Balance Sheet reads the stored months (books `server/report_balance_sheet.go`, 2026-11-20)

Before: Current and Prior year of every account, Retained earnings and Net income were sums over the posted lines up to the day of the column, so each run read the whole history. After: the report's rows are the posted lines of the month of the As of day, on both methods. Current and Prior year of an account add the balance before the month of their day and the lines of that month. On Accrual the balance before the month is a lookup over the stored month balances (`books_account_balances`); on Cash it is a lookup of the account's lines, because no stored month holds the cash rows. An account with stored months and no line in the month gets a row through the fill, under its own section, class and type. Retained earnings and Net income read the stored months plus the lines of their day's month on Accrual. The figures do not change on either method: `TestBalanceSheetStoredMonthsEqualTheLines` runs the line read beside the new read.

What the reader sees (human decision, 2026-11-20): an opened account shows "Balance before" and the month of the As of day, then the posted lines of that month up to the day, on Accrual and on Cash. Lines of earlier months do not show there; a press on the Current or Prior year figure still opens every line.

At 100,000 lines (median of 5, core 04ce7268, books 454c8775):

| run | after task 9c-1 | after task 9c-2 | group rows | rows |
|---|---|---|---|---|
| TB 1 all accounts, as of | 330ms | 334ms | 106 | 107 |
| TB 2 busy account, as of | 149ms | 151ms | 1 | 2 |
| TB 3 three accounts, as of | 178ms | 180ms | 3 | 4 |
| BS 1 accrual, as of | 1.424s | 972ms | 10 | 20 |
| BS 2 cash, as of | 1.852s | 4.551s | 10 | 20 |
| TD 1 all accounts, month | 163ms | 166ms | 2 | 201 |
| TD 2 all accounts, year | 1.646s | 1.62s | 1 | 201 |
| TD 3 busy account, month | 30ms | 30ms | 1 | 201 |
| TD 4 small account, month | 18ms | 18ms | 1 | 4 |
| TD 5 three accounts, year | 130ms | 139ms | 1 | 201 |
| TD 6 busy account, month, cash | 32ms | 34ms | 1 | 201 |

Reads of the line tables and of the stored months in the longest statement of BS 1 accrual, as of, and of BS 2 cash, as of (scale-task9c2/st-plans.md):

BS 1 accrual, as of (statement 5: 952.1ms, 14 rows, 195681 chars):

```
SCAN books_journal_lines
SCAN books_cash_basis_lines
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_account_balances
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_account_balances
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_account_balances
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_account_balances
SCAN books_journal_lines
SCAN books_cash_basis_lines
```

BS 2 cash, as of (statement 5: 4.3398s, 14 rows, 195543 chars):

```
SCAN books_journal_lines
SCAN books_cash_basis_lines
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account=?)
SEARCH books_account_balances USING INDEX idx_books_balances_account_period (account>? AND account<?)
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_account_balances
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_account_balances
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_account_balances
SCAN books_journal_lines
SCAN books_cash_basis_lines
SCAN books_account_balances
SCAN books_journal_lines
SCAN books_cash_basis_lines
```

`SCAN books_journal_lines` and `SCAN books_cash_basis_lines` lines are still in a Balance Sheet statement, in statement 5 of BS 1 accrual, as of and in statement 5 of BS 2 cash, as of (17 of each in both runs).

No run is refused at 100k.

BS 2 cash, as of is a regression: 4.551s after task 9c-2 against 1.852s after task 9c-1. BS 1 accrual, as of is faster (972ms against 1.424s). The group rows (10) and rows (20) of BS 1 and BS 2 are the same as in the run before.

#### Task 9d-1: the Cash Balance Sheet reads the stored months (books `server/report_balance_sheet.go`, 2026-11-20)

The cash basis is the ledger and the cash-basis rows. The stored months are the ledger's, so a Cash run reads them too; of the months before a day's month it reads as lines only the cash-basis rows (layer `cash`). Before this task a Cash run added every journal line of the book for each lookup (4.551 s at 100,000 lines: 0.26 s compile, the rest SCANs of both line tables).

| lines | run | before (task 9c-2) | after |
|---|---|---|---|
| 100000 | BS 1 accrual, as of | 972ms | 940ms |
| 100000 | BS 2 cash, as of | 4.551s | 1.965s |

Median of 5, core 25d6ecac, books 627e24c7; the group rows (10) and rows (20) of BS 1 and BS 2 are the same as before. Statement 5 of BS 2 (1.751s) has 21 `SCAN books_journal_lines` and 21 `SCAN books_cash_basis_lines` (17 of each after task 9c-2; BS 1 has the same 21 of each), and the statement is 259,542 chars (195,543 after task 9c-2). The SCANs are still there, but the Cash history lookups now keep only the rows of layer `cash`, so each reads less. The bar is 2 s at 500,000 lines for both methods; tasks 9d-2, 9e-1 and 9e-2 of the plan outline are what is left for it.

#### Task 9e-1: the Balance Sheet drill reads its first day from the stored months (books `server/report_spec_helpers.go`, 2026-11-20)

A figure's drill opens Transaction Detail by Account from the account's first line up to the column's day. The first day was a `min(date)` over the account's lines, once for Current and once for Prior year (about 0.5 s of the Accrual run at 100,000 lines). It is now the first day of the account's first stored month; on Cash the month of the account's first cash-basis row is read too. The drilled period starts on the 1st of the first line's month (human decision, 2026-11-20) and lists the same lines.

| lines | run | before (task 9d-1) | after |
|---|---|---|---|
| 100000 | BS 1 accrual, as of | 940ms | 456ms |
| 100000 | BS 2 cash, as of | 1.965s | 1.508s |

Median of 5, books 63cdf3cb (the 1-minute load was 5.77 when the run started, so the figures may be slightly high); the group rows (10) and rows (20) of BS 1 and BS 2 are the same as before. Statement 5 of BS 1 (480.2ms, 262,040 chars) and of BS 2 (1.364s, 261,956 chars) each have 21 `SCAN books_journal_lines` and 21 `SCAN books_cash_basis_lines` (21 of each after task 9d-1), 4 `SCAN books_account_balances`, and 18 `SEARCH books_account_balances` by index (14 after task 9d-1: the four new ones are the stored-month lookups of the drills). The count of SCANs did not change: the drills' cash-row lookups SCAN the line tables in place of the old `min(date)` lookups, but on Accrual they hold `method = cash` and read almost nothing. On Cash the cost left is the SCANs of the layer-`cash` rows before the month. The bar is 2 s at 500,000 lines for both methods; tasks 9d-2 and 9e-2 of the plan outline are what is left for it, each decided from a 500k run.

#### Task 9d-2a: the stored cash months (books `server/cash_balances.go`, 2026-11-20)

The table `books_cash_basis_balances` keeps one row for each account and month of the cash-basis rows: `account`, `period` (`YYYY-MM`), `month_start`, `debit_total`, `credit_total` and `currency`, with a unique index on `(account, period)`. Clients can read it and cannot write it. A month with no cash row has no row.

The one writer is `syncCashLineRows`: after it changes the cash rows of a source, it reads again the cash rows of each month it touched and writes that month's totals (`refreshCashBalances`). It does not add a difference, so a month is always the sum of its rows. `verifyCashBalances` compares the stored months with the cash rows added up; `rebuildCashBalances` writes them again from the rows, inside `rebuildBalances`, after `rebuildCashBasis`. `requireNoDrift` and `requireNoCashDrift` now also fail on a drifted cash month.

The collection is an in-place edit of migration `2100000021_create_books_bill_payments.js`, not a new migration: Books has no release (no tag, version 0.1.0), so every database starts empty. The table sits in the file that creates the cash rows it sums, and its `down` drops it with them.

No report reads the table yet; the Cash Balance Sheet reads it in task 9d-2b. So the figures must stay as after task 9e-1, and they do:

| lines | run | before (task 9e-1) | after |
|---|---|---|---|
| 100000 | BS 1 accrual, as of | 456ms | 443ms |
| 100000 | BS 2 cash, as of | 1.508s | 1.465s |

Median of 5, core 8969bdbd, books eb7a2f67, on a quiet machine; no run is refused. The group rows (10) and rows (20) of BS 1 and BS 2 are the same as before, and statement 5 of BS 1 (468.2ms, 262,040 chars) and of BS 2 (1.313s, 261,956 chars) is the same statement as after task 9e-1.

#### Task 9d-2b: the Cash Balance Sheet reads the stored cash months (2026-11-20)

The report source `books.cash_basis_balances` reads the table `books_cash_basis_balances` of task 9d-2a (link `account`; fields `period`, `month_start`, `debit_total`, `credit_total`, `currency`). On Cash, the four reads of the months before a day's month now read the stored cash months in place of the layer-`cash` rows:

- `bsBefore`: the cash part of the beginning balance (`bsCashStoredBefore`).
- `profitAndLossSum`: the cash part of the P&L sums before the month.
- `bsActivity`: an account is active when it has a stored cash month before the month (a month with no cash row has no stored row).
- `firstBasisMonth`: on Cash, the first `month_start` of the account's stored cash months on or before the day.

Each read keeps `onCash()`, so an Accrual run reads no stored cash month. The day's own month is still read from its rows. `onCashLayer` has no caller left and is deleted. `Revision: 7`. The scale book (`writeStatementsScaleBook`) writes its stored cash months by one `INSERT … SELECT … GROUP BY account, substr(date, 1, 7)`, and `TestStatementsScaleBook` checks them against the cash rows.

The tests that hold the figures: `TestBalanceSheetCashMonthsEqualTheLines_Bills` (a bill book with posts, payments, a void, a replaced payment and a corrected bill) and `TestBalanceSheetCashMonthsEqualTheLines_InvoiceCorrection` (an invoice correction that takes over a payment), each with the fiscal year starting in January and in July. They passed before the change and after it. The tests that prove the reads: `TestBalanceSheetReadsTheStoredCashMonths` (a raw change of a stored cash month moves the Cash figure and not the Accrual figure), `TestBalanceSheetCashMonthMakesAnAccountActive`, `TestBalanceSheetCashOpenedAccountRows` and `TestBalanceSheetCashDrillStartsAtTheFirstStoredCashMonth`.

| lines | run | before (task 9d-2a) | after |
|---|---|---|---|
| 100000 | BS 1 accrual, as of | 443ms | 476ms |
| 100000 | BS 2 cash, as of | 1.465s | 519ms |

Median of 5, core 39fb32b8, books aa5831d7 (code commits 502b7c01 and aa5831d7). The machine was NOT quiet: the human said to run it then, with other lanes' Go tests running; the 1-minute load was 6.81 at the start. So the figures may be high; the 7 % rise of BS 1 is not from the code (its plan has fewer SCANs, below). No run is refused, and the group rows (10) and rows (20) of BS 1 and BS 2 are the same as before.

Statement 5 of BS 2 is 558.4ms (1.313s after task 9d-2a), 257,788 chars (261,956). It has 8 `SCAN books_cash_basis_lines` and 8 `SCAN books_journal_lines` (21 of each after task 9d-2a), 4 `SCAN books_account_balances` and 18 `SEARCH books_account_balances` by index (unchanged). Statement 5 of BS 1 has the same counts (497.4ms, 257,878 chars). 13 SCAN pairs of the line tables went with the four reads; which read each of the 8 left belongs to is not checked (the day's own month is still read from its rows). `st-plans.md` lists only the steps that name `books_journal_lines`, `books_cash_basis_lines` or `books_account_balances` (`report_statements_scale_test.go:356`), so the steps over `books_cash_basis_balances` are not in it.

The bar is 2 s at 500,000 lines for both methods. Projected (not measured), whole median × 5.4: BS 1 2.57 s, BS 2 2.80 s (upper figures); with a compile of 0.266 s kept fixed: BS 1 about 1.40 s, BS 2 about 1.63 s. Task 9e-2 of the plan outline (core: the union of a lookup source written once) is decided from the 500k run (task 9e), not from this projection.

#### Task 9b-3: a page's detail rows find their open section through an index (core `server/reports/run.go`, 2026-11-20)

The cause (plan `2026-11-20-report-engine-scale-part27.md`, "The evidence this plan is written from", items 1 and 3): with no Accounts filter the page statement of Transaction Detail read the open sections first and, for each of them, every row of the period (`SCAN gord`, `SEARCH t1 USING AUTOMATIC PARTIAL COVERING INDEX (currency=?)`). A section's key is the id of the joined account, and the index on `t1` held the currency only (one value), so each of the 105 open sections read every row of the period. The scan of the line tables by day (statements 4 and 5, 46 and 37 ms) was not the cost, so no `(date)` index was added.

The change: core `leafFrom` writes `CROSS JOIN gord` with a unary `+` on each key of the row's side. Each of the two is needed. `CROSS JOIN` fixes the join order: SQLite keeps the written order of a CROSS JOIN, so the rows are the outer loop and `gord` is the inner side. The `+` takes the column affinity off the term: a stored column compared with a `json_extract` value of `gord` has an affinity, and an index on `gord` cannot serve such a comparison, so SQLite built none. With no `+`, `CROSS JOIN` alone was slow on a collection: 3.78 s against 0.19 s on 8,000 open groups (`TestAGroupedRunOfManyOpenGroupsReadsItsDetailsOnce`).

General Ledger run 2 did not have the sections x rows join: its plan built one index of all detail rows by the section key (`SEARCH d USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?)`). Its statement changed all the same, so it was measured again.

The tests: the core tests of step 2, `TestAGroupedDetailStatementReadsItsRowsOnce`, `TestAGroupedDetailStatementOfACollectionFindsItsGroupByAnIndex`, `TestTheDetailStatementComputesItsOpenGroupsOnce`, `TestTheOpenGroupJoinOrderKeepsTheResult`, `TestTheOpenGroupJoinMatchesAKeyOfEveryKind`, `TestTheOpenGroupJoinOrderKeepsEveryPage` and `TestAGroupedRunOfAUnionWithManyOpenGroupsReadsItsRowsOnce`; and Books `TestTransactionDetailReadsItsPeriodRowsOnce`.

| lines | run | before | after |
|---|---|---|---|
| 100000 | TB 1 all accounts, as of | 359ms | 345ms |
| 100000 | TB 2 busy account, as of | 162ms | 153ms |
| 100000 | TB 3 three accounts, as of | 192ms | 181ms |
| 100000 | BS 1 accrual, as of | 476ms | 455ms |
| 100000 | BS 2 cash, as of | 519ms | 504ms |
| 100000 | TD 1 all accounts, month | 165ms | 62ms |
| 100000 | TD 2 all accounts, year | 1.691s | 232ms |
| 100000 | TD 3 busy account, month | 33ms | 30ms |
| 100000 | TD 4 small account, month | 21ms | 19ms |
| 100000 | TD 5 three accounts, year | 142ms | 135ms |
| 100000 | TD 6 busy account, month, cash | 35ms | 34ms |
| 100000 | TD 2, statement 6 (the page) | 1.594s | 140ms |
| 100000 | GL 1 all accounts, month | 310ms | 322ms |
| 100000 | GL 2 all accounts, year | 706ms | 694ms |
| 100000 | GL 3 busy account, month | 167ms | 182ms |
| 100000 | GL 4 small account, month | 144ms | 164ms |
| 100000 | GL 5 three accounts, year | 377ms | 396ms |

Median of 5, core ee405c61 (the code commit 9b8ab2ec and the test fix ee405c61), books f89ff706. Before: `scale-task9d2b/st-results.md` for the statements and `scale-task5d-b/gl-results.md` for the General Ledger (other core changes came between that run and this one, so a difference of a General Ledger run is not this task's alone). Both runs PASS and no run is refused. The group rows and rows of every Trial Balance, Balance Sheet and Transaction Detail run, and the sections on the page of every General Ledger run, are the same as before.

The machine was NOT quiet: the human said to run them then. The 1-minute load was 5.86 at the start of the Trial Balance, Balance Sheet and Transaction Detail run and 4.55 at the start of the General Ledger run (`scale-task9b3.quiet`). So the figures may be high; the General Ledger runs 1, 3, 4 and 5 are 4 to 14 % above before, which a noisy machine and the other core changes explain, and this task's change does not reach runs 3 to 5 (they have an Accounts filter).

The plan lines after (`st-plans.md`, `gl-plans.md`), as step 11 expected: TD 2 statement 6 has `SCAN t1`, `BLOOM FILTER ON gord (g0=? AND g1=?)` and `SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=? AND g1=?)`, with no `SCAN gord` and no `SEARCH t1`. General Ledger run 2's statement with a `gord` line (statement 6) has `MATERIALIZE gord`, `SCAN d` and `SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=? AND g1=?)`, with no `SEARCH d USING AUTOMATIC`. The other Transaction Detail and General Ledger runs have the same lines.

What is left for the 2 s bars at 500,000 lines. By the human's decision of 2026-11-20, General Ledger runs 1 and 2 (no Accounts filter) now also have the 2 s bar at 500k (the bar test and `TestGLScale` of the commit after this record). Projected (not measured), whole median x 5.4, the factor of task 9d-2b: TD 1 about 0.34 s, TD 2 about 1.25 s, GL 1 about 1.74 s, GL 2 about 3.75 s. These are upper figures (a fixed compile cost does not grow, and the load was high); on them TD 1, TD 2 and GL 1 are inside the bar and GL 2 is not, so GL 2 is the run to decide from a 500k run. That earlier 500k measure of GL 2 was 2.733 s (plan, evidence item 2), before this change.

#### Task 28a: a page's detail statement computes the rows of the sections it can reach (core `server/reports/run.go`, 2026-11-20)

The cause (plan `2026-11-20-report-engine-scale-part28.md`, "The evidence this plan is written from", item 1): at 500k, General Ledger run 2 was 2.624 s = section rows 355 ms + Total row 391 ms + detail page 1,861 ms. The detail page computed its select (the sort keys, the running balance, the record joins) over the 94,512 period rows of all 106 open sections, to show 201 rows of the first section (11,833 rows).

The change: core `leafRows` writes two CTEs after `gord`: `gcut` (the place of the first open section at which the row count reaches the page size + 1) and `wl` (the rows of the sections up to it, materialized), and the detail select reads `wl`. A section held by a cursor counts as no rows and is always kept. Not cut: a select with a percent of the whole report, a select with a probed condition, a run with one open section, a layout. The limit of `gcut` is an integer literal in the SQL text (`limitSQL`), approved by the human on 2026-11-21.

Two facts the build found (plan, evidence item 3): `wl` must be `MATERIALIZED`, because inline SQLite flattens it into the page select and reads `gord` with `SCAN gord` for each row; and the cut must be a scalar (`gcut`), because a CTE that selects from `gord` puts `SCAN gord` in the plan, which `TestAGroupedDetailStatementReadsItsRowsOnce` and Books `TestTransactionDetailReadsItsPeriodRowsOnce` refuse.

Two more changes of the build:

- A moved group that the cursor holds and that is off the reachable sections: `wl` keeps its shown row by id. `heldLeaves` returns `held` and `away`; with `away` not empty, `wl` joins `gord` with `LEFT JOIN gord` and adds the rows of those ids (their sort keys are the same as over all rows, so the page is the same). Review fix cfc3d9d6: one rule, `movedShown`, names the moved ids for `readShownNow` and `heldLeaves`.
- Books `TestTransactionDetailReadsItsPeriodRowsOnce` (books 3d77acc9, the TD plan guard) read for a `SCAN t1` or `SCAN d` line, which the cut statement does not have (it reads `wl`). It now reads the real plan lines: no `SCAN gord` and no `SEARCH t1`; each line table is scanned once (`SCAN books_journal_lines` and `SCAN books_cash_basis_lines`, one each); at least one `SEARCH gord USING AUTOMATIC` step, and its parent also scans its rows (`SCAN t1`, `SCAN d` or `SCAN w`).

The tests (core `leafrows_test.go`; the plan names six, the file has seven, the last one added by the held-group fix): `TestAPageComputesTheRowsOfTheGroupsItCanReach`, `TestThePagesAreTheSameOverTheGroupsAPageCanReach`, `TestPagesOverTheGroupsTheyReachJoinIntoTheWholeRun`, `TestAPercentOfTheWholeReportKeepsEveryGroupsRows`, `TestAProbedConditionKeepsEveryGroupsRows`, `TestAMovedGroupIsReadOverTheGroupsAPageCanReach` and `TestAMovedGroupOffThePageIsReadOverTheGroupsAPageCanReach`. With the switch on and no change, the first, second and sixth went RED and the others passed (guards); the seventh went RED on the first cut build (the held value of the moved group differed in the next cursor).

One measuring round stands for this task's step 10 and for task 29's step 8 (see that record): core ea0fee56 plus its review fix cfc3d9d6 (the cut), books 3d77acc9, 2026-11-21. It was run at 500,000 lines for both the General Ledger and the statements; the plan's 100k statements run was not made, so the 100k comparison with `scale-task9b3` is not made (the second table is at 500k, before = `scale-500k-final-st`).

General Ledger, 500k (`scale-task28-gl/gl-results.md`; before: `scale-500k-final-gl/gl-results.md`):

| lines | run | before | after |
|---|---|---|---|
| 500000 | GL 1 all accounts, month | 614ms | 513ms |
| 500000 | GL 2 all accounts, year | 2.73s | 1.759s |
| 500000 | GL 3 busy account, month | 246ms | 232ms |
| 500000 | GL 4 small account, month | 164ms | 168ms |
| 500000 | GL 5 three accounts, year | 1.422s | 1.151s |

Trial Balance, Balance Sheet and Transaction Detail, 500k (`scale-task28-st500/st-results.md`; before: `scale-500k-final-st/st-results.md`):

| lines | run | before | after |
|---|---|---|---|
| 500000 | TB 1 all accounts, as of | 1.337s | 1.255s |
| 500000 | TB 2 busy account, as of | 544ms | 511ms |
| 500000 | TB 3 three accounts, as of | 719ms | 660ms |
| 500000 | BS 1 accrual, as of | 934ms | 916ms |
| 500000 | BS 2 cash, as of | 1.244s | 1.218s |
| 500000 | TD 1 all accounts, month | 227ms | 207ms |
| 500000 | TD 2 all accounts, year | 1.12s | 898ms |
| 500000 | TD 3 busy account, month | 63ms | 61ms |
| 500000 | TD 4 small account, month | 19ms | 19ms |
| 500000 | TD 5 three accounts, year | 689ms | 590ms |
| 500000 | TD 6 busy account, month, cash | 76ms | 73ms |

Median of 5. Both runs PASS (`scale-task28-gl.log`, `scale-task28-st500.log`) and no run is refused; the sections on the page of every General Ledger run, and the group rows and rows of every statements run, are the same as before. The before figures ran at a load of 7.8 to 9.3 (not quiet), so part of each gain is the machine. The machine for this round (`scale-task28.quiet`): the General Ledger run started at load 3.00 (quiet, under 4); the statements run started at load 6.34 (above 4: not quiet, a little high).

Checks of step 10: General Ledger run 2's statement with a `gord` line in `gl-plans.md` has no `SCAN gord` line (grep count 0). Every General Ledger run is under the 2 s bar at 500k. Run 2's margin is 241 ms under the bar (1.759 s), about 12 %: more than 10 %, so tasks 28b and 28c are not needed.

What is left of run 2 (plan, evidence item 2): the section rows statement (about 355 ms) and the Total row statement (about 391 ms), and in the detail page `w` (about 317 ms) and the sections computed again (about 229 ms). These four figures are the plan's, measured before the cut; they were not measured again after it. Two options not built: the Total row read in the section rows statement (about -345 ms, an estimate) and no `shown` CTEs under `wl` (about -230 ms, an estimate).

For a later task that builds those two options (a "28b"): it must pass `away` from `heldLeaves` to `leafRows`; `TestAMovedGroupOffThePageIsReadOverTheGroupsAPageCanReach` catches its omission.

#### Task 29: every value in a statement is bound (core `server/reports`, Books `server`, 2026-11-20)

The cause: the rule "bind every value in SQL" and the audit (`sql-literal-audit.md`). The human's decision of 2026-11-20 was to bind the audit's places and the seven row limits, with the `x'ff'` sentinel kept. The human changed it on 2026-11-21: the integer `LIMIT` literals are approved and task 2 (bind the row limits) is dropped. The approved constants (the human's list, `docs/plans/auto-helix/p5-report-engine-scale.md`, 2026-11-21): `LIMIT 1` (lookup.go), `'Yes'`/`'No'` (options.go), the place number `%[3]d` (options.go), `' '` (options.go), `'-Q'` (rows.go), `'%+d days'` (formula.go), `'text'` and `'$.k'` (label.go, options.go) and the `x'ff'` sentinel.

The change, one line each:

- `startOfMonth` binds `"01"`.
- A percent binds its scale (2 places).
- A blank pivot cell's bounds are bound.
- `placeholderDay` (the drill) is bound.
- The four Books statements bind the posted flag, the status and the origin.
- The row limits stay integer literals (human-approved 2026-11-21; task 2 dropped), so `limitSQL` stays; the `gcut` limit of part 28 is an approved integer literal too.

The tests: core `TestAPercentBindsItsScale`, `TestStartOfMonthBindsItsDay`, `TestABlankPivotBoundIsBound` (`boundvalues_test.go`); Books `TestLedgerStatementsBindTheirValues` (`bound_values_test.go`).

Code: core e5807277 and cf10acf6 (task 1), Books c7a43ff6 (task 3).

The figures are the round of task 28a (above): core cfc3d9d6, books 3d77acc9, 2026-11-21, with these changes in the tree. It ran at 500,000 lines, not 100,000, so the 100k figures of task 9b-3 are not compared. All 16 runs, before = the 500k final files (`scale-500k-final-st`, `scale-500k-final-gl`), after = `scale-task28-st500`, `scale-task28-gl`:

| lines | run | before | after |
|---|---|---|---|
| 500000 | TB 1 all accounts, as of | 1.337s | 1.255s |
| 500000 | TB 2 busy account, as of | 544ms | 511ms |
| 500000 | TB 3 three accounts, as of | 719ms | 660ms |
| 500000 | BS 1 accrual, as of | 934ms | 916ms |
| 500000 | BS 2 cash, as of | 1.244s | 1.218s |
| 500000 | TD 1 all accounts, month | 227ms | 207ms |
| 500000 | TD 2 all accounts, year | 1.12s | 898ms |
| 500000 | TD 3 busy account, month | 63ms | 61ms |
| 500000 | TD 4 small account, month | 19ms | 19ms |
| 500000 | TD 5 three accounts, year | 689ms | 590ms |
| 500000 | TD 6 busy account, month, cash | 76ms | 73ms |
| 500000 | GL 1 all accounts, month | 614ms | 513ms |
| 500000 | GL 2 all accounts, year | 2.73s | 1.759s |
| 500000 | GL 3 busy account, month | 246ms | 232ms |
| 500000 | GL 4 small account, month | 164ms | 168ms |
| 500000 | GL 5 three accounts, year | 1.422s | 1.151s |

Both runs PASS and no run is refused; the rows and sections are the same as before. Load: General Ledger start 3.00 (quiet), statements start 6.34 (not quiet, a little high); the before figures ran at 7.8 to 9.3. The tree also holds task 28a, so a gain is not this task's alone.

Not done here: nothing is left. The `gcut` limit of part 28 is an approved integer literal.

#### All bars at 500k (2026-11-21)

The human's bars (the human, 2026-11-20): Transaction Detail with an account filter, month, 1 s; Trial Balance with an account filter (as of), 1 s; every other run 2 s. The General Ledger runs with no account filter got 2 s by Ruling #100. Each bar below is read from the test code (`report_general_ledger_scale_test.go`, `glMonthBar` 1 s and `glLongRunBar` 2 s, the runs at lines 120-125; `report_statements_scale_test.go`, lines 90-100).

| report | run | bar | median at 500k | pass |
|---|---|---|---|---|
| General Ledger | 1 all accounts, month | 2s | 513ms | yes |
| General Ledger | 2 all accounts, year | 2s | 1.759s | yes |
| General Ledger | 3 busy account, month | 1s | 232ms | yes |
| General Ledger | 4 small account, month | 1s | 168ms | yes |
| General Ledger | 5 three accounts, year | 2s | 1.151s | yes |
| Trial Balance | TB 1 all accounts, as of | 2s | 1.255s | yes |
| Trial Balance | TB 2 busy account, as of | 1s | 511ms | yes |
| Trial Balance | TB 3 three accounts, as of | 1s | 660ms | yes |
| Balance Sheet | BS 1 accrual, as of | 2s | 916ms | yes |
| Balance Sheet | BS 2 cash, as of | 2s | 1.218s | yes |
| Transaction Detail | TD 1 all accounts, month | 2s | 207ms | yes |
| Transaction Detail | TD 2 all accounts, year | 2s | 898ms | yes |
| Transaction Detail | TD 3 busy account, month | 1s | 61ms | yes |
| Transaction Detail | TD 4 small account, month | 1s | 19ms | yes |
| Transaction Detail | TD 5 three accounts, year | 2s | 590ms | yes |
| Transaction Detail | TD 6 busy account, month, cash | 1s | 73ms | yes |

The round: core cfc3d9d6 (with ea0fee56), books 3d77acc9, 2026-11-21; load at start 3.00 (General Ledger, quiet) and 6.34 (statements, not quiet, a little high); every run passes its bar.

#### Task 9e-2a: a list rule that reads no row is answered once for each run (core `server/reports/rules.go`, 2026-11-21)

The cause (`9e2-investigation.md`): SQLite copies a CTE at every reference, so the prepare cost of a statement follows its expanded text. The Balance Sheet statement expands to 4.03 MB and holds 3,172 copies of a rule CTE; each copy carried the grant rule as `EXISTS (… LEFT JOIN users … LEFT JOIN books_access …)`, about 205 ms of a 310 ms prepare. The rule reads no row of its collection: its answer is the same for every row.

The change (core): `ruleFormOf` returns the rule in full and, for a joined rule that reads no row and does not name its collection's table, the probe `SELECT EXISTS (…)`. A run asks each distinct probe one time through its read transaction (`askRules`; the key is the probe's text and bound values, the answers live in the runner of that one run) and the statement's rule CTE is `SELECT t.* FROM t`, or `SELECT t.* FROM t WHERE 0` for a refused reader. `stmt.ruleReads` keeps the rule in full, so a run's topics are the same. A rule that reads its row, the comparison with every joined row and `:changed` stay in the statement. A probe that fails fails the run.

The tests (core `ruleonce_test.go`): `TestEveryRuleKindReadsTheListAPIsRows`, `TestARuleOneAnswerServesLeavesTheStatement`, `TestARuleThatReadsItsRowStaysInTheStatement`, `TestARuleAnswerBelongsToOneRunAndOneReader`, `TestAProbeKeyHoldsItsValues`, `TestAFailedRuleProbeFailsTheRun`, `TestARuleProbeIsUnderTheRunTimeLimit`, `TestAnAnsweredRuleKeepsTheRunsTopics`, `TestAUnionPartsRuleIsAnswered`, `TestNamesTable`, `TestParamOptionsUnderAnAnsweredRule`, `TestABalanceSheetShapedStatementHoldsNoRule`.

Code: core 8c8d86ec.

Prepare of the long Balance Sheet statement (`EXPLAIN` read to its end, 20 times, the 100k book; `scale-task9e2/prepare.log`):

| run | before (10k book, load 12) | after: median (min to max) | opcodes before | opcodes after |
|---|---|---|---|---|
| BS 1 accrual, as of | 324 ms | 109.7 ms (104.7 to 113.9 ms) | 49,666 | 36,570 |
| BS 2 cash, as of | 315 ms | 106.1 ms (103.1 to 111.8 ms) | 49,665 | 36,569 |

The statement is statement 6 of 8 of each run; after the change it is 257,770 chars (BS 1) and 257,680 chars (BS 2) and holds 0 `__rule` (5 before).

The 100k round (`scale-task9e2/st-results.md`; before = `scale-task9b3/st-results.md`, the last 100k round, which did not hold tasks 28a and 29):

| lines | run | before | after |
|---|---|---|---|
| 100000 | TB 1 all accounts, as of | 345ms | 317ms |
| 100000 | TB 2 busy account, as of | 153ms | 141ms |
| 100000 | TB 3 three accounts, as of | 181ms | 170ms |
| 100000 | BS 1 accrual, as of | 455ms | 268ms |
| 100000 | BS 2 cash, as of | 504ms | 307ms |
| 100000 | TD 1 all accounts, month | 62ms | 51ms |
| 100000 | TD 2 all accounts, year | 232ms | 209ms |
| 100000 | TD 3 busy account, month | 30ms | 30ms |
| 100000 | TD 4 small account, month | 19ms | 17ms |
| 100000 | TD 5 three accounts, year | 135ms | 123ms |
| 100000 | TD 6 busy account, month, cash | 34ms | 30ms |

`TestStatementsScale/100k` passes, no run is refused, the group rows and rows of each run are the same as in `scale-task9b3`, and the 1-minute load at the start was 5.66 (prepare measure) and 4.62 (100k round).

Not done here (each a later, larger step, from the investigation): one select for the currencies of all computed rows of a layout (about 100 ms to 66 ms on the copy); the `__probes` reads (66 ms to 56 ms); a staged run with the shared CTEs in temp tables (the floor, about 20 ms). The prepare cost of the other large statements (General Ledger, Transaction Detail, Trial Balance, Journal, Profit and Loss) is not measured yet: the human asked for that benchmark after this task.

#### Task 31: `in` of a Select with a list of its option values tests the stored column too (core `server/reports/selectin.go`, 2026-11-21)

The cause (found by the Expenses by Vendor unit's plan bars): `in(account.type, [three types])` read the type as `NULLIF(type, '')` and the list from one bound JSON array. No index serves that term and SQLite does not see that a row with no account fails it, so it kept the LEFT JOIN to the accounts and scanned `books_journal_lines` and `books_cash_basis_lines`. `eq` had a stored-column term since `selectEq`; `in` had none.

The change (core): `selectIn` writes `(NULLIF(c, '') IN (<the list>) AND c IN ({:p}, …, NULL))` when the left side is a Select read from a stored column and every value of the list is one of its option values. One placeholder is bound for each distinct value; no value is written into the SQL text. The `NULL` at the end of the list keeps the value of the condition unknown for a blank or missing `c`, as before. A list with another value, an empty list, and a column's formula are written as before.

The tests (core `selectin_test.go`): `TestASelectInAListIsServedByTheColumnIndex`, `TestASelectInAListKeepsItsResult`, `TestASelectInAListOnOtherSourcesKeepsItsResult`, `TestASelectInAListIsBound`, `TestASelectInAListIsPreparedOnceWithoutStatistics`.

Code: core 83ce8c78.

Books reports whose filters carry the term: Profit and Loss, Trial Balance, Balance Sheet, General Ledger (`account.type`) and Statements (`entry.origin`). The Books Go tests pass on it (three shards).

The 100k round (`scale-task31-st/st-results.md`; before = `scale-task9e2/st-results.md`):

| lines | run | before | after |
|---|---|---|---|
| 100000 | TB 1 all accounts, as of | 317ms | 329ms |
| 100000 | TB 2 busy account, as of | 141ms | 137ms |
| 100000 | TB 3 three accounts, as of | 170ms | 163ms |
| 100000 | BS 1 accrual, as of | 268ms | 286ms |
| 100000 | BS 2 cash, as of | 307ms | 328ms |
| 100000 | TD 1 all accounts, month | 51ms | 53ms |
| 100000 | TD 2 all accounts, year | 209ms | 205ms |
| 100000 | TD 3 busy account, month | 30ms | 26ms |
| 100000 | TD 4 small account, month | 17ms | 15ms |
| 100000 | TD 5 three accounts, year | 123ms | 120ms |
| 100000 | TD 6 busy account, month, cash | 30ms | 28ms |

The General Ledger at 500k (`scale-task31-gl/gl-results.md`; before = `scale-500k-final-gl/gl-results.md`):

| lines | run | before | after |
|---|---|---|---|
| 500000 | 1 all accounts, month | 614ms | 424ms |
| 500000 | 2 all accounts, year | 2.73s | 1.647s |
| 500000 | 3 busy account, month | 246ms | 161ms |
| 500000 | 4 small account, month | 164ms | 82ms |
| 500000 | 5 three accounts, year | 1.422s | 1.014s |

Beyond the plan, the statements at 500k (`scale-task31-st500/st-results.md`; before = `scale-task28-st500/st-results.md`):

| lines | run | before | after |
|---|---|---|---|
| 500000 | TB 1 all accounts, as of | 1.255s | 1.313s |
| 500000 | TB 2 busy account, as of | 511ms | 489ms |
| 500000 | TB 3 three accounts, as of | 660ms | 644ms |
| 500000 | BS 1 accrual, as of | 916ms | 746ms |
| 500000 | BS 2 cash, as of | 1.218s | 1.056s |
| 500000 | TD 1 all accounts, month | 207ms | 185ms |
| 500000 | TD 2 all accounts, year | 898ms | 1.098s |
| 500000 | TD 3 busy account, month | 61ms | 61ms |
| 500000 | TD 4 small account, month | 19ms | 16ms |
| 500000 | TD 5 three accounts, year | 590ms | 647ms |
| 500000 | TD 6 busy account, month, cash | 73ms | 74ms |

All three runs PASS (`scale-task31-st.log`, `scale-task31-gl.log`, `scale-task31-st500.log`) and no run is refused; the group rows and rows of every statements run and the sections on the page of every General Ledger run are the same as before. The machine was not quiet (the human said to run): the 1-minute load at the start was 8.04 (100k statements, `scale-task31-st/load.txt`), 9.30 (General Ledger, `scale-task31-gl/load.txt`) and 7.16 (500k statements, `scale-task31-st500/load.txt`), so a small change up or down in a figure is the machine.

For the Expenses by Vendor unit: with this change on core `books/p5-report-engine-scale`, its `TestExpensesByVendorQueryPlans` has no plan-bar failure with no statistics (21 before; planner's overlay run, 2026-11-21).

#### All bars at 500k, final (2026-11-21, task 31)

These are the final figures; they replace the table "All bars at 500k (2026-11-21)" above. The bars are the same (read from the test code, as above).

| report | run | bar | median at 500k | pass |
|---|---|---|---|---|
| General Ledger | 1 all accounts, month | 2s | 424ms | yes |
| General Ledger | 2 all accounts, year | 2s | 1.647s | yes |
| General Ledger | 3 busy account, month | 1s | 161ms | yes |
| General Ledger | 4 small account, month | 1s | 82ms | yes |
| General Ledger | 5 three accounts, year | 2s | 1.014s | yes |
| Trial Balance | TB 1 all accounts, as of | 2s | 1.313s | yes |
| Trial Balance | TB 2 busy account, as of | 1s | 489ms | yes |
| Trial Balance | TB 3 three accounts, as of | 1s | 644ms | yes |
| Balance Sheet | BS 1 accrual, as of | 2s | 746ms | yes |
| Balance Sheet | BS 2 cash, as of | 2s | 1.056s | yes |
| Transaction Detail | TD 1 all accounts, month | 2s | 185ms | yes |
| Transaction Detail | TD 2 all accounts, year | 2s | 1.098s | yes |
| Transaction Detail | TD 3 busy account, month | 1s | 61ms | yes |
| Transaction Detail | TD 4 small account, month | 1s | 16ms | yes |
| Transaction Detail | TD 5 three accounts, year | 2s | 647ms | yes |
| Transaction Detail | TD 6 busy account, month, cash | 1s | 74ms | yes |

The round: core 83ce8c78, books 5674f9c6, 2026-11-21; load at start 9.30 (General Ledger) and 7.16 (statements), both not quiet; every run passes its bar.
