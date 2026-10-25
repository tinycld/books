# opening-balances — helix run ledger

- mode: unattended
- unit: p1-opening-balances
- started: 2026-10-24
- package branch: books/p1-opening-balances   core checkout: main
- spec: docs/specs/opening-balances-design.md
- checkpoints: docs/plans/opening-balances-checkpoints.md
- reference: docs/plans/opening-balances-reference/
- evidence: docs/plans/opening-balances-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/opening-balances-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - live Balance Sheet preview in the report's own shape → expressible (bg-surface-secondary, border-border, formatMoney, text-success, text-destructive)
  - "Preview" label chip → expressible (bg-accent text-accent-foreground)
  - date stated in words under the field → expressible (text-muted-foreground, formatDay)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
cp 0 · server/reversal.go: the same-origin rule also refuses editing a posted reversal or auto_reversal entry (a correction can only be manual or opening). The spec requires 'a correction must have the same origin as the entry it replaces'; the Journal Entries unit (p1-journal-entries) must not offer Edit on those.

cp 2 · core EmptyState link and outline Retry button are low contrast (light and dark; core components, same in the reference)
cp 2 · error banner is a square full-bleed band, the reference is a rounded card; its top border doubles the header divider
cp 2 · memo field is a custom input (core TextInput cannot show a derived default); a core `displayValue` prop needs core sign-off
cp 2 · help icon (16px + hitSlop) and the toolbar link (32px) are under 44pt on phone
cp 2 · the help icon points at books:opening-balances, which checkpoint 7 adds
cp 2 · loading and read-only states have no screenshots
cp 3+ · carry-over: `OpeningBalancesHeader` lost its `backTo` prop (checkpoint 6 adds only `subtitleLine`); a late query error unmounts the form, checkpoint 5 must keep a mounted form alive over it

cp 3 · the amount input shows `14,500.00` with no `$`, the reference mockup shows `$48,250.00`; kept: the plan's tests and interfaces (`centsToText`) specify the no-symbol form
cp 3 · every amount input has a muted `±` glyph (the sign toggle); not in the reference
cp 3 · the sticky band bar duplicates the first band header at scroll 0
cp 3 · on wide the in-flow amount error sits in the Account cell, far from its input
cp 3 · the in-flow error replaces the Inactive label on wide while it shows
cp 3 · the windowing logic is covered by unit tests only, the seed chart fits one screen and no e2e scrolls
cp 3 · KNOWN BUG, NOT OURS: when a `books_accounts` read answers 400, the app re-requests it in a tight loop (160-350 requests in about 1.4s) instead of staying in the error state. It happens on the existing Chart of Accounts screen too, so the cause is in the shared load path (pbtsdb or @tanstack/db: a failed initial subset load is re-issued). Needs a separate look in pbtsdb/core; not changed here.

cp 4 · with the preview open on phone and tablet both regions are small (grid about two rows, preview about 35% of the body); on very short windows (844x390 landscape, 390x500) the open preview has almost no height and the screen header takes much of the height. Hiding the header on short windows needs product sign-off
cp 4 · the date block remounts when the window height crosses 600 (a soft keyboard opening on a tablet could do that): values are kept, focus may be lost
cp 4 · the 'Too large' state of the totals strip and the preview problem text are asserted by e2e but not in any screenshot
cp 4 · the local APP_CHROME_WIDTH uses a copy of the 260px sidebar width (core's SIDEBAR_WIDTH_DESKTOP is not exported): it drifts silently if core changes it; exporting it needs a core PR
cp 4 · KNOWN BUG, NOT OURS: after a failed query is cleaned up and rebuilt, the @tanstack/react-db hook (0.5.5) can keep stale `data` for a healthy query that was cleaned and reloaded (a ready query with collection.size 1 and data undefined). It made Retry flaky until retry stopped cleaning healthy queries. Any screen that cleans a healthy query can hit it. Needs an upstream look (live-query-observer getSnapshot revision check).

cp 5 · the Draft badge is a neutral outlined chip (the reference's); the Posted tone is success
cp 5 · the late-error carry-over (form stays mounted, typed values kept) has no e2e (cannot be triggered deterministically on web)
cp 5 · CORE FINDING, not changed: on phones core's `Dialog` renders a `Sheet` with no `dialog` role (and no aria-modal), so assistive tech does not see a dialog; the proposed fix (an optional `role` prop on Sheet set by Dialog) is in the scratchpad; needs a core PR
cp 5 · CLAUDE.md bans a canSubmit boolean derived from field values, the spec mandates Save and Post disabled on a too-large figure: kept as the spec says plus a guard inside `save`; a zod root refine over `buildOpening` would be the rule-conforming alternative

cp 6 · the posted equity band subtotal includes the Opening Balance Equity row; the form's band subtotal excludes it
cp 6 · the Opening Balance Equity row shows no detail type (wide) and no type label (phone)
cp 6 · the read-only band captions keep their imperative wording ('Enter what each account holds')
cp 6 · the posted line shows the plain document number (the seeded prefix is empty): `10 · Dec 31, 2025 · posted by ... on ...`
cp 6 · if a post is refused after the user left the screen, only a log.warn records it
cp 6 · 'View journal entry' is hidden: Journal Entries is not available (`SIDEBAR_ENTRIES` entries.available is false); its link test must become a positive one when it ships

cp 7 · replace form on phone: the date block and memo still fill the grid area at open (only the first band header shows before scrolling), the Preview bar, totals strip and action bar take the rest: a more compact date block on phone would give cards; needs a product decision
cp 7 · the sticky band bar and the in-list band header both show 'Assets' at scroll 0 (decision since checkpoint 3); the critic called it blocking on the replace form
cp 7 · the Posted badge stays while editing a replacement; the notice carries the meaning
cp 7 · the replace notice reads 'Posting this replaces <number> under the same number. The original is voided.' with the plain number; the spec's JE-1046 is an example
cp 7 · the strict disabled state of Back during a replace post is unobservable (it unmounts at once when the optimistic draft appears)
cp 7 · offer due: add the Opening balances help topic to the website docs (CLAUDE.md)

## Out-of-plan changes
cp 3 · tests/e2e/account-register-entry.spec.ts (earlier unit): box read replaced by offsetHeight; hooks/useRowWindow.ts additive options; opening-grid-style.ts new.
cp 2 · tinycld/books/hooks/useBooksAccess.ts: additive `isError` and `collection` fields so a failing access read shows the error state instead of loading forever.

## Phase notes
- phase 1-3 (design gate): direction A picked (grid + preview rail); Q1-Q7 accepted as recommended.
- phase 4: plan review (fresh subagent) found a false CP0 claim (create hook not in `serialized`), a parseMoney contradiction in a test, e2e ordering, and missing Do steps and tests; all fixed, plan is 8 checkpoints (0-7). Review mode C. Deviations from the spec/helix rules, shown at the eval gate: seed.ts is NOT wired to the fixture (a seeded opening entry would hide the first-save and Opening Balance Equity paths; the seed question stays at phase end); core has no disclosure primitive, so books adds `OpeningPreviewDisclosure` (spec said core disclosure row); the read-only e2e fulfills the real books_access response as read_only (client layout only); OBE duplicate-name recovery has no e2e (needs two sessions).
- review mode switches: none

## Checkpoint 0
- test writer: server/opening_balances_test.go, server/ledger_rules_test.go; red for the right reason: yes (origin value missing; 5c, 10 and the rules case with their own messages); untestable: none
- implementer: migration origin value + create rule, server/opening_balances.go, entries.go hook wrapped in serialized, posting.go, reversal.go origin rule, fixture typed from generated types; DONE
- test disputes: test (7) saved a line over maxAmount and expected a post-time refusal; the line field max (1e15) refuses at save. Checkpoint text: "a line above `maxAmount` is refused" (no place named). Ruling: test wrong about where; a fresh test writer changed it to assert the save is refused and nothing posts.
- self-declared differences: none material (checkNewEntry runs inside serialized; postEntry is the post path)
- gate 1: tests unedited: yes · pass (go test, tinycld-pkg check). Red on the way: stale generated pbSchema (fixed by packages:generate)
- gate 2: n/a
- gate 3 A (correctness): 6 findings. 1 accepted+fixed (refusal label for an unnumbered draft: "a saved draft"); 2 accepted+fixed (full-string assertions in tests 2, 3, 9); 3 accepted as defensive (comment; branch unreachable by a real client); 4 kept, intended by spec (see Design notes); 5 accepted+fixed (test 7 no longer matches PocketBase wording); 6 accepted+fixed (rules case checks the stored row and a client-set number is refused)
- gate 3 B (conformance): 1 style finding (long migration comment line), fixed
- fix review: clean
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 1
- test writer: tests/opening-balances.test.ts, tests/opening-balances-schema.test.ts, tests/opening-balances-messages.test.ts; red for the right reason: yes (missing modules of this checkpoint); untestable: none
- implementer: lib/opening-balances.ts, lib/opening-balances-schema.ts, lib/opening-balances-messages.ts; DONE
- test disputes: none
- self-declared differences: tooManyAmountsMessage wording; previewFor fallback id for the balancing row; lines in band tree order; equity+balancing overflow flag; amountsFromLines skips net-zero lines; diffLines keeps the first of duplicate lines; screen state ignores other statuses; equity preview total uses equityWithBalancing
- gate 1: tests unedited: yes · pass after fixes
- gate 2: n/a
- gate 3 A (correctness): accepted+fixed: amountError "too large" only for well-formed text (isWellFormedMoney in money.ts); balancing amount above 10^15 is too-large; cap is above 999 amounts, balancing line not counted; amountsFromLines takes the first line per account like diffLines; test gaps (isRealDay century, state order, void entry); rebutted: multiple drafts/posted (server guard allows one live opening entry plus one draft replacement), void original shows `new` (the screen queries non-void rows only), memo length by UTF-16 units (never looser than the server's rune count)
- gate 3 B (conformance): accepted+fixed: types derived from the schema (z.infer, const array), presetDate parameter derived, test magic index removed, nested ternary removed
- fix review: two doc lines in the plan named maxOpeningLines; fixed
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 2
- test writer: tests/e2e/opening-balances.spec.ts, tests/e2e/opening-balances-helpers.ts; red for the right reason: yes (all 14 failed at the missing Chart of Accounts link; tests 1-6 assertions not reached until the link existed, noted); untestable: none
- implementer: screen route, useOpeningBalancesScreen/Form hooks, five opening-balances components, AccountToolbar link, capture manifest and evidence; BLOCKED on two test disputes (below), otherwise DONE
- test disputes: (1) empty-chart test clicked through to the chart while the empty-list route was still active, so the chart rendered its own empty state without the search box; the checkpoint says only that the link opens the Chart of Accounts; test wrong, fixed by a fresh test writer (asserts `accounts-empty` and `opening-empty` hidden). (2) read-only test raced its own route handler at test end (`route.fetch: Target page closed`, ~20%); fixed at the test with `page.unrouteAll({ behavior: 'ignoreErrors' })` on tests 3-6 (Playwright's documented teardown), no timeout change
- self-declared differences: hook takes `isEditing`; `not(eq(status,'void'))` because @tanstack/db has no `ne`; isReady also waits for access.isReady; memo is a custom useController input (core TextInput cannot show a derived default; a core `displayValue` prop would need core sign-off); helper rendered with its own testID; useWatch for helper/memo; form hook also returns onPresetChange/onDateChange
- gate 1: tests unedited: yes · pass (check 1112 tests; full e2e 77 passed, 1 skipped)
- gate 2: invalid shots: none (loading and read-only have no shots; the reference set has none either) · blocking: none · notes: 6, listed under Design notes
- gate 3 A (correctness): accepted+fixed: books_access error now surfaced (useBooksAccess returns isError, collection) and added to retry queries; ready query with no settings row is the `error` state (migration 2100000001 inserts the row, delete rule null); memo error line role=alert/testID; onPresetChange has no fallback; shouldDirty on date change; added a read-only link-visible assertion; users source in retry was accepted then removed by the fix review (shared collections must stay out of recoverLiveQueries sources). rebutted: whitespace-only memo snaps back to the default (spec: empty memo means untouched; cp1 `effectiveMemo` and the e2e pin it); close-date change live re-validation (no screen changes it); read-only checks of `opening-save`/`opening-post` are vacuous until checkpoint 5 (commented in the test, re-asserted there)
- gate 3 B (conformance): accepted+fixed: stale/removed `backTo` and redundant useBackToChart parameter reverted; `text-muted` token check (same value, switched to text-muted-foreground). rebutted/noted: hand-written annotations are cp1 types derived from generated types; help icon and toolbar link touch targets under 44 (core HelpIcon has no hitSlop; link copies ImportLink); help icon points at a topic checkpoint 7 adds
- fix review: reviewer A over the fix diff found the shared-sources problem (fixed); the last edit (two sources removed) is the reviewer's own recommendation, verified by check and the full e2e
- out-of-plan changes: hooks/useBooksAccess.ts (additive isError, collection); useBackToChart.ts was changed and reverted
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 3
- test writer: appended the `opening-balances: account grid and amounts` describe to tests/e2e/opening-balances.spec.ts and helpers; red for the right reason: yes (15 of 16 runs red at the missing grid; bullet 6 passes vacuously until checkpoint 5, as planned); untestable: none
- implementer: MoneyInput, OpeningAccountTable/Row/Card/SectionBand, opening-grid-style.ts, lib/opening-window.ts, useRowWindow `heights`/`onLeadingLayout`, form hook (cents, build, items, focusNext); BLOCKED once on a test dispute (below), then DONE through three fix rounds
- test disputes: two desktop tests used `getByText('Detail type')` page-wide; the Chart of Accounts stays mounted behind Opening balances and also shows it. Checkpoint says nothing about unmounting the chart; test wrong; fixed by a fresh test writer (locators scoped to `opening-balances-screen`, other locators audited)
- self-declared differences: sticky band bar uses firstVisible (first item below the bar) and shows title+subtotal only; overscan 6; `useController` defaultValue ''; sign toggle no-op on blank/unparsable; item heights band 48 / row 56 (wide) and band 48 / card 124 (phone) instead of one uniform height (the uniform height made phone band headers a 125px slab); amount error renders in flow (name cell on wide, helper slot on phone) instead of floating; the error replaces the helper/Inactive label on wide while it shows
- gate 1: tests unedited: yes · pass (check 1129 tests; full e2e 96 passed, 1 skipped)
- gate 2: invalid shots: none · blocking: found and fixed (phone band slab; floating error covering the Liabilities subtotal; typed rows below the fold in the 390 capture) · notes: listed under Design notes
- gate 3 A (correctness): accepted+fixed: offset ignored the block above the rows (now measured by the leading block's height; first fix measured y, which web onLayout does not update on position-only changes: found by the fix review); error hidden behind the next row (error moved in flow); sticky band hidden at scroll 0 (always visible); memoized cents/build/items and stable ref callbacks; submit-time zod errors shown; sign toggle guard; weak tests (vacuous sticky and error assertions, `ids[...]` undefined checks, window math pinned by unit tests). noted, not changed: windowing is exercised only by unit tests (the seed chart fits one screen); Inactive label hidden on wide while an error shows; error must stay within two lines in the 140pt Account cell (both current messages do)
- gate 3 B (conformance): accepted+fixed: a11y labels per account, duplicate INDENT and breakpoint calls, sticky mechanism comment. noted: custom MoneyInput over core TextInput (blur formatting, sign toggle, ref registry)
- fix review: three passes; each found and fixed a real problem (stale offset, error placement); last pass clean
- out-of-plan changes: opening-grid-style.ts (avoids a Table/Row import cycle; re-exported from the table); hooks/useRowWindow.ts (additive `heights`, `onLeadingLayout`, `firstVisible`); tests/e2e/account-register-entry.spec.ts (an earlier unit's test read a button box mid-animation, 43.99994 vs 44: now measures `offsetHeight`, the layout height an animation transform does not change)
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 4
- test writer: appended the `opening-balances: preview and totals` describe; red for the right reason: yes (16 runs red at the missing preview/totals); untestable: none (the desktop 'rail stays in view while the body scrolls' claim is not provable with the seed chart; the tests assert only what can fail)
- implementer: OpeningPreview, OpeningPreviewDisclosure, OpeningTotals, OpeningFormScreen (header/body/footer, rail on wide, disclosure below), form hook `preview/hasAmounts/isBlocked/blockMessage/date`; DONE through three fix rounds
- test disputes: none against the implementer; the writer's 'toggle keeps its position when opened' over-reached the spec ("opens in place") and was replaced by assertions that the open preview is inside the viewport above the totals strip
- self-declared differences: `aria-expanded` plus `accessibilityState`; the rail is a non-scrolling sibling instead of `web:sticky`; phone/tablet body is a stateless flex column (grid flex-1, toggle with top border, open preview in its own ScrollView capped at 35% of the body) instead of an outer ScrollView; the toggle row has no Preview chip (the chip is in the preview body); `opening-preview-total-assets` is the Assets section total; rail only at window width >= 1244 (table 560 + rail 360 + app chrome 324), below it the disclosure layout; on windows shorter than 600 the date block moves into the grid's scroll area
- gate 1: tests unedited: yes · pass (check 1129 tests; full e2e 121 passed, 1 skipped)
- gate 2: invalid shots: two (tablet collapsed identical to open; many-amounts without grid rows) fixed and re-captured · blocking: none in any round · notes: listed under Design notes
- gate 3 A (correctness): accepted+fixed: preview showed wrong figures in the success tone when blocked (now problem text, no figures); nested vertical scrollers and a measured-height useState on phone (replaced by a stateless flex column); tablet widths 768-1099 had the Amount column off screen (rail threshold derived from named widths); header ternaries; subtitle 'As of ' for invalid dates; dead isBlocked/blockMessage; short windows clipped the grid and open preview (grid min floor removed, date block into the scroller); short-window and settings-retry e2e added. rebutted: capping preview rows (rail scrolls; 999 amounts is the hard limit); hasAmounts kept for checkpoint 5
- gate 3 B (conformance): accepted+fixed: ternaries in the return, inline styles, balancing-row heuristic, window-size sources unified, shared TABLE_MIN_WIDTH
- retry rewrite (found by a flaky checkpoint 2 test): retry rebuilt healthy queries; after cleaning a healthy settings query the TanStack DB hook kept stale `data`, leaving the screen on `error` after Retry (about 4 of 60 runs) and, via the books_access query, the no-access state. Retry now rebuilds only queries that failed (+ their own source); 40 of 40 runs pass
- fix review: three passes; each found a real issue; last pass clean except notes
- out-of-plan changes: lib/opening-balances-messages.ts `problemMessage`; OpeningAccountTable TABLE_MIN_WIDTH 640 to 560 (exported); useOpeningBalancesScreen retry rewrite
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 5
- test writer: appended the `opening-balances: save draft and discard` describe and helpers; red for the right reason: yes (20 runs red at the missing action bar); untestable: the stored balancing line's removal is not observable in the UI (the reopened form and preview are empty either way: pinned by `diffLines` in checkpoint 1); the late-error carry-over (a mounted form keeps typed values over a late query error) could not be triggered deterministically through the UI on web (core's resume reload is native-only; the only other trigger is a realtime change, which needs a data write the rules ban): untested by e2e
- implementer: useOpeningBalancesForm save/discard/cancel and dialogs, hooks/useOpeningDraftWrites.ts, OpeningActionBar, DiscardDraftDialog, notice, summary, Draft status badge; DONE through three fix rounds
- test disputes: none against the implementer; the tests located confirm dialogs with `getByRole('dialog')`, but core's Dialog renders a Sheet without a dialog role on phones: tests now locate dialogs by title text
- self-declared differences: Opening Balance Equity is created only when a balancing line is needed (the plan's literal text would add an unused account on an empty save); Cancel and Discard go through useBackToChart; after a confirmed discard the screen goes back to the chart; Post renders with the enable rules but has no handler until checkpoint 6; a replace-state save inserts a new draft with `replaces` set and never touches the posted lines (seeding the amounts from the posted lines is checkpoint 7)
- gate 1: tests unedited: yes · pass (check 1129 tests; full e2e 144 passed, 7 skipped; the skips are the scratch capture specs)
- gate 2: invalid shots: none · blocking: found and fixed (missing Draft badge) · notes: Draft badge tone (now neutral outlined)
- gate 3 A (correctness): accepted+fixed: `reset(getValues())` made in-flight edits the clean baseline (now reset with the submitted payload and keepValues); failed discard hid its error behind the dialog; line refusals shown under the offending amount; refusals naming non-form fields are root messages; `save` refuses when blocked; bare catch now logs unexpected errors only; Opening Balance Equity recovery keeps the original error; memo and preset follow the date on reopen; the form stays mounted through transient states (state held with the documented set-during-render pattern, no ref written in render); positions from a Map. noted: hand-rolled `isBlocked` disable (CLAUDE.md bans a canSubmit derived from field values; the spec mandates blocking Save and Post on a too-large figure; kept, with the `save` guard and a comment)
- gate 3 B (conformance): accepted+fixed: isVisible pattern for notice and summary, field errors moved into the hook, unused removal
- core change attempted and reverted: the implementer added `role="dialog"` to core's Sheet/Dialog so phone dialogs expose it; reverted (no core change approved); the proposed diff is kept in the scratchpad (`cp5-core-proposal.diff`). Core's phone Dialog has no dialog role: an accessibility gap worth a core PR
- fix review: three passes; last pass found two cosmetic items (fixed)
- out-of-plan changes: hooks/useOpeningDraftWrites.ts (new, write logic split out); hooks/useOpeningBalancesScreen.ts and OpeningBalancesScreenView.tsx (late error keeps the mounted form, `isRefreshing`, `hasLateError`); lib/opening-balances.ts (export `OPENING_BALANCE_EQUITY_NAME`); lib/opening-balances-messages.ts (`refusalMessage`, `lineRefusalMessage`, `refusalNamesFormFields`); OpeningBalancesHeader `statusBadge` and `OpeningStatusBadge`; scratch capture spec `helix-states` now skips unless HELIX_STATES=1 (it saved drafts into the shared e2e database and broke the refusal tests)
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 6
- test writer: appended the `opening-balances: post and posted view` describe and helpers; red for the right reason: yes (4 of 5 red; test 1 already passed because checkpoint 5's bar disables Post: regression coverage); untestable: none
- implementer: `post` (save, then the status update, one `isWriting` guard), `OpeningPostedView`, header badge/subtitle, screen hook posted fields, `stores/opening-post-store.ts`; DONE through three fix rounds
- test disputes: the posted-line regex required a `JE-` prefix; the real seeded document-number prefix is empty (the spec's `JE-1046` is an example of an editable prefix). Ruling: test over-reached; the regex now takes an optional prefix. The implementer's `seed.ts` edit (setting the prefix to `JE-`) was rejected and reverted: it would change seeded settings on every demo/dev install just to satisfy a regex
- self-declared differences: the badge id is `opening-status-badge` (checkpoint 5's component; the checkpoint text said `opening-posted-badge`); header takes `subtitle: { lead, tail }` and `subtitleTestID`; `OpeningPostedView` props are `{ bands, accounts, savedLines, equityAccountId, currency, entryHref }` (the `badge` and `canWrite` props in the Interfaces were dead and removed); posted equity band subtotal includes the Opening Balance Equity row; the posted view mirrors the grid (table header and detail types on wide, cards with a type label on phone)
- gate 1: tests unedited: yes · pass (check 1138 tests; full e2e 153 passed, 8 skipped)
- gate 2: invalid shots: none · blocking found and fixed: the posted bands dropped the Detail type column and the phone type label; phone card amounts were left-aligned (the reference right-aligns) · notes: listed under Design notes
- gate 3 A (correctness): accepted+fixed: the optimistic status flip could unmount the form before the post-pending flag was set, losing a refused post's error summary (a useState set from an async callback is not synchronous; replaced by a Zustand store set before the mutation); posted date was the UTC day (now the local day via `localDayOf`); header line fallbacks; unlogged refusal after leaving the screen; memoized bands; read-only values only computed for the posted view. rebutted: a read-only user sees a draft over the posted entry (spec: a read-only user sees this view for a draft too; the draft always wins); lead/tail space on web (screenshots show the gap; existing text assertions rely on the literal space); warn plus error double log (a refusal with a message is not logged by `guarded`)
- gate 3 B (conformance): accepted+fixed: dead props, nested ternary, `.map()` in returns
- fix review: three passes; each found a real issue; last pass clean
- out-of-plan changes: hooks/useOpeningDraftWrites.ts (`saveDraft` returns the id, `postEntry`); OpeningFormScreen (post wiring; the Files block omitted it); `lib/opening-balances.ts` (`localDayOf`, `postedLine`); `opening-grid-style.ts` (`isWideWindow`); `OpeningAccountTable` (exports `ColumnHeader`)
- reviewer-caught deferrals: none
- commit: see git log

## Checkpoint 7
- test writer: appended the `opening-balances: replace a posted entry` describe, extended tests/register.test.ts, created tests/help-opening-balances.test.ts; red for the right reason: yes (12 e2e red; the register and help unit tests red); untestable: the Journal Entries hand-off has no e2e (no screen; Go-tested in checkpoint 0); the strict `toBeDisabled` on Back during a replace post (the optimistic draft insert turns the state to draft and Back unmounts at once: asserted as absent-or-never-enabled)
- implementer: `replace` seeding, `edit`/`backToPosted`, Edit balances, register label, help topic and links; DONE with two test disputes and two fix rounds
- test disputes: (1) the phone run of the replace-size loop asserted the form seeded 5,000.00 while the desktop run had already replaced the entry with 6,000: the phone run now expects 6,000.00; (2) the phone register filter matched the voided original too: the live row and the Void rows are now counted apart (the register legitimately lists the voided originals)
- self-declared differences: the entries query orders by created DESC so the newest posted entry is picked when there is no draft (fixes a flash of the original's figures after a replacement post); a successful post calls backToPosted so the route's `edit=1` does not re-enter the replace state; Back is a row (not an action-bar button) with no unsaved-changes confirm; the help text describes the real ± sign button; Edit balances is a filled primary button in the header's actions area (the reference), wrapping below the title on phone
- gate 1: tests unedited: yes · pass (check 1148 tests; full e2e 165 passed, 9 skipped)
- gate 2: invalid shots: none · blocking found and fixed: Edit balances placement and style (the reference has a primary button in the header); the replace form on phone had no visible card at open (Back row and notice now scroll with the date block) · notes: Design notes
- gate 3 A (correctness): accepted+fixed: the help text claimed there is no sign button (there is the ± button); Back during a write; the replacement flash (newest posted entry); help More-menu and ± wording. noted: after Save draft in the replace state the screen is a draft and Back disappears; `post` stops after the save if the form was left mid-save and leaves the saved draft; `edit=1` stays in the URL after a refused post
- gate 3 B (conformance): all clean; the help test widened (any dotted hostname-like token, link targets must exist, no 'no sign button', mentions ± and the More menu)
- fix review: clean
- out-of-plan changes: OpeningBalancesScreenView and the header (actions slot), new OpeningPostedActions.tsx; the entries query order
- reviewer-caught deferrals: none
- commit: see git log

## Final review
- eval:
- native: not executed in this run
