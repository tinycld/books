# customer-pages — helix run ledger

- started: 2026-11-13
- mode: unattended
- unit: p2-customer-pages
- package branch: books/p2-customer-pages (from main bf4b60e)   core checkout: main 6b4853f9
- spec: docs/specs/customer-pages-design.md
- checkpoints: docs/plans/customer-pages-checkpoints.md
- reference: docs/plans/customer-pages-reference/
- evidence: docs/plans/customer-pages-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/customer-pages-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - the money position is readable at a glance: large figures, a small label, a thin status-colored marker → expressible (`text-2xl font-semibold text-foreground`, `text-xs uppercase text-muted-foreground`, `border-l-[3px] border-warning` / `border-danger`; check in pass 2 that `border-l-[3px]` is in a scanned file, or use an existing width class)
  - email and call one tap from the name → expressible (lucide `Mail` / `Phone`, `useThemeColor('muted-foreground')`, 44 px `Pressable`s with accessibility labels, `Linking.openURL`, `isVisible` when the value exists)

## Deferrals
- **agreed:** design packet Q6 and spec §3.4: the customer page has the tabs "Transactions, Statements, Contacts, Details, Notes" (`docs/superpowers/specs/2026-10-21-books-design.md` §Interface)
  **built:** the tabs Transactions, Contacts, Details and Notes; no Statements tab
  **reason:** missing dependency
  **blocker evidence:** unit p2-statements (master ledger; depends on p2-apply-credit) is not built: no statements code, collection, route or screen exists in `books/` at main bf4b60e (verified 2026-11-13: a search of `books/tinycld/books`, `books/server` and `books/pb-migrations` for `books_statements`, "customer statement", `statements/`, `StatementForm` and `p2-statements` finds nothing; the only "statement" hits are bank-statement import code)
  **impact:** a user cannot see or create a customer statement from the customer page
  **unblock:** unit p2-statements is built; it adds the Statements tab as a fifth entry of `lib/customer-page-tabs.ts` and its "Statement" item through `NEW_ACTIONS` (`takesCustomer`); the p2-statements agents act
  **tracked in:** master-ledger unit p2-statements; spec docs/specs/customer-pages-design.md §5 (Contracts, p2-statements)
  **found by:** design gate (human, 2026-11-13, packet Q6 accepted as a deferral)
  **checkpoint:** none (decided before the plan)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
- cp 1 · reviewer A NOTE: server/party_contacts.go — the update hook binds its own `serializedThen` because `bindSerializedGuardThen` (server/guards.go) runs its after-step on create only; this is a second pattern for a serialized guard with an update after-step. Optional: give `bindSerializedGuardThen` an update after-step, or name party_contacts.go in a guards.go comment.
- cp 1 · reviewer A NOTE: server/party_contacts.go `clearOtherPrimaries` saves each cleared contact with `tx.Save`, which re-runs the contact guard (one extra `FindRecordById` per cleared row, nested transaction). Correct; a party has at most one other primary. No fix proposed.
- cp 1 · reviewer A NOTE: server/party_contacts_test.go `TestPartyContacts_ReaderCannotCreate` asserts status 400 and a count of 0, not the response body; the body is valid (same shape as the writer tests), so the rule is the only cause. Optional: drop the redundant `FindCollectionByNameOrId` check in its `after`.

## Out-of-plan changes
- cp 1 · `tinycld/books/types.ts`: re-exports `BooksPartyBalances` and `BooksPartyContacts` from the generated schema. The fixture and `tests/customer-page-fixture.test.ts` import them from `../types`, which re-exports by name; tsc fails without it. Found by both reviewers; accepted. A later plan that adds a migration names `types.ts` in its Files block.

## Phase notes
- phase 1: unattended; no corrections. Extractions, triage and `[?]` list in the staging intake.md, carried by the design packet.
- design gate (2026-11-13, human): direction C picked (very wide window: list narrows to a 320 px name column beside the customer page; below 1360 px and on phones the p2-customers pushed page). Open questions Q1, Q2, Q4, Q5, Q7–Q17 accepted as recommended (Q7: no link to the `contacts` package; Q8: edit in place with a save bar; Q10: direction C; Q15: Save on a new customer opens its page; Q17: one unit, about five checkpoints). Q6 accepted as a deferral (Statements tab waits for p2-statements; see Deferrals).
- design gate, Q3 CHANGED: `books_party_balances` is a PocketBase view collection (SQL sum of posted A/R lines per customer, debit minus credit), not a stored table. No `applyToPartyBalances`, no writes in the posting transaction, no verifyBalances or rebuild part. Real-time: `changesignal.RegisterView("books_party_balances", "books_journal_lines", "books_accounts")` by collection name, and the client collection uses `liveViewOptions` (pbtsdb `liveTopics: ['collection/books_party_balances']`). The view query has no `UNION ALL` (PocketBase refuses it). Vendor rows (A/P) stay with p3-vendor-pages, which rewrites the view query in its own migration.
- design gate, Q18: the two migrations (party balances view, party contacts) take the next free numbers in `books/pb-migrations/` at plan time; 2100000013/14 are not reserved (p3-bill in another lane plans 2100000013).
- design gate follow-up: spec updated (§2 files, §3.2 balance, §4 Data, §5 Contracts, §6 Cut/Deferred, §9) and self-reviewed; moved to docs/specs/customer-pages-design.md. Packet "New shared parts" updated for the view.
- phase 3 (2026-11-13, unattended, pass 2): direction C captured (very wide window: 320 px name column beside the page, no back link; below 1360 px the page with "‹ Customers"; phone stacked header). No human corrections (unattended).
  - fixture `tinycld/books/lib/customer-page-fixture.ts`: invoices, estimates and sales receipts typed with `Pick` of the generated `BooksInvoices` / `BooksEstimates` / `BooksSalesReceipts`; Harborview has every invoice status (Draft, Open, Overdue x3, plain Void, and a replaced original INV-1038 that the list leaves out), every estimate status plus Expired, and receipt Draft / Paid / Void; a `created` tie-break on 2026-11-03. Balances: Harborview Open $27,818.65 / Overdue $11,892.90, St. Jude $124,800.00, Alvarez a credit (−$120.00), Northwind none ($0.00). Contacts for Harborview (primary, long role, long email), Northwind (primary), Alvarez (phone only), keyed by `CUSTOMER_IDS` (seed maps them). `CUSTOMER_PAGE_TODAY = '2026-11-13'` fixes Overdue/Expired. `PartyBalanceRecord` and `PartyContactRecord` are local interfaces mirroring spec §4: the checkpoint that adds the `books_party_balances` / `books_party_contacts` migrations must replace them with the generated types (and that checkpoint, or checkpoint 1, wires `CUSTOMER_PAGE_CONTACTS` into `seed.ts`).
  - scratch route `tinycld/books/screens/helix-mockup.tsx` (`?state=` populated, loading, error, empty (inactive sub-customer, no rows, no contacts), filter-empty, credit, long, read-only, dirty, contact-dialog, discard; `?tab=` as the real page). The Details tab renders the real customer form (`useRecordForm` + core `FormRenderer`, `hideBuiltins(['notes'])`); everything else reads only the fixture.
  - manifest `docs/plans/customer-pages-capture.json`; reference `docs/plans/customer-pages-reference/` (18 shots, 64 images, light + dark; 1600 for direction C on transactions, long, contacts, details-dirty).
  - sparks: none dropped. Spark 1 (figures + thin marker) is built with `border-warning` / `border-danger` and `style={{ borderLeftWidth: 3 }}`: `border-l-[3px]` is in no scanned file (lesson 18), so the build either adds that class in a committed file or keeps the style width. Spark 2 (Email / Call icons beside the name, 44 px, muted-foreground) built as specified.
  - reference choices the build should keep: the New transaction sheet hangs from the bottom on phones (`sheetSide="bottom"`, like the global New menu; the default would hang it from the top); the phone New transaction button is full width (`className="w-full"`); an inactive customer's empty-state New transaction button is disabled too, and the inactive hint sits under the header button; the type chips row needs `flexGrow: 0` on its horizontal ScrollView (without it the chips stretch to the page height); the wide Details form column is left-aligned under the header (max 720 px, px-6), not centered.
  - noted, not fixed (for gate 2 / the plan): in the read-only Details shot, core `FormRenderer` with `readOnly` dims selects and toggles but the text inputs look editable; the build must verify the read-only form against p2-customers' read-only form and treat a difference as a finding. The Books error banner draws with `bg-danger-soft`, which renders (vendor-form ledger said it was undefined; it now shows pink in light mode).
  - environment: `packages:generate` reported "version pins changed"; `pnpm install` at the workspace root was run to apply them (typecheck failed on missing pbtsdb exports before it).
- phase 4 (2026-11-13, unattended): plan `docs/plans/customer-pages-checkpoints.md`, 5 checkpoints, no checkpoint 0 (1 data · 2 page with editable details · 3 balance and New transaction · 4 transactions tab · 5 contacts tab and help); 12 e2e tests (4 · 3 · 2 · 3). Migrations `2100000015_create_books_party_balances.js` and `2100000016_create_books_party_contacts.js` (13 is p3-bill's; 14 left for p2-estimate-public-link). plan-check: 0 errors.
  - plan review (fresh subagent, report `staging/p2-customer-pages/plan-review.md`): 64 findings, all fixed in the plan. Main ones: test 4 made a parent inactive while its sub-customer was active (server refuses; reordered); core Menu focuses its first row (ArrowDown steps removed from tests 5 and 11); three Escape handlers in one scope (RecordSurface now registers Escape-to-leave only while leaving is allowed; the save bar's Cancel owns Escape while dirty); `surfaceRef` not passed (refusals would go to a toast); `?tab=details` broke the customer URL regex in invoice-form-draft/lines (added to cp2 Files); wrong id `customers-cell-email` (is `customer-cell-email`); `afterEdit` must cover the "nothing changed" `leave()` too; `usePublishDirty` / `isBeingDeleted` wiring; `DeleteCustomerDialog` required props; `balanceText(null)` returns "Too large"; `recoverLiveQueries` needs `onError`; `documentHref` takes a kind object; `Dialog.ActionButton` shortcut is `DIALOG_SUBMIT_SHORTCUT`; a core Dialog's first input uses `initialFocusRef`, not `useFocusOnOpen` (recorded deviation from the spec's helper name); the `replaced_by` filter goes in the query (before `.limit(n)`); `READ` needs `AUTH` and `ME`; cp2 NEEDS-RUN now lists every spec that imports `record-form-helpers.ts` and the sales-receipt ⌥1/⌥2 specs; load-error tests route before the first load; overdue, parent-own-figures, root refusal, browser Back, save-in-flight, reload-keeps-tab, chip-runs-one-query and loading states now have e2e steps; Details gets a keyboard-only edit in test 2.
  - accepted, not e2e-tested (named in the plan's decisions and each spec header): read-only users (no seeded reader), a reversal moving Open (Go test covers it), the window growing by 50, phone tab strip scroll-into-view (gate 2), "This contact was removed", the `mailto:`/`tel:` targets.
  - Estimate "Expired" replaces the status label, as `lib/estimate-status.ts` defines it (the reviewer asked whether "plus" means both; the existing Books display is kept).
- review mode switches: none

## Checkpoint 1 — Party balances and contacts data
- test writer: server/party_balances_test.go, server/party_contacts_test.go, tests/customer-page-fixture.test.ts (new); server/oauth_scopes_test.go, server/registrations_test.go, tests/collections.test.ts (changed); 22 tests. Red for the right reason: yes (Go: undefined `partyBalancesView` / `registerPartyBalances`, missing-behavior reds shown with a temporary stub; vitest: collection names missing). Exception: tests/customer-page-fixture.test.ts is red at tsc only (no `BooksPartyBalances` / `BooksPartyContacts` in `../types`); its four data assertions already hold on the phase-3 fixture, which is what they pin. `TestRegister_BindsEachPartOnce` cannot catch a missing `registerPartyBalances` (it binds no hooks); `TestRegister_RegistersThePartyBalancesView` covers that. untestable: none
- implementer: both migrations, server/party_balances.go, server/party_contacts.go (one-party and party-exists guards, primary clearing in the same serialized transaction on create and update), register/ledger/audit/oauth wiring, two client collections, fixture on generated types with `satisfies`, `seedPartyContacts` after `seedEstimates` (primaries last); proved red by removing the `Register` call and the update after-step; DONE
- test disputes: none
- self-declared differences: (1) the contact guard binds its own create and update `serializedThen` hooks, because `bindSerializedGuardThen` runs `after` on create only (verified, server/guards.go); (2) clearing saves other contacts with `tx.Save` so realtime events reach clients; (3) both client collections carry `collectionOptions: indexed`, contacts `omitOnInsert: ['created','updated']`, as every Books collection; (4) contacts collection id `pbc_books_party_contacts`; (5) migration 15 Down removes the index by name; (6) seed sends `vendor: ''`; the seed is not run in this checkpoint (no e2e)
- gate 1: tests unedited: yes · `packages:generate` ok · `tinycld-pkg check` pass (250 files / 4990 tests) · `go test ./...` ok · e2e: n/a (nothing renders; no customer-pages spec yet)
- gate 2: n/a
- gate 3 A (correctness): 0 BLOCK, 5 NOTE: types.ts out of plan (→ Out-of-plan changes); audit.go header comment line of ~115 columns → fixed by the loop (comment rewrap, file already in the checkpoint); three NOTEs → Design notes
- gate 3 B (conformance): script lines: 0 · 1 finding: types.ts out of plan → accepted, kept, recorded under Out-of-plan changes
- fix review: n/a (no accepted finding changed code; the only edit is the reviewer-A comment rewrap the loop applies to a NOTE)
- gate 3 A notes: 3, listed under Design notes
- reviewer-caught deferrals: none
- commit: see git log (feat(books): party balances view and party contacts data)
- human: none (review mode C)

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
