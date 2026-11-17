# sales-lists — helix run ledger

- started: 2026-11-17
- mode: unattended
- unit: p2-sales-lists
- package branch: books/p2-sales-lists (from main 7020767)   core checkout: main 87ed80f9
- spec: docs/specs/sales-lists-design.md
- checkpoints: docs/plans/sales-lists-checkpoints.md
- reference: docs/plans/sales-lists-reference/
- evidence: docs/plans/sales-lists-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/sales-lists-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - the status of a row reads from its color at a glance → expressible (Books `StatusBadge` tones `info`, `success`, `destructive`, `muted`, `warning` over core tokens `--color-info`, `--color-success`, `--color-destructive`, `--color-muted`, `--color-warning`; the rules are in `lib/party-transactions.ts`)
  - one proportional bar shows where the money stands → dropped (expressible in direction C only; it needs a server view collection for the totals, and the human picked direction A and cut the money summary bar, Q2)
  - a credit stands apart from a charge → expressible (`transactionTotalText`, typographic minus, `text-foreground`)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Phase notes
- phase 1: unattended; no corrections. Intake: `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-sales-lists/intake.md`.
- design gate (human, 2026-11-17): direction A (tabs by kind, the document beside its list at 1360 px and wider). All 10 recommended answers of the design packet accepted. No platform-only item. No core change.
  - Q1: yes — every kind route gets a `_layout.tsx`; at 1360 px and wider every sales document shows beside a 320 px column of its kind's list, also when opened from a customer page, a report or All sales.
  - Q2: yes — the money summary bar (five totals above the list) is cut.
  - Q3: the status chip table is accepted — All sales has All, Open, Overdue, Closed, Draft, Void, mapped per kind as in spec §3; kind tabs use the words of their own badges.
  - Q4: the default date range is All dates.
  - Q5: yes — search matches number and memo; the customer is found with the customer picker, not through search.
  - Q6: yes — sortable columns are Date, No. and Amount or Total on every tab, also Due date and Balance (Invoices), Expires (Estimates), Balance (Credit memos); Customer, Type and Status do not sort.
  - Q7: yes — batch actions are "Delete drafts" and "Void" (posted invoices, sales receipts, payments, credit memos; one confirm dialog; refusals reported per document); batch Send waits for p2-email-share (not built); no batch Download PDF.
  - Q8: yes — a row menu holds Open, then the read view's actions for the document's status and the user's access, without Edit; a draft holds Open and Delete draft.
  - Q9: yes — each tab keeps its search, chip, date range, customer and sort while the app is open and resets them on reload (a Zustand store, not persisted).
  - Q10: yes — the sidebar gains "Sales" between Banking and Lists, active on all six list routes and on every sales document.
- spec self-review (after the gate), changes in substance:
  - the customer filter is a Books `SearchPicker` over all of `books_customers` with an "All customers" first item; the draft named the Books `CustomerPicker`, which is the Parent customer picker (top-level, active customers only) and has no clear control.
  - the 320 px column: its rows have no row menu, no tick box and no Batch actions; it applies the tab's kept filters and sort; no row is marked when the open document is not among its rows; the selection clears when the list narrows.
  - cards: the Batch actions button stays enabled (its "Select all" must be reachable with no row ticked) and only "Delete drafts" and "Void" are disabled; the Sort menu and "Select all" follow "the list draws cards", not "on a phone".
  - sort: an empty value (draft number, no due date, no expiration date) sorts first in ascending order; ties are newest created first in both directions; a change of sort keeps the selection.
  - states: the "yet" empty state shows when no filter is set and the "match" empty state when one is set (no extra query); a batch action that applies to no ticked document shows a dialog with no confirm button; a reader's draft row menu holds Open only.
- dependencies (not deferrals; the spec excludes them): no Refund receipts tab until p2-refund-receipt adds its kind to `lib/sales-lists.ts`; batch Send until p2-email-share adds it to the Batch actions menu.
- phase 3 pass 2 (unattended, 2026-11-17): direction A. No spark dropped in this pass (the proportional money bar was dropped at the design gate). No human correction of the reference (unattended).
  - fixture: `tinycld/books/lib/sales-lists-fixture.ts` — `SALES_LIST_INVOICES`, `SALES_LIST_ESTIMATES`, `SALES_LIST_SALES_RECEIPTS`, `SALES_LIST_PAYMENTS`, `SALES_LIST_CREDIT_MEMOS`, each `satisfies Partial<Books…>[]` against the generated types (no local interface, no migration). Customers are `CUSTOMER_IDS` of `customer-form-fixture.ts`. Today is `SALES_LIST_TODAY` (2026-11-16). It is not wired into `seed.ts`: the seed already creates all five kinds; phase 4 decides which fixture rows the seed adds.
  - scratch route: `/a/books/helix-mockup?tab=<all|invoices|estimates|sales-receipts|payments|credit-memos>&state=<populated|ticked|sorted|read-only|loading|empty|no-match|error|beside|batch-confirm|batch-none|batch-result>`.
  - capture manifest: `docs/plans/sales-lists-capture.json`; reference: `docs/plans/sales-lists-reference/`.
  - the reference route is `books/helix-mockup` inside the Books layout and sidebar, as the shipping routes (`books/sales`, `books/invoices`, …) are. The sidebar in the reference has no Sales entry (it is not built).
  - choices the reference makes where the spec is silent (a later phase may change them; each is a gate-2 anchor only):
    - column minimums: Date, Due date, Expires and Type 108; No. 64; Customer 150; Memo and Reference no. 130; Balance, Total and Amount 116; Status a fixed 128; tick box and row menu 44 each. The table's minimum is their sum (All sales 900 px, Invoices 886 px for a writer). In the Books layout the list is 956 px wide in a 1280 px window, so every tab draws its table there; at 900 px it draws cards.
    - a row is three siblings (tick box, the open button with the cells, the row menu), 48 px tall; a card is 72 px; a row of the 320 px column is 60 px. A ticked row draws `bg-accent`.
    - toolbar controls are 44 px tall (search, chips, date range, customer, Batch actions). Wide order with the table: search, chips, date range, customer, Batch actions. With cards on a wide window: search, the Batch actions icon, chips, date range, customer, Sort.
    - on a phone the third toolbar row (date range, customer, Sort) scrolls sideways and Sort starts off screen at 390 px: core `PickMenu` size `touch` has a 160 px minimum width. Gate 2 should judge this row.
    - on a phone the shell's New FAB shows on the list (the list paths are not in `hidesNewFab`), beside the header's New button.
    - the 320 px column keeps the "Sales" title, the New button and the tab strip (it scrolls sideways) above the search field.
    - a card with no number shows the type alone (All sales) or the customer alone (kind tab); it draws no "—".
    - Balance shows the stored amount for a draft and a void document ($0.00), not "—" (spec §3 lists "—" only for customer, number, memo, due date and expiration date).
    - the Payments tab's amount column header reads "Amount" (spec §3 column table).
    - batch dialog copy: "Delete 2 drafts?" / "3 selected documents are not drafts and stay. The drafts and their lines are deleted. This cannot be undone." and, when none applies, title "No drafts to delete", body "None of the 3 selected documents is a draft.", one "Close" button.
    - Sort menu labels: "<column>, newest first / oldest first" for dates, "<column>, low to high / high to low" for No. and amounts.
  - not in the reference: the document beside the list is a stand-in (the existing read view is not changed by this unit); the keyboard row focus has no shot; the `aria-busy` state has no visible difference.
- phase 4 (unattended, 2026-11-17): plan `docs/plans/sales-lists-checkpoints.md`, 5 checkpoints, no checkpoint 0; plan-check `--unattended` exit 0 (0 errors; the warnings are names that a later checkpoint does not mention and names that no source has yet).
  - checkpoints: 1 Document list query and rules (logic; gates 1 · 3) · 2 Sales tabs, rows and states (renders) · 3 Filters and sort (renders) · 4 Row menus and batch actions (renders) · 5 List keys and help topic (renders). E2E budget 12: 0 + 4 + 3 + 4 + 1.
  - retro checks carried from p5-audit-log, in checkpoint 1: `tests/doc-type-coverage.test.ts` and `tests/migration-prefixes.test.ts`. The first is red on today's code: `DOC_TYPE` (`lib/audit-fields.ts`) has no `bill_payment`; checkpoint 1 adds it and exports `DOC_TYPE` and `ROUTED_DOC_TYPES`.
  - reference choices: all confirmed (the list is in the plan's notes). Decided where the reference has no shot: the keyboard row focus is store state, drawn `bg-muted` with `aria-current`; the open row of the 320 px column draws `bg-accent`. Kept as a gate-2 weak point: the phone's third toolbar row scrolls sideways.
  - seed: checkpoint 1 seeds only the fixture's draft rows (invoices, sales receipts, payments, credit memos), so no ledger total or number sequence moves.
  - decisions a later phase must know: (a) the kind `_layout.tsx` files nest `[id]` and `new` in child stacks, so checkpoint 2 moves `useBackToEntries` and `useOpenDocument` to a flat screen list (`lib/stack-screens.ts`, `hooks/useStackScreens.ts`, `KindStackContext`) and adds the Sales list labels; its regression list is long and part of it goes to the driver as NEEDS-RUN; this design is from reading the code, not from a run; (b) one store field `menu` holds the open menu, so the list keys are off while a menu is open; (c) the list keys are off while a document covers the list below 1360 px; (d) the row menu's Void dialog keeps `VoidDialog`'s fixed ids `void-dialog` / `void-confirm`; (e) tick boxes are `SelectBox`, not the accounts list's `RowCheckbox`.
  - not covered by e2e (accepted, in the plan's notes): the 50-row window growing (the 12-test budget is used; `tests/e2e/list-paging.spec.ts` can take a seeded case as a 13th test), an inactive customer in the picker, the reader on a phone, Download PDF, the keys of the 320 px column, the ⇧? list.
  - plan review (one general-purpose agent; report `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-sales-lists/plan-review.md`): 4 high, 14 medium, 25 low. Fixed in the plan:
    - high: a form's Cancel, leave and Back from a document opened from a Sales list went to Journal entries (no Sales list in `LABELS`, and the hook read the child stack only) → the flat screen list and the list labels, with e2e on the back link and Cancel; the back label needs the stack at render → `useStackPosition` over `useNavigationState`, no press-time read; `getParent()` on a root screen is not the Books stack → it is called only on a nested screen; `RowCheckbox` cannot give the list's ids or a mixed state → `SelectBox`.
    - medium: a pop that spans a child stack stops at its first route → `popPlan` and a root `StackActions.pop(1)`; `VoidDialog` and `SearchPicker` props (fixed ids, `picker`, `triggerTestId`, `searchTestId`, `optionTestIdPrefix`, the fixed "Could not load." row); the keyboard e2e now presses every key of the map; the states test holds the read before the Sales entry is pressed; new e2e steps for `aria-busy` with kept rows, cards by measured width at 900 px, Delete draft from a row menu, a row-menu navigation, a sub-customer in the picker, the picker's empty text and load error with Retry; `rowActionHref` unit test; Gate 1 lists of checkpoints 1 to 4 extended.
    - low: the ellipsis in a list, `columnStyle`, `SelectBoxState` values, `ListCards` `heightOf`, the `migrationField` scan, core `useDebouncedValue`, the seed's ids and the draft payment, the access read's loading and error, the tab-replace test.
    - not acted on: no e2e for "Search does not match the customer's name" and for the tab strip scrolling (the search clauses unit test and gate 2 cover them); `new` beside the list and a document opened from a customer page or a report at 1440 (the same route and layout as the tested case).
- review mode switches: none

## Final review
- eval: (unattended only) approved | revised → <notes, fix sha> | stopped
- human comments and what changed
- native: not executed in this run
