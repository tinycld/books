# bank-match — helix run ledger

- started: 2026-11-19
- mode: unattended
- unit: p4-match
- package branch: books/p4-match (books @98491861)   core checkout: books/p4-match (tinycld @470a6f7)
- spec: docs/specs/bank-match-design.md
- checkpoints: docs/plans/bank-match-checkpoints.md
- reference: docs/plans/bank-match-reference/
- evidence: docs/plans/bank-match-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/bank-match-capture.json
- review mode: C — none (unattended)
- core extension: none for the screen. One small core PR on the same branch (tinycld `books/p4-match`), a check approved from a retro, not a design-system extension: for a member with e2e specs, `tinycld-pkg check` (tinycld/package-scripts) runs `playwright test --list` and fails when a spec does not load. It is checkpoint 0. PR number: not opened yet.
- sparks:
  - A found match is one compact line (type as a link, date, amount) → expressible (`text-sm text-primary` link through `entryHref`; `formatDay`; `formatMoney` with `tabular-nums text-foreground`; Books `SelectBox` in front)
  - The wider search is a quiet secondary button, never the main action → expressible ("Find other matches" in the outline variant; the primary is "Match", core `ShortcutButton`)
  - The radio switch Categorize / Find match / Record as transfer → dropped (behavior of p4-categorize-split; this unit shows its Match section alone)
  - Row mark, added by the human at the design gate: a green check for one suggestion, a "<n> matches" chip with a yellow warning triangle for several → expressible (Lucide `Check` / `AlertTriangle` with core `useThemeColor('success')` / `useThemeColor('warning')`; chip `border-warning`; no raw hex)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)
- cp 0 · reviewer A NOTE: `package-scripts/src/runners.ts` — `playwright test --list` prints one line per test, so `tinycld-pkg check` in `books/` prints about 670 more lines (`--reporter=null` does not quiet it). A quiet mode (print the list only on failure) is a possible later change.
- cp 0 · reviewer A NOTE: the workspace-root `CLAUDE.md` (not in the core repo) still says `check` runs "biome + tsc + vitest"; the bootstrap template `templates/shared/README.md:42` says "biome + typecheck". For the driver.
- cp 0 · reviewer A NOTE: `CONTRIBUTING.md:42` was also edited (the checkpoint named line 62 only), so the two descriptions of `check` in the file agree.
- cp 1 · reviewer A NOTE: `server/bank_match.go` — a line whose entry is missing, or a bank transaction whose connection is missing, gives a wrapped 500, not a refusal. No user sequence reaches it (posted lines cannot be deleted; a connection delete cascades to its bank transactions).
- cp 1 · reviewer A NOTE: the brief named the view for the not-audited list in `server/registrations_test.go`; only `books_bank_match_lines` was added, because `booksCollections(…, base)` never lists a view. `TestRegister_BindsEachPartOnce` has no new line: the hand-bound `registerLedger` → `registerBanking` → `registerBankMatch` already binds the part.
- cp 1 · performance: `server/batch_cost_test.go` `draftReplaceStatementsPerLine` rose from 16 to 18, because the two new relation fields to `books_journal_lines` (`books_bank_match_lines.line`, `books_bank_matches.lines`) add one PocketBase cascade lookup each to every journal line delete. The lookup on the multi-relation `books_bank_matches.lines` is not indexed. For the human: accept, or a later change to the schema.

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)
- cp 1 · `server/batch_cost_test.go` — the statement bound per line 16 → 18 (test dispute 3b, measured; see Design notes).
- cp 1 · `tests/migration-prefixes.test.ts` — the "audit view runs last" rules failed on the gate-fixed number 2100000030 (spec §4). Rewritten to the real rule: the audit view runs after every migration that creates a collection it reads (its line collections, parsed from the view migration), and later migrations are named in `AFTER_AUDIT` (test dispute 3).
- cp 1 · `tests/e2e/banking-page.spec.ts:153` — "Imported: 12 transactions" → 14, a ripple of the two new seed lines that the step 11 grep missed (gate 1 e2e failure).
- cp 1 · `tinycld/books/types.ts` — re-exports `BooksBankMatches`, `BooksBankMatchLines`, `BooksBankMatchSuggestions`, which step 9 imports from `../types`.

## Phase notes
- phase 1: no correction of the inventory or the sparks at the design gate (2026-11-19). The packet was built on `books/p3-purchase-lists`@a3aa855; that branch is merged (PR #73), and the step branch `books/p4-match` starts from the merge, @98491861.
- phase 2 (design gate, human, 2026-11-19): open questions 1–13 of the packet accepted as recommended, with these changes.
  - Q4 direction: A (match in the drawer), not the recommended B.
  - Q11: only "the suggestion line replaces the memo and check number line" is kept. No 96 px action cell; the Description minimum width stays 240 and the table minimum stays 720.
  - Q5: batch Match stays, on the selection bar, for chosen rows with exactly one suggestion.
  - Q14 (added by the driver): the migration is `pb-migrations/2100000030_create_books_bank_matches.js` (27 = p2-write-off, 28 reserved for p5-ar-aging, 29 = the audit view after its rename).
  - Q15 (added by the driver): `server/register.go`, `server/registrations_test.go`, `seed.ts`, `server/audit.go` and `collections.ts` are also edited by units of other lanes (p5-ar-aging, p2-write-off); this unit merges last and keeps both sides.
  - Human change to the row: a For review row with exactly one suggestion shows a green check (semantic success token, no raw hex) beside the suggestion text; a row with more than one shows a chip "<n> matches" with a yellow warning triangle (semantic warning token) inside the chip.
  - Driver reading of how the change fits A: no row Match button and no action cell; keys M, F, Z act in the drawer.
- phase 3: direction A picked by the human (artboards.html of the design packet). No spark dropped at the gate; one row mark added (see sparks). Reference corrections: none yet (pass 2 not run).
- phase 3, conflicts between the driver reading and the artboards or the spec draft, and how the spec settles each:
  1. Artboard A puts a "1 match" / "3 matches" chip at the end of the description (first line) and keeps the memo line. The reading and the human's change replace the memo line with the mark (check and suggestion text, or the chip). The spec follows the reading; the reference of pass 2 will differ from artboard A on this line.
  2. Artboard A has no batch Match (its caption: "Every match, the suggested one too, is made in the transaction drawer"). The reading keeps Q5. The spec keeps Match on the selection bar.
  3. The spec draft gave key M three targets (drawer, chosen rows, focused row). The reading says the keys act in the drawer. The spec removes M on a focused row and gives the drawer M, F, Z. It keeps M for the selection bar's Match only while the drawer is closed and rows are chosen, because the bar's Exclude has E in the same way and every action button has a key (human, 2026-11-05). This is one step wider than the literal reading: if the driver wants M in the drawer only, remove the two M lines for the bar in spec §3 Keyboard, §4 Client modules and the e2e list.
  4. Phone card: artboard A shows "day · 1 match" on the second line; the spec draft (direction B) had a third line with a button and a 96 high card. The spec follows artboard A with the human's mark: the second line is the day and then the mark in place of "Check n"; the For review card stays 72 high.
  5. The spec draft's "Review" button on a row with several suggestions is gone with the action cell; the chip is its mark and the row press opens the drawer.
  6. Example account names in the draft ("1010 Business checking") did not fit the seed (1000 Business Checking; 1010 is Business Savings): fixed in the spec.
- phase 2, engine reach for the plan to confirm: the drawer's `ShortcutButton`s need scope `list` with the page's owner in the inline drawer and scope `modal` with the layer's owner in the overlay drawer and the sheet (spec, Engine reach).
- phase 3 pass 2 (unattended, 2026-11-19): direction A. No spark dropped. Reference captured: 27 states × 390 / 1280 × light / dark = 108 images in `docs/plans/bank-match-reference/` (manifest `docs/plans/bank-match-capture.json`; drawer shots use `stable: bank-txn-drawer`, `settleMs: 500`, `height: 1300`).
  - Fixture: `tinycld/books/lib/bank-match-fixture.ts` (kept file). Bank transactions, journal entries and lines use the generated types. `BankMatchRecord`, `BankMatchLineRecord` and `BankMatchSuggestionRecord` are local interfaces, because the collections do not exist yet: the migration checkpoint replaces them with the generated `BooksBankMatches`, `BooksBankMatchLines`, `BooksBankMatchSuggestions`.
  - Scratch route states: review, selected, batch-busy, batch-done, batch-failed, drawer, drawer-many, drawer-over, drawer-none, drawer-long, drawer-loading, drawer-error, drawer-sending, drawer-refused, matched-done, find, find-exact, find-search, find-empty, find-no-result, find-range-error, reviewed, matched, matched-three, undone, read-only, read-only-matched.
  - Real components in the reference: `BankingHeader`, `BankingTabs`, `BankTxnDrawer`, `DateOrderToggle`, `ReviewResultLine`, `ListTable`, `ListCards`, `SearchField`, `SelectBox`, core `ShortcutButton`, `DateField`, `PickMenu`, `LoadingState`. Scratch copies (the real ones read a collection or have no slot): the account strip and panel, the review toolbar, the selection bar, the table row and the phone card. New components, drawn in the route under their spec names: `SuggestionMark`, `MatchSection`, `MatchOptionRow`, `MatchTotals`, `MatchFind`, `MatchedTo`.
  - Reference corrections after the first capture: the phone card's day did not stay on one line (now one line, no shrink); a Books transaction row in the drawer cut its date at 380 px (the row now has two lines: type-and-number link with the amount, then "date · name" in `text-xs text-muted-foreground`); the drawer shots were cut at 800 px height (now 1300).
  - Differences from the spec, for the plan to settle:
    1. A Books transaction row in the Match section has two lines at every width (the spec's one line "type, date, amount" does not fit the 380 px inline drawer or the 390 px sheet).
    2. Core `ShortcutButton` has no spinner. The sending state is a disabled core `Button` with `ButtonSpinner` and "Matching…".
    3. The hints (Match disabled in the drawer, Match disabled on the bar, more than 50 rows) are accessibility hints; they are not visible, so they have no shot.
    4. No shot for: more than 50 chosen rows, row marks that still load, the tablet overlay drawer.
    5. Reviewed table: minimum width 720, Description minimum 160, In Books flex 1 with minimum 180. Reviewed phone card: 96 high.
  - Scope owner of the drawer (the approval agent's question), from the code of core @470a6f7; not checked at runtime: core `Drawer` (`core/ui/drawer/index.tsx`) renders no `LayerScope`; only core `Dialog` and `Sheet` do. `BankTxnDrawer` uses core `Drawer` in its three placements (inline, overlay right, overlay bottom), and `BankingScreenView` renders it outside its `ScopeProvider owner={listScope}`. Thus `useScopeOwner()` in the drawer is null and no `modal` scope is pushed in any placement. This contradicts the phase 2 note below ("scope `modal` with the layer's owner") and the comment in `lib/review-shortcuts.ts` (lines 149-150). The reference passes `scopeOwner` from the route's `useShortcutScope('list')` and scope `list` to the three buttons. The plan must do one of: pass the page's `listScope` owner into the drawer content, or move the drawer inside the `ScopeProvider`. No core change is necessary.
- phase 4 (unattended, 2026-11-19): plan `docs/plans/bank-match-checkpoints.md`, checkpoint 0 (core) and 4 package checkpoints (1 logic, 2 to 4 render). plan-check `--unattended`: 0 errors. E2E budget 11 tests (5 / 3 / 3).
  - Settled, scope owner: no core change. `BankingScreenView` passes its `listScope` owner as the prop `scopeOwner` to the section in the drawer's `children`; the three drawer `ShortcutButton`s use scope `list` with that owner in the three placements. This replaces the phase 2 note ("scope `modal` with the layer's owner"). Checkpoint 2 corrects the comments in `lib/review-shortcuts.ts` and `BankingScreenView.tsx`.
  - Settled, differences 1 to 4: as the reference (two-line Books transaction row; disabled `Button` with `ButtonSpinner` and "Matching…"; hints are accessibility hints; no shot for the three states).
  - Settled, difference 5: the Reviewed table keeps the minimum width 720 and the spec's minimums (Description 160, In Books 180). These do not fit 720 with the reference's fixed cells (sum 752), so on Reviewed the fixed cells are Date 104, Spent 112, Received 112 (sum 712). The reference shows 112 and 128 there. Reviewed phone card 96.
  - Settled, difference 6 (new): a disabled `ShortcutButton` stays in the ⇧? list (core `useButtonShortcut`), against the spec's "registered only while its action is offered". Accepted.
  - Difference from the spec's e2e list: a test that writes uses its own bank account and transfers from it, not 1000 Business Checking (isolation). Reader tests use the seeded 1000 rows. No tablet e2e (standing rule).
  - Seed: two new statement lines, "PACIFIC POWER AUTOPAY" −138.37 (one suggestion: Expense 1002) and "ONLINE BILL PAY 0915" −400.00 (matched by the seed to the bill payment of 2026-09-15). Seeded 1000: For review 9 (was 8), Reviewed 1, Excluded 4.
  - The drawer's Match and Undo run through the page's one batch (`useReviewBatch`, kinds `match` and `unmatch`, origin `drawer`), so the result line and the one-run rule are shared. `BatchKind` is split into `MoveKind` and the two new kinds.
  - Plan review (report: staging `plan-review.md`): 1 blocker, 5 major, 17 minor; all fixed in the plan except as noted. Blocker: the seed line for Expense 1002 had the amount of Expense 1003 (now −138.37). Major: `batchResultText` / `BatchKind` could not carry the new kinds as written (type split and signature added); gates of checkpoints 2 and 3 did not run `for-review.spec.ts` (files commands added); a Reviewed minimum width of 820 widened the sideways-scroll range (720 kept, see difference 5); no test for the keys in the sheet (hardware keys `f` and `m` in the phone test); no test for the sending state (held-route assertions in checkpoints 2 and 3). Minor, fixed: one void call site (`transitionEntry`, `server/entries.go`), the request-hook and `serializedThen` pair, bare `l.date` in the view, view precedent (migration 15), `audit_log_spec.json` and the not-audited allowlist in Files, `findWhere` signature and join form, `materialize()` list form (`useTaxesScreen.ts`), `focusPressesKey` export, `isActionPending` by kind, the seeded line's name, `keptAfterBatch`. Minor, accepted without a test: the load error of the find mode and of Matched to (same recovery call as the tested one).
  - Not in this repo: the workspace-root `CLAUDE.md` says `tinycld-pkg check` runs "biome, then tsc, then vitest"; after checkpoint 0 it also lists the e2e specs. For the driver.
- review mode switches: none

## Checkpoint 0 (core, tinycld `books/p4-match`)
- test writer: `package-scripts/tests/runners.test.ts` (4 cases); red for the right reason: yes for (a), (b), (d); (c) is a guard that cannot be red (the old code adds no playwright command); the old matching case became (c), no duplicate. untestable: none
- implementer: `buildE2eListCommand(pkg)` and the fourth parameter `hasE2eSpecs = fs.existsSync(playwrightConfigFor(pkg))` of `buildCheckCommands` in `package-scripts/src/runners.ts`; doc lines in `CONTRIBUTING.md` (62, and 42 for agreement) and `README.md` (212). DONE
- test disputes: none
- self-declared differences: `CONTRIBUTING.md` line 42 also edited; the doc lines name the command `playwright test --list`; no commit by the implementer (the runner commits); workspace-root `CLAUDE.md` left for the driver
- gate 1: tests unedited: yes · pass (core check exit 0, vitest 4923 passed, list "Total: 300 tests in 70 files"; books check exit 0, vitest 7874 passed, list "Total: 668 tests in 156 files")
- gate 2: n/a
- gate 3 A (correctness): 1 BLOCK accepted+fixed — `playwright test --list` exits 1 ("No tests found") for a member with a `playwright.config.ts` and no spec (bootstrap `full` template), against spec §9 "for a member with e2e specs"; fix: the list args gain `--pass-with-no-tests` (test case (b) changed first by a test writer, red, then the source). The checkpoint's literal args for (b) are thus widened by this one flag. 3 NOTEs to Design notes.
- gate 3 B (conformance): script lines: 0 · findings: none
- fix review: round 1: clean (findings file `cp0-fix-r1.md`, cause `spec-logic`); gate 1 again: core and books check exit 0, same totals
- gate 3 A notes: 3, listed under Design notes
- reviewer-caught deferrals: none
- commit: tinycld 670f585
- human: none (review mode C)

## Checkpoint 1 (Match data and server rules)
- test writer: `server/bank_match_test.go`, `server/bank_match_view_test.go`, `server/testdata/bank_match_cases.json`, `tests/bank-match-fixture.test.ts`; changed `server/oauth_scopes_test.go` (new `TestOAuth_BankMatchCollections`), `server/registrations_test.go` (`books_bank_match_lines` not audited), `server/testdata/audit_log_spec.json`, `tests/collections.test.ts`, `tests/audit-record-route.test.ts`, `tests/for-review-fixture.test.ts`, `tests/accounts-form-harness.ts`, `tests/e2e/for-review.spec.ts` (8 → 9), `help/screenshots.ts` (8 → 9). Red for the right reason: yes (Go: 404 collection / no view; vitest fixture test red at typecheck only). untestable: none. Declared: draft refusal reads "This transfer is not posted." (`entryName` of a draft, as the brief says the test builds names from its own entries).
- implementer: migration 2100000030 (two collections, view, two partial indexes), `server/bank_match.go` (create/delete hooks, `isLineMatched`, `unmatchEntry`), the `transitionEntry` call in `entries.go`, view registration, audit (Go and the three client tables), OAuth, collections, typed fixture, seed lines and `seedBankMatch`. DONE
- test disputes (4, each settled "the test is wrong" by a test-writer dispatch; file `cp1-disputes.md`): (1) VoidAndEdit expense subtests dated the expense 55 days after the bank row — spec §3 "dated from 90 days before to 7 days after the bank date"; moved inside the window. (2) Disconnect stored an import row for an `uploaded` file, which the required `books_bank_imports.file` blocks — checkpoint "a connection whose file never left `uploaded` … takes no match with it"; uses its own uploaded-only connection. (3) `tests/migration-prefixes.test.ts` required the audit view last — spec §4 "`2100000030_create_books_bank_matches.js` … 29 is the audit view after its rename"; rule restated (see Out-of-plan). (3b) `batch_cost_test.go` bound 16 → 18 (see Design notes).
- self-declared differences: package `log` already declared (`auto_reverse.go:21`), so no new one; sum refusal uses the books currency (a connection has no currency field); view compares `t.date` bare (10-character day, 2100000008:240); the three collections are declared after `books_journal_entries` (their relations need it), exported beside the bank ones; `connection` not required (stamped by Go), match-line `amount` min 0 max `MAX_AMOUNT`; `REVIEW_SEED_STATEMENT` gains `suggestedFitid` / `matchedFitid` read by `seedBankMatch`; refusal order checks void before not posted (a void entry would read "not posted" otherwise).
- gate 1: tests unedited: yes · fail → `banking-page.spec.ts:153` "Imported: 12 transactions": the seeded statement now has 14 lines → test-writer fix to 14 → pass. Final: check exit 0 (7884 vitest), `go test ./...` ok, e2e `for-review.spec.ts` + `banking-page.spec.ts` 12 passed; the seed's `seedBankMatch` ran clean.
- gate 2: n/a
- gate 3 A (correctness): 0 BLOCK, 8 NOTE: NOTE 1 (unknown line id refused by the sum text) accepted with B #5; NOTE 2 (the reversal assertion of VoidAndEdit could not fail) accepted as a weak test and fixed; NOTE 4 (comment wrap) accepted with B #7; NOTEs 3, 5 to Design notes; NOTEs 5–8 are the out-of-plan files.
- gate 3 B (conformance): script lines: 0 · findings 1–4 (out-of-plan files) recorded under Out-of-plan changes; #5 (unknown line id skips to the sum refusal, comment disagrees) accepted+fixed; #6 (`time.Sleep` in `TestBankMatch_Audit`) accepted+fixed by the test writer; #7 (comment wrap in `server/audit.go`) accepted+fixed.
- fix review: round 1: clean (findings file `cp1-fix-r1.md`: causes spec-logic 1, weak-test 2, conformance 1); gate 1 again: check exit 0, `go test ./...` ok, e2e 12 passed
- gate 3 A notes: 2, listed under Design notes (plus the batch-cost performance note)
- reviewer-caught deferrals: none
- commit: (this commit)
- human: none (review mode C)

## Final review
- eval: (not reached)
- human comments and what changed
- native: not executed in this run
