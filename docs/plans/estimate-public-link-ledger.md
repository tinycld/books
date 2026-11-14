# estimate-public-link — helix run ledger

- mode: unattended
- unit: p2-estimate-public-link
- started: 2026-11-13
- package branch: books/p2-estimate-public-link (from books main bf4b60e)   core checkout: main 6b4853f9
- spec: docs/specs/estimate-public-link-design.md
- checkpoints: docs/plans/estimate-public-link-checkpoints.md
- reference: docs/plans/estimate-public-link-reference/
- evidence: docs/plans/estimate-public-link-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/estimate-public-link-capture.json
- review mode: C — none (unattended)
- core extension: none
- sparks:
  - Total first, decision under it → expressible (total `text-3xl font-semibold text-foreground`; Accept core `Button` primary, Decline core `Button` outline, full card width)
  - The business's own page → expressible (core `OrgLogo` + Books `business_name`, fallback `useOrgInfo().org.name`; no app chrome; brand color not carried: a print data value, not a theme token)

## Deferrals
(none yet)

## Rebuttals
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
- cp 1 · reviewer A NOTE 9: `server/estimate_responses.go` `checkEstimateResponse` — a response naming an estimate id that does not exist returns a wrapped read error (500), not a refusal. A REST request cannot reach it (the createRule reads `@request.body.estimate.public_token`); only an app save (the seed) can, where it fails loudly. Optional polish: return nil on `sql.ErrNoRows` so the schema's relation validation answers.

## Out-of-plan changes
- cp 1 · `server/estimates_test.go`: `mkEstimateRow` sets `public_token` from `newPublicToken()`; the helper saves estimates on an app with no estimate guard, and `public_token` is now required (four delete-guard tests failed with `public_token: cannot be blank.`). No assertion changed.
- cp 1 · `server/ledger_rules_test.go`: `TestLedgerRules_EveryPathRequiresLogin` passes `booksPublicPaths` (books_estimate_public list/view, books_estimate_responses create, each with its reason) to core's `rlstest.RequireAuthGuardOnAccessRules`; those three rules are public by design (spec §4.2, §4.3). A stale entry fails the scan.

## Phase notes
- phase 1 / design gate (human, 2026-11-13): picked direction A (one card, decision directly under the total).
- design gate answers: open questions 1–3 and 5–15 accepted as the packet recommended (1 view collection `books_estimate_public` with token rule via `setShareToken`; 2 anonymous `useMutation` insert into `books_estimate_responses` with a Go hook in `serialized`; 3 Accept asks the name, required, ≤ 200, accepted date = server `todayUTC`; 5 page shows the result, no change of mind through the link, buttons only while pending and not expired; 6 Expired / Closed / not-valid texts; 7 no line table, Download PDF through a token-checked route; 8 no live push, re-read on foreground / network back / after own response; 9 "Copy customer link" `ShortcutButton` ⌥L after Convert to invoice, phone in More; 10 no revoke or reset; 11 heading = Books business name or deployment name + org logo; 12 no shortcuts on the public page, name focuses, Enter submits; 13 `public_token` in 2100000012 in place, view + responses in one new migration numbered at plan time; 14 Payor view cut; 15 no notification).
- design gate Q4 changed by the human: Decline keeps the inline confirm step AND has an optional free-text reason (zod, optional, max 1000, blank stored as empty) stored on the `books_estimate_responses` row (`reason`). Books users see it on the estimate where the Rejected status shows: a "Declined by the customer on <date>. / Reason: <reason>" note under the estimate form's status row and in the read view under the status badge (spec §3.3, §3.5, §4.3, §4.4). The "no reason field" text and the Cut item were removed from the spec.
- platform items: none new (standing approval 2026-11-11: ⌥L on web and iOS hardware keyboard; first-input focus web only).
- phase 3 pass 2 (2026-11-13, unattended): direction A captured. Fixture `tinycld/books/lib/estimate-public-link-fixture.ts` (public-view rows for every state via local `EstimatePublicRow`, `EstimateResponseRecord` mirroring spec §4.2/§4.3 — the migration checkpoint must replace both with the generated types and `satisfies` them; two new decline estimates 1006 Bluefin (long reason) and 1007 Cedar & Pine (empty reason), created Pending with expiry 2027-02-01, plus their lines and `DECLINE_RESPONSES`). Scratch route `tinycld/books/screens/helix-mockup.tsx`, states: pending, long, bare, accept, accept-empty, accept-sending, accept-refused, decline, decline-typed, decline-sending, decline-network, accepted, declined, closed, expired, loading, not-found, load-error, books-note, books-note-empty, books-read-note. Manifest `docs/plans/estimate-public-link-capture.json`; reference set `docs/plans/estimate-public-link-reference/` (21 shots, 390/1280, light/dark).
  - Reference decisions: Decline estimate uses core `Button` variant `destructive` (Accept estimate `default`); result texts and the refusal box sit in the card where the decision was, above Download PDF; refusals and the network failure draw in core `FormErrorSummary` (`destructive`, no title, no field names); the "Questions?" email/phone are `Button` `link` size `sm`; dates read "Estimate date <d> · Expires <d>" on one line; no status badge on the public result states (the spec names none).
  - The card's 560 px cap: `max-w-[560px]` did not cap the column inside the ScrollView content container (first capture stretched it to the content width); `style={{ maxWidth: 560 }}` did. The build must check the cap on the shipping route `/p/books/estimates/<token>` (no sidebar there; the reference renders inside the Books shell, so measure widths on the shipping route).
  - Not in the reference: the org logo (the e2e deployment has no logo, and the logo shows only when one exists); the Copy customer link button/More item (one more `ShortcutButton` in the existing action bar; gate 2 captures it on the real form). The Books decline note is shown in a simplified band (header, Status select, note; read view: details with the note under the status badge), not the full form.
  - No spark dropped. No human corrections (unattended).
  - Workspace: `packages:generate` asked for `pnpm install` (version pins changed; pbtsdb lacked `batch`); ran it at the workspace root before the capture.
- phase 4 (2026-11-13, unattended): 4 checkpoints, no checkpoint 0, no core change. 1 Token, public view, response guard (logic; migration `2100000014_create_books_estimate_public.js`, 2100000013 left to p3-bill; `public_token` in 2100000012 in place; fixture moved to generated types; seed adds 1006/1007 declined through the guard — the phase-4 grep found no spec pinning seeded estimate counts or numbers, CP1 Do 1 re-checks); 2 Customer link and public page (renders; 560 cap by `style={{ maxWidth: 560 }}`, checked in e2e and gate 2 on `/p/books/estimates/<token>`); 3 Accept and Decline on page (renders); 4 Decline note and help (renders). E2E budget 11 of 12. plan-check: 0 errors.
  - Plan review (general-purpose agent, report `staging/p2-estimate-public-link/plan-review.md`): 3 blocker, 10 fix, 15 note; all fixed in the plan except where noted.
    - **Blocker 1, spec changed (human: please confirm at the end):** spec §4.3's token clause on the responses list/view rule let a token holder probe private estimate fields through a relation filter (`estimate.memo~"x"`, `estimate.customer.email`, `estimate.books_estimate_lines_via_estimate.description`), because the PocketBase fork checks only hidden fields, not the related collection's rules, on a client filter. The rule is now Books READ only (the page never reads responses; PocketBase's create returns the record to its creator without a view-rule check). Spec §4.3 amended; CP1 adds relation-filter and `expand` probe tests.
    - Blocker 2: core `DocumentTitle` writes `<brand>: <title>` and cuts at 40 characters → `maxDetailChars={Infinity}`; the e2e asserts the title ends with `Estimate <n> · <business>`.
    - Blocker 3: the CP4 conflict step could not run without a save → the test edits and saves to raise the conflict; adds unsaved-Rejected (no note) and the note's load error + Retry.
    - Fixes: `OrgLogo` only when `org.logoUrl` is set (core draws an initials avatar otherwise); message-only refusals via Books `lib/refusal.ts` to the root error (no "Something went wrong" toast); `usePublicPdfDownload` has no pending state or own toast (`downloadFromUrl` returns at once); e2e token read sends the bearer token (books-report-helpers precedent); `apiSeq` gains the share-token header; `types.ts` re-exports the two types; responses `omitOnInsert: ['created','updated']`; card gains a `refusal` prop in CP2; Back on Decline and `Accepting…` in-flight tested.
    - Notes acted on: `PublicEstimateReady` owns the response hook (no conditional hook); `page.unroute` for one route; business text read from the page; `useDocumentShortcuts`/`barKeysOf` changes named; `parseDay` error handling; `re.App` in the route; log contexts; local-vs-UTC today and deleted-estimate refusal recorded as plan decisions; contact-line and reason-length UI assertions added.
    - Notes accepted as uncovered: the read-view decline note (no Books reader in the e2e seed), Copy customer link absent on closed/reader, no bottom bar on a phone (gate 2); "as every Books view" precedent for `changesignal.RegisterView` does not exist (first Books view registered).
- review mode switches: none

## Checkpoint 1
- test writer: server/estimate_link_test.go, estimate_public_test.go, estimate_responses_test.go, pdf_routes_test.go (+2), audit_test.go (+2), oauth_scopes_test.go (+1), env_test.go (`apiReq`/`apiSeq` `shareToken`), registrations_test.go (hand-bound list + changesignal registry reset), tests/estimate-public-link-fixture.test.ts, tests/collections.test.ts (names + omitOnInsert test); 32 tests; red for the right reason: yes (Go: missing names under test, then behavior failures proven against throwaway stubs; `TestPublicTokenPattern_RefusesMalformedTokens` and `TestRegister_BindsEachPartOnce` red only on missing names; vitest 4 red; tsc red on missing generated types); untestable: none
- Do 1 grep (runner): hits only in tests/document-form-title.test.ts (`Estimate 1001` title text), bank-import-mapping.spec.ts (a date), customer-form-list.spec.ts (customer search), customer-tree.test.ts (customer name): none counts or names seeded estimates; no change
- implementer: two dispatches split by layer (>15 files). 1: migrations (public_token in 2100000012; 2100000014 view `pbc_books_est_public` + responses `pbc_books_est_resp`), collections.ts, hosts.ts, types.ts, both fixtures, seed `seedDeclinedEstimates`; DONE. 2: Go token, response guard, public PDF route + `writePDF`, registries; DONE.
- test disputes:
  - tests/collections.test.ts: asserted `books_estimate_public` registers with `omitOnInsert ['created','updated']`. Settled for the implementer: the test was wrong — spec §4.2 "Columns only: `id` (estimate id), `token`, `number`, … `business_phone`" and the Decisions' view SQL have no autodate column, so pbtsdb's `OmittableFields` refuses those names (TS2322); the plan's "both with omitOnInsert" is a plan defect for the view. A fresh test writer changed it to: the view is registered and has no `omitOnInsert`.
  - server/pdf_routes_test.go: asserted the PDF text holds `"Estimate "+number` as one string. Settled for the implementer: the test was wrong — Do 6 "extract `writePDF` from `servePDF` … with no behavior change" and spec §4.3 "rendering the existing estimate kind"; that PDF prints `Estimate` and `No. 1001` on separate lines (pdf_template.html). A fresh test writer changed it to `Estimate` and `No. <A's number>`.
- self-declared differences: (1) view has no `omitOnInsert` (the dispute above); (2) view collection id `pbc_books_est_public` (the brief named only the responses id); (3) `fixtureToken(tag)` exported from `lib/estimate-form-fixture.ts` (the public fixture's former local `tokenOf`), so `PUBLIC_ROWS.pending.token === ESTIMATES[0].public_token`; (4) `PUBLIC_ROWS` `satisfies Record<string, BooksEstimatePublic>`, `EstimateSeed` requires `public_token`; (5) `server/estimates_test.go` `mkEstimateRow` sets `public_token` (it saves on an app with no estimate guard, and the field is now required); (6) `server/ledger_rules_test.go` passes `booksPublicPaths` (the view list/view and the responses create, each with a reason) to `rlstest.RequireAuthGuardOnAccessRules`; (7) a `parseDay` error on a stored expiration date refuses with `refuse("%v", err)`.
- gate 1: tests unedited: yes (two test-writer fixes of the disputes above, staged) · `packages:generate` ok, `tinycld-pkg check` pass (4992 tests), `go test ./...` pass, e2e estimate-form 5/5, estimate-form-convert 4/4, sales-documents-conflict 7/7, customer-form-list 2/2; seed log clean · pass
- gate 2: n/a (nothing renders)
- gate 3 A (correctness): 0 BLOCK, 9 NOTE. NOTE 1, 2 (out-of-plan test files) → recorded under Out-of-plan changes; NOTE 3 (register.go comment says the public page is kept live, spec §3.4 says it is not) → accepted+fixed (comment reworded); NOTE 4 (`setFields` error dropped in the token-kept test) → accepted+fixed by test writer (save must succeed); NOTE 5 (no accept with an expiration date of today or later) → accepted+fixed by test writer (`TestEstimateResponse_AcceptBeforeTheEstimateExpires`, today and tomorrow, shown to fail on `<=` and on refuse-any-date); NOTE 6 (no `expand` probe on the create's 200 body) → accepted+fixed by test writer (`TestEstimateResponse_CreateExpandProbe`, shown to fail with a reader's auth); NOTE 7, 8 (test and view differ from plan text) → recorded under test disputes above; NOTE 9 → Design notes
- gate 3 B (conformance): script lines: 0 real, 1 false positive (2100000012 edited in place: Books unreleased, spec §4.1 and the Decisions say in place) · finding 1, 2 (out-of-plan test files) → recorded under Out-of-plan changes; finding 3 (same register.go comment as A NOTE 3) → accepted+fixed
- gate 1 after fixes: tests unedited by the implementer: yes · `packages:generate` ok, `tinycld-pkg check` pass, `go vet` and `gofmt` clean, `go test ./...` pass; e2e not re-run (the fix changed only Go tests and one Go comment)
- fix review: round 1: clean
- gate 3 A notes: 1 (NOTE 9), listed under Design notes
- reviewer-caught deferrals: none
- commit: the commit "feat(books): estimate public token, public view, response guard and public PDF route" (this ledger row is in it; `git log --grep "estimate public token"` gives the sha)
- human: n/a (review mode C)

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
