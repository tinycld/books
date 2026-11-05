# tax-rates — helix run ledger

- mode: unattended
- unit: p2-tax-rates
- started: 2026-11-04
- package branch: books/p2-tax-rates (from main 0377271)   core checkout: main 3eb7915e
- spec: docs/specs/tax-rates-design.md
- checkpoints: docs/plans/tax-rates-checkpoints.md
- reference: docs/plans/tax-rates-reference/
- evidence: docs/plans/tax-rates-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/tax-rates-capture.json
- review mode: C — none (unattended)
- core extension: checkpoint 0 on core branch books/p2-tax-rates (from main 3eb7915e) — `SelectOption.section` (Menu.Section headings in SelectInput) and host layout field `description`; found in phase 4, approved by the human 2026-11-04 (design gate had said none)
- sparks:
  - each agency reads as one block (who you pay, which account, its rates) → expressible (Books `SectionCard` pattern `rounded-xl border border-border bg-surface-secondary p-4`, title `text-base font-bold text-foreground`, account line `text-sm text-muted-foreground`, rows `border-b border-border`; Default badge `bg-accent text-accent-foreground`)
  - percentages line up so rates compare at a glance → expressible (right-aligned `tabular-nums` column, as `ProductRow` / `ReportRow`)
  - the first visit asks one plain question and offers the next step → expressible (empty block with a core `Button` "Add agency")

## Deferrals
(none yet)

## Rebuttals
- **finding:** reviewer B, checkpoint 0: "core/ui/form/SelectInput.tsx:60-79 (low) — JSX rule. The component's return is clean, but `menuRows` maps runs to JSX with a nested `run.options.map(itemOf)`, and `itemOf` is a closure that renders JSX. Fix (optional): move it into a small `SelectMenuRun({ run, value, onChoose, testID })` component above the component."
  **rebutted because:** CLAUDE.md: "**Keep JSX minimal.** No complex ternaries, `.map()`, or calculations inside the return. Move all state, event handling, and data processing into custom hooks (`useFeatureName`) or helpers above the JSX." The mapping is a helper above the return, and the reviewer says "The component's return is clean".

## Design notes
- cp 0 · reviewer A NOTE: core/server/forms/hooks_host.go:335-352 vs values.ts:242 — the client skips a hidden built-in, the server checks every changed column built-in; in checkpoint 8, a 101-character certificate number typed, then tax exempt turned off, is refused by the server on the hidden `exemption_number` (PocketBase `max: 100` would refuse it too). Checkpoint 8 must make sure this refusal is visible on the customer form.
- cp 0 · fix review NOTE: textarea/text limits count UTF-16 units on the client and in Go `ValidateDefinition` (jsLength), but runes in the server value check `checkKind` (hooks_host.go:215); 11 emoji in a 20-limit textarea are refused by the client and accepted by the server. Pre-existing for text fields; F2 extends it to textarea.
- cp 0 · fix review NOTE: Go `jsTrim` uses `unicode.IsSpace`, which also trims U+0085 (NEL); JS `trim` does not, so the "exact" comment is slightly wrong for that one character.
- cp 0 · fix review NOTE: a built-in with a bad key and an over-long label reports the label first; the key problem shows on the next try.
- cp 0 · fix review NOTE: Android TalkBack may read a section heading twice (group `aria-label` + heading Text); `aria-labelledby` would avoid it; not checked on a device.
- cp 0 · reviewer A NOTE: core/server/forms/seed.go:222-231 — reconcile adds a layout description only when it appends a missing built-in; an already stored form never gains it (dev DBs need `db:reset`, as decided).
- cp 1 · reviewer A NOTE 3 (B agrees): `ratePercentText` has no guard; a negative, fractional or NaN ppm gives malformed text (`-1.00-1%`). Only a bad stored value reaches it; the migration (checkpoint 2) bounds the stored rate.
- cp 1 · reviewer A NOTE 4 (B agrees): Go `taxOn` panics on an out-of-range amount or rate (Produces fixes the signature with no error return) and no Go test covers the panic. The invoice unit must check the amount and the rate before it calls `taxOn`, or a bad row gives a 500 response instead of a refusal.
- cp 1 · reviewer B NOTE: `taxOn` repeats the integer half-away rounding of `report-format.ts` `roundedQuotient` (the plan specifies the formula); the scratch `helix-mockup.tsx` has its own `percentText`/`groupPpm` (deleted before the PR).

## Out-of-plan changes
- cp 0 · core `cli/form_help/definition.txt`: names the new Go `Field` key "description"; `TestCLIDefinitionHelpNamesEveryKey` requires every JSON key in the help.
- cp 0 · core `docs/packages.md`: the forms row documents the layout `description` and the text built-in `maxLength`.
- cp 0 · gate 3 fixes outside the Files block (staging cp0-fix.md): core/lib/forms/definition.ts (textarea custom field `maxLength`, an existing client gap reviewer B found: the CLI help promises it, the client dropped it), core/server/forms/definition.go (Go `ValidateDefinition` checks description and label length, reviewer A NOTE 3), core/ui/menu/index.tsx (`Menu.Section` is a labelled group for screen readers, reviewer A NOTE 4).
- cp 1 · `docs/plans/tax-rates-capture.json`: biome format only (the `widths` arrays). Committed in 78798a6 without a check; it failed gate 1 before tsc and vitest ran. Weakens no test (reviewers A and B).

## Phase notes
- phase 1: unattended; intake at ~/tmp/tinycld/auto-helix-books/staging/p2-tax-rates/intake.md; feature inventory outcomes in the design packet (staging/p2-tax-rates/packet.md).
- phase 3 (design gate, 2026-11-04): the human picked direction A (Taxes page by agency; edits in core Dialog, a bottom sheet on phones) and accepted the recommended answer to every open question 1–16: liability account on the agency (glossary reworded); one `books_tax_rates` collection with `type` rate | group; integer `rate_ppm`; per-rate rounding on the document total, half away from zero, TS helper + Go mirror + shared vectors; `is_default` flag set by writers; new Non-inventory taxable, Service not; four customer tax built-ins with two hide rules; delete/inactive refusals per spec; a used rate may change (invoice snapshots); one-tap "Create Sales tax payable account"; Books writers manage; sidebar "Taxes" after Accounting, page title "Sales tax"; cuts as listed; seed 2200 + tax fixture; audit + OAuth registration, not search; accept reconcileForms placement for stored forms. No [platform] items, no core extension.
- phase 3 pass 2 (2026-11-04, unattended): direction A built as the scratch route `tinycld/books/screens/helix-mockup.tsx` over `lib/tax-rates-fixture.ts` (local interfaces until checkpoint 2 swaps in the generated types); reference captured to `docs/plans/tax-rates-reference/` from `docs/plans/tax-rates-capture.json` (24 shots: populated, row-menu, row-menu-phone, read-only, show-inactive, empty, empty-read-only, one-rate, loading, error, refusal, add-agency(-phone), add-agency-no-account(-phone), add-rate(-phone), add-group(-phone), edit-group, delete-rate, customer-exempt, customer-not-exempt, product). Sparks: none dropped; all three expressed with core parts and tokens. Reference notes, not corrections: the Default badge (`bg-accent text-accent-foreground`) reads as green text with almost no pill in light mode on `bg-surface-secondary`; the route's default picker is a flat core `SelectInput` with "<rate> <percent> · <agency>" labels, because core `SelectInput` has no section headings (the build groups them under agency headings after checkpoint 0); the route's product Taxable hint is drawn by core `Toggle`'s `hint`, which a forms-engine toggle built-in cannot carry today (checkpoint 0); the customer/product states show the new fields only, drawn with core inputs, not the forms renderer.
- phase 4: review mode C (unattended). Human approved core checkpoint 0 and the group-components read (two live queries + pure `buildTaxesView`). Plan review (staging/p2-tax-rates/plan-review.md) findings fixed: A (18, bullets narrowed or untested) — each now has a failing test: assertions folded into existing e2e (loading, read-only default text and controls, offline, No rates yet, duplicate rate name, Remove default, agency menu refusal and delete, rate edit, picker headings, certificate limit, help link, Taxable across a type change in an existing products-services test) or pure-helper / tricky-hook unit tests (`emptyState`, `groupsHint`, `addGroupEnabled`, `tax-writes`, `rateAgencyOptions`, `groupLine` 4.125%+4.125%, `TAX_MENU_WRITES`, `pendingDefaultId` default rule, refused default, `summaryEnabled`); A3 per driver ruling: a group's rates by rate name; A8/A11 fixture gained an inactive group, an inactive agency rate and a 0.105% rate (reference re-captured, 24 shots); A15 certificate number as `ExemptionNumberField` with maxLength 100 (LegalNameField precedent). B (8 placeholders) — full texts, full built-ins, picker arguments, full command, repeated refusal/footer text, every component prop typed, undefined names defined, help summary/order 33. C (6 name mismatches) — one client message name set, ShowInactiveChip `minHeight` prop, `useTaxesScreen` return restated in checkpoint 7, "from checkpoint N" corrected, `validateTaxRateComponents` / `validateCustomerTax` in Produces, `taxesControls` takes `.available`. E2E stays 12. plan-check: 0 errors, 220 warnings. A15 driver ruling (missing capability → core): checkpoint 0 adds an optional `maxLength` on a host `text` built-in (TS host schema + Go defs, enforced through the existing custom-text `textSchema` and `checkKind` paths, core tests on a fictional host); the certificate number is back to a plain `text` built-in with `maxLength: 100`, `ExemptionNumberField` dropped, its 100-limit e2e assertion kept (now an inline error that stops the save); `LegalNameField` untouched. plan-check: 0 errors, 219 warnings.
- phase 4 worker notes (2026-11-04): plan `docs/plans/tax-rates-checkpoints.md`, 9 checkpoints (0 core select sections and host field descriptions — approved by the human after the plan, the design gate had said "core extension: none"; 1 tax math; 2 collections, guards, seed; 3 refusals; 4 page; 5 agency and rate dialogs; 6 group dialog; 7 row menus, default, refusals; 8 product and customer fields + help). Self-review: coverage — every Behavior bullet quoted verbatim (plan-check), no Cut item; names — one spelling per hook/type/helper across checkpoints; fixture — checkpoint 2 lists `lib/tax-rates-fixture.ts` under Modify with `satisfies` + seed wiring; placeholders — none; gate 2 regions — checkpoints 4–8 name reference shots and built URLs. Self-review fixes made: rate names in e2e take `uniqueName` (names are unique across all rates and groups); the record form stores are typed by the collection row (`useRecordActions` snapshots `collection.get`); the default picker's form gets a zod resolver; two checkpoint 2 Go tests reordered so they still pass after checkpoint 3's inactive refusals. Seed-count grep (2026-11-04): only `tests/expense-account-options.test.ts` lists every seeded account; checkpoint 2 re-runs the grep. Plan-check: `plan-check.mjs … tax-rates --unattended` → 0 errors, 188 warnings (produced-but-not-consumed names and consumed names not yet in source; expected for a plan). E2E budget 12/12 (`tax-rates:` describes in checkpoints 4–8).
- review mode switches: none
- checkpoint 0 (core): no core version bump; before the first Books release, bump core and pin Books' `peerVersions` to the version that has `SelectOption.section`, the host layout field `description` and the host text built-in `maxLength`.

## Checkpoint 0 — Core select sections, field descriptions, limits
- test writer: core/ui/form/__tests__/select-sections.test.ts (new), select-input.test.tsx, core/lib/forms/__tests__/host-layout.test.ts, host.test.ts, values.test.ts, fixtures layout-hosts.json + layout-definition.json, core/server/forms/seed_test.go, hooks_host_test.go; red for the right reason: yes (missing module, stripped description, missing maxLength, Go compile error on Builtin.MaxLength / Field.Description; 3 regression guards green by design); untestable: none
- implementer: SelectOption.section + selectSections + Menu.Section runs; host layout `description` (TS + Go, seeded, reconcile append); host text built-in `maxLength` (TS schema text-only, client textSchema, Go checkBuiltinLimits); CLI help + docs. DONE
- test disputes: none
- self-declared differences: `section: ''` = no section; `checkBuiltinLimits` loops def.Fields with values vs prevValues; helper `layoutDescription`; Go does not refuse MaxLength on a non-text kind at parse (TS schema does)
- gate 1: tests unedited: yes · pass (core check 437 files / 3511 tests; go test ./forms/... ok; check:core-isolation ok; books/server and tinycld/server build)
- gate 2: n/a (logic)
- gate 3 A (correctness): BLOCK client limit message is zod's default, not "<Label> is too long" → accepted (F1); NOTE Go ValidateDefinition lacks description/label length → accepted (F3); NOTE Menu.Section not a labelled group → accepted (F4); NOTE hidden built-in checked by server only → Design notes; NOTE reconcile description on append only → Design notes; NOTE review header wrong → driver error, corrected
- gate 3 B (conformance): out-of-plan definition.txt, docs/packages.md → accepted, Out-of-plan changes; SelectInput nested map → rebutted (see Rebuttals); serialWidget drops error → accepted (F5); existing textarea maxLength client gap → accepted (F2)
- fixes: fresh test writer (F1 messages, F2 textarea maxLength, F3 Go label/description length, F4 section group, F5 serialWidget error) red for the right reason; fresh implementer DONE (also: definition field schema is one `z.discriminatedUnion('kind')` so a field problem reports at its own path; Go lengths count UTF-16 units like zod); gate 1 again: tests unedited · core check 3519 passed · go test ./forms ok · core isolation ok
- fix review: round 1: reviewer A pass over the fix diff: clean (no BLOCK) · 4 NOTEs to Design notes
- gate 3 A notes: 2 (Design notes)
- reviewer-caught deferrals: none
- merged: core PR #433 (2d8eb48), after a second `origin/main` merge (e5ff98d: #434 `SelectInput` autoFocus, import conflict, kept both)

## Checkpoint 1 — Sales tax math helper
- test writer: server/testdata/sales_tax_vectors.json (13 taxOn, 3 groupTax, 13 parse, 6 text rows, each with a hand `_note`; BigInt cross-check 0 mismatches), tests/sales-tax.test.ts, server/sales_tax_math_test.go; red for the right reason: yes (vitest: cannot find module `lib/sales-tax`; Go: undefined taxOn, groupTax); untestable: none
- implementer: lib/sales-tax.ts, server/sales_tax_math.go. DONE
- test disputes: none
- self-declared differences: Go `taxOn` panics on an out-of-range argument (the Go form of `RangeError`; the interface has no error return), reuses `maxStoredAmount`, adds consts `ppmPerUnit`, `maxRatePpm`; `ratePercentText` does not check its argument; inferred TS return types; out-of-plan `docs/plans/tax-rates-capture.json` biome format fix (committed unformatted in 78798a6; it failed gate 1 before tsc)
- gate 1: tests unedited: yes · pass (books check 738 files, 3375 tests; go test ./... ok)
- gate 2: n/a (logic)
- gate 3 A (correctness): no BLOCK; 2M (JS) + 3M (Go) random `taxOn` cases vs exact big-integer math, 0 mismatches; parse round trip 0..1 000 000, 0 failures. NOTE 1 `taxOn(-1, 1)` is `-0` in TS, `0` in Go → accepted (F1, one line + vector row); NOTE 2 `it.each([])` passes on an empty section → accepted (F2, test writer); NOTEs 3, 4 → Design notes; NOTE 5 out-of-plan capture.json → Out-of-plan changes
- gate 3 B (conformance): out-of-plan capture.json → accepted, Out-of-plan changes; TS amount bound `Number.isSafeInteger` vs Go `maxStoredAmount` → accepted (F3); deferrals none
- fixes (staging cp1-fix.md): F1, F2, F3 — fresh test writer: F1 vector row `{-1, 1, 0}` red for the right reason (`expected -0 to be +0`), F2 section-has-rows test (probe with empty sections failed as it should); fresh implementer DONE (`lib/sales-tax.ts` only); gate 1 again: tests unedited · books check 3380 passed · go test -count=1 ok
- fix review: round 1: reviewer A pass over the fix diff: clean (no BLOCK) · 1 NOTE (a renamed vector section fails at collection with a TypeError, not a named assertion; acceptable)
- gate 3 A notes: 2 (Design notes)
- reviewer-caught deferrals: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
