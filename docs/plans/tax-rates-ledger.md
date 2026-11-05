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
(none yet — every reviewer finding rejected in triage is listed here verbatim,
with the reason, and shown to the human at the end)

## Design notes
(none yet — gate-2 NOTEs the loop did not act on, as
`cp N · <shot>: <where> — <what>`; shown to the human at each checkpoint
and again at the end)

## Out-of-plan changes
(none yet — every file touched that no checkpoint's Files block named, with why)

## Phase notes
- phase 1: unattended; intake at ~/tmp/tinycld/auto-helix-books/staging/p2-tax-rates/intake.md; feature inventory outcomes in the design packet (staging/p2-tax-rates/packet.md).
- phase 3 (design gate, 2026-11-04): the human picked direction A (Taxes page by agency; edits in core Dialog, a bottom sheet on phones) and accepted the recommended answer to every open question 1–16: liability account on the agency (glossary reworded); one `books_tax_rates` collection with `type` rate | group; integer `rate_ppm`; per-rate rounding on the document total, half away from zero, TS helper + Go mirror + shared vectors; `is_default` flag set by writers; new Non-inventory taxable, Service not; four customer tax built-ins with two hide rules; delete/inactive refusals per spec; a used rate may change (invoice snapshots); one-tap "Create Sales tax payable account"; Books writers manage; sidebar "Taxes" after Accounting, page title "Sales tax"; cuts as listed; seed 2200 + tax fixture; audit + OAuth registration, not search; accept reconcileForms placement for stored forms. No [platform] items, no core extension.
- phase 3 pass 2 (2026-11-04, unattended): direction A built as the scratch route `tinycld/books/screens/helix-mockup.tsx` over `lib/tax-rates-fixture.ts` (local interfaces until checkpoint 2 swaps in the generated types); reference captured to `docs/plans/tax-rates-reference/` from `docs/plans/tax-rates-capture.json` (24 shots: populated, row-menu, row-menu-phone, read-only, show-inactive, empty, empty-read-only, one-rate, loading, error, refusal, add-agency(-phone), add-agency-no-account(-phone), add-rate(-phone), add-group(-phone), edit-group, delete-rate, customer-exempt, customer-not-exempt, product). Sparks: none dropped; all three expressed with core parts and tokens. Reference notes, not corrections: the Default badge (`bg-accent text-accent-foreground`) reads as green text with almost no pill in light mode on `bg-surface-secondary`; the route's default picker is a flat core `SelectInput` with "<rate> <percent> · <agency>" labels, because core `SelectInput` has no section headings (the build groups them under agency headings after checkpoint 0); the route's product Taxable hint is drawn by core `Toggle`'s `hint`, which a forms-engine toggle built-in cannot carry today (checkpoint 0); the customer/product states show the new fields only, drawn with core inputs, not the forms renderer.
- phase 4: review mode C (unattended). Human approved core checkpoint 0 and the group-components read (two live queries + pure `buildTaxesView`). Plan review (staging/p2-tax-rates/plan-review.md) findings fixed: A (18, bullets narrowed or untested) — each now has a failing test: assertions folded into existing e2e (loading, read-only default text and controls, offline, No rates yet, duplicate rate name, Remove default, agency menu refusal and delete, rate edit, picker headings, certificate limit, help link, Taxable across a type change in an existing products-services test) or pure-helper / tricky-hook unit tests (`emptyState`, `groupsHint`, `addGroupEnabled`, `tax-writes`, `rateAgencyOptions`, `groupLine` 4.125%+4.125%, `TAX_MENU_WRITES`, `pendingDefaultId` default rule, refused default, `summaryEnabled`); A3 per driver ruling: a group's rates by rate name; A8/A11 fixture gained an inactive group, an inactive agency rate and a 0.105% rate (reference re-captured, 24 shots); A15 certificate number as `ExemptionNumberField` with maxLength 100 (LegalNameField precedent). B (8 placeholders) — full texts, full built-ins, picker arguments, full command, repeated refusal/footer text, every component prop typed, undefined names defined, help summary/order 33. C (6 name mismatches) — one client message name set, ShowInactiveChip `minHeight` prop, `useTaxesScreen` return restated in checkpoint 7, "from checkpoint N" corrected, `validateTaxRateComponents` / `validateCustomerTax` in Produces, `taxesControls` takes `.available`. E2E stays 12. plan-check: 0 errors, 220 warnings. A15 driver ruling (missing capability → core): checkpoint 0 adds an optional `maxLength` on a host `text` built-in (TS host schema + Go defs, enforced through the existing custom-text `textSchema` and `checkKind` paths, core tests on a fictional host); the certificate number is back to a plain `text` built-in with `maxLength: 100`, `ExemptionNumberField` dropped, its 100-limit e2e assertion kept (now an inline error that stops the save); `LegalNameField` untouched. plan-check: 0 errors, 219 warnings.
- phase 4 worker notes (2026-11-04): plan `docs/plans/tax-rates-checkpoints.md`, 9 checkpoints (0 core select sections and host field descriptions — approved by the human after the plan, the design gate had said "core extension: none"; 1 tax math; 2 collections, guards, seed; 3 refusals; 4 page; 5 agency and rate dialogs; 6 group dialog; 7 row menus, default, refusals; 8 product and customer fields + help). Self-review: coverage — every Behavior bullet quoted verbatim (plan-check), no Cut item; names — one spelling per hook/type/helper across checkpoints; fixture — checkpoint 2 lists `lib/tax-rates-fixture.ts` under Modify with `satisfies` + seed wiring; placeholders — none; gate 2 regions — checkpoints 4–8 name reference shots and built URLs. Self-review fixes made: rate names in e2e take `uniqueName` (names are unique across all rates and groups); the record form stores are typed by the collection row (`useRecordActions` snapshots `collection.get`); the default picker's form gets a zod resolver; two checkpoint 2 Go tests reordered so they still pass after checkpoint 3's inactive refusals. Seed-count grep (2026-11-04): only `tests/expense-account-options.test.ts` lists every seeded account; checkpoint 2 re-runs the grep. Plan-check: `plan-check.mjs … tax-rates --unattended` → 0 errors, 188 warnings (produced-but-not-consumed names and consumed names not yet in source; expected for a plan). E2E budget 12/12 (`tax-rates:` describes in checkpoints 4–8).
- review mode switches: none

## Final review
- eval:
- human comments and what changed
- native: not executed in this run
