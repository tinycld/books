# vendor-1099 — helix run ledger

- mode: unattended
- unit: p3-vendor-1099
- started: 2026-10-30
- package branch: books/p3-vendor-1099   core checkout: books/p3-vendor-1099 (from core main 1bda334)
- spec: docs/specs/vendor-1099-design.md
- checkpoints: docs/plans/vendor-1099-checkpoints.md
- reference: docs/plans/vendor-1099-reference/
- evidence: docs/plans/vendor-1099-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/vendor-1099-capture.json
- review mode: C — none (unattended)
- core extension: audit `CollectionConfig.Redact` — tinycld PR (pending, branch books/p3-vendor-1099); checkpoint 0, merges before checkpoint 1; no `exclusive` (small core change)
- sparks:
  - Each account's 1099 box is readable at a glance in one list → expressible (`SectionCard`, rows `border-b border-border`, core `SelectInput` per row, inactive `opacity-60`)
  - A missing tax ID stands out without opening the vendor → expressible (chip `rounded-full bg-warning-soft px-2 py-0.5`, `text-xs text-warning-soft-foreground`)
  - Keep tax IDs out of the audit log values → needs extension (accepted)

## Deferrals
(none yet)

## Rebuttals
(none yet)

## Design notes
- cp 0 · reviewer A NOTE: `RegisterCollection` wiring (`config.Redact` into the update/delete hooks, audit.go) has no core test; `RegisterCollection` takes `*pocketbase.PocketBase`, which `NewTestApp` is not. Checkpoint 3's Books tests (`TestAudit_RedactsAVendorTaxIDChange`, `TestAudit_RedactsADeletedVendorsTaxID`) cover it end to end.
- cp 0 · reviewer A + B NOTE: a `Redact` name that matches no field (typo, later rename) silently logs the value; no warning. Optional: warn at serve time when a `Redact` name is not a field.
- cp 0 · reviewer A NOTE: the hidden-field diff shape changed from `{"redacted": true}` to the full marker map for every core collection; the only reader (`app/a/(app)/settings/audit-log.tsx:470-471`) keys on `redacted`. Harmless.
- cp 0 · reviewer B (out of scope, for the human): `core/docs/audit-log.md` lines 20-50 and 86 (old content) name feature packages and their collections (contacts, calendar_*, drive_*, mail_*, `packages/contacts/server/register.go`) inside core; check:core-isolation does not scan core/docs.
- cp 1 · reviewer A NOTE: `tests/migration-field.ts` `migrationField` does not skip `//` comments; an apostrophe in a comment inside a field object breaks the parse (fails loudly, never passes silently).
- cp 1 · reviewer A + B NOTE: comments in lib/form-1099.ts and migrations 2100000001/2/4 name `server/form1099.go`, its Go drift test, the box/type guard, the vendors.go trim/dash, and Settings → 1099s, which arrive in cp2 and cp5; the cp2 and cp5 reviewers must confirm the names match.
- cp 1 · reviewer A NOTE: between cp1 and cp3, `tax_id` writes (the seed's superuser updates, a raw PATCH) are audit-logged unredacted; no UI path writes it before cp4; branch-internal only.
- cp 1 · reviewer A NOTE: the `...EMPTY_VENDOR_COLUMNS` spread in useVendorForm.ts is type-only (runtime already gets the keys); cp4 removes it as planned.
- cp 1 · reviewer A NOTE (for cp4): `EMPTY_1099_COLUMNS` uses `satisfies`, so its type keeps literals (`tax_id_type: ''`, `track_1099: false`) and the `EMPTY_VENDOR_COLUMNS` intersection carries them; if cp4 types a value from it, declare an explicit `Pick<…>` annotation.
- cp 1 · reviewer B NIT: server/company_settings_test.go:225 uses the literal "bookssettings01" where the same test uses `settingsID`; the plan wrote the literal.
- cp 2 · reviewer A NOTE: validateAccount's box check runs before checkAccountChange, so a direct API type change of a mapped account that also has lines gets the box refusal first, and after clearing the box the lines refusal; the Account panel locks the type select when lines > 0 or children > 0 (useAccountForm.ts `typeLocked`), so no UI path reaches it.
- cp 2 · reviewer A NOTE: normalizeTaxID removes only ASCII space and hyphen-minus (as the plan says); a tax ID pasted with an en dash or a no-break space is refused "A tax ID has 9 digits.". Possible fix: strip unicode.IsSpace runes and Pd dashes.
- cp 2 · reviewer A NOTE: an unknown tax_id_type (API only) gives two errors (type schema refusal and tax_id pattern), since dashTaxID returns bare digits.
- cp 7 · settings-*-390: the long Willamette name and legal name truncate with an ellipsis (as the reference).
- cp 7 · gate 2 observation: Accounts dims an inactive row (opacity-60); the vendors card marks it with "· Inactive" only (spec and reference agree).
- cp 7 · reviewer A NOTEs: help-1099-tracking.test.ts checks "9 digits" and "dashes" in two sentences; tracked-vendors.ts compares the trimmed legal name with an untrimmed display name; the FAB locator has no `:visible` scope.
- cp 7 · fix review NOTE: ThresholdCard's note ("left out of the 1099 report") states the future report's rule and does not say the report is not available yet (spec copy).
- cp 7 · core gap (for the human): core FAB (core/components/FAB.tsx) has no `accessibilityRole="button"`; specs find it by label.
- cp 6 · settings-refusal: the held row's select looks idle (core SelectInput has no disabled look; e2e asserts disabled).
- cp 6 · dark shots: the 6900 "Inactive" caption is low contrast (same as the reference).
- cp 6 · reviewer A NOTEs: RHF `values` reset relies on two renders (theoretical); "Not reported" sends no write — now asserted.
- cp 6 · fix review NOTE (for the human, core gap): the account-box store is not reset on sign-out (core logout has no hook for package stores); a second user on the same browser in the same org could see the first user's refusal while the box is unchanged.
- cp 6 · fix review NOTE: a write that never settles keeps the select disabled until reload (the store outlives a remount).
- cp 6 · fix review round 2 NOTE: a stale refusal can reappear if the live box returns to its `fromBox` (refusals drop only on the next write for that account); display only.
- cp 5 · reviewer A NOTE: vendor-1099-settings.spec.ts's "vendors query in; loading still visible" step cannot catch a section that ignores the accounts query (a few ms window; `waitForResponse` matches any vendors request). cp7 (vendors card) can assert section count 0 after a tracked vendor row is in the DOM while accounts are held.
- cp 5 · fix review NOTE: the shell shows its error when settings are ready but no row exists; every recovery is then empty, so Retry does nothing (before the fix it rebuilt the settings query). The row comes from a migration and cannot be deleted.
- cp 5 · gate 2 observation: FAB clearance on the phone scroller cannot be seen with one card; check at cp7.
- cp 4 · vendor-tracking-off-1280-dark / -390-dark: Track payments for 1099 row — the off toggle track is low-contrast on the dark background (core Toggle, same in the reference).
- cp 4 · reviewer A NOTE: under a server refusal, Tax ID shows both its hint and the refusal (ContactInput hides the hint only for a local error; same as the account-number field).
- cp 4 · fix review NOTE: a mixed refusal (hidden + visible keys) is untested and cannot happen with today's server (one field per refusal); if a shown key is unknown the toast body repeats the hidden messages; if a shown key is the host's formColumn the host's root message replaces the hidden one.
- cp 4 · reviewer B NOTE: the e2e uses `insertAnswered`/`patchAnswered` (read-only response waits) not listed in Consumes.
- cp 3 · reviewer A NOTE: search_test.go:273's term `987654321` can never match (stored dashed); the dashed terms do the work (mutation-probed).
- cp 3 · reviewer A NOTE: a `tax_id_type` change is logged in clear text; the spec redacts only the value.
- cp 3 · reviewer B NOTE: help/vendors.md:14 does not yet name legal-name search; cp7's Files block owns it — cp7 gate 3 must confirm it lands.
- cp 3 · reviewer B NOTE: the tests pin the literal `"[redacted]"` instead of consuming `audit.RedactedValue`.
- cp 0 wiring: proven end to end by cp3's Books audit tests (reviewer A mutation probe: removing the Redact entries fails all three).
- cp 1 → cp 2 · reviewers A + B confirmed: the cp1 comments (lib/form-1099.ts, migrations 2100000002/2100000004) match the Go names built in cp2; the 2100000001 "Settings → 1099s" comment waits for cp5.

## Out-of-plan changes
- cp 6: `docs/plans/vendor-1099-checkpoints.md` amendments (box1099ValueSchema → lib/box-1099-schema.ts; cp7 tracked-vendor helpers → lib/tracked-vendors.ts; gate 3 fix files) — lib/form-1099.ts stays import-free; `tests/box-1099-schema.test.ts` kept as its own file (a missing module fails the whole importing file); `tinycld/books/lib/refusal.ts`, `hooks/useRecordActions.ts` (`refusalOf` reuses `writeRefusalText`), `tests/e2e/record-form-helpers.ts` (`holdWrite`), `tests/e2e/account-register-helpers.ts` (`makeAccountInactive`), `stores/account-box-store.ts`, `lib/form-1099-accounts.ts`, tests/form-1099-accounts.test.ts, tests/account-box-store.test.ts — gate 3 fixes.
- cp 5: `hooks/useDocSequences.ts` (exposes `recovery`) and `tinycld/books/lib/vendor-1099-fixture.ts` (touched by the first build, restored by the fix) — gate 3 fixes; plan amendment: `Form1099Section` takes no props (reads access through useForm1099Section).
- cp 4: `docs/specs/vendor-1099-design.md`, `docs/plans/vendor-1099-checkpoints.md` — the layout rule key renamed `hide-1099-details` → `hide_1099_details` after a test dispute (core keySchema `/^[a-z][a-z0-9_]{0,39}$/`, core/lib/forms/key.ts:5, refuses dashes).
- cp 4 (gate 3 fix): `tinycld/books/lib/record-refusals.ts` (`recordRefusalHandler` optional `hiddenFields`, `hiddenRefusalKeys`), `lib/record-save.ts` (`saveRefusalHandler` optional 5th param), `hooks/useRecordSave.ts` (forms arg takes host and context), `hooks/useCustomerForm.ts` (passes host/context), `tests/record-refusals.test.ts` — a server refusal on a field the form does not draw goes to the root summary (customers and vendors).
- cp 2: `docs/plans/vendor-1099-checkpoints.md` — driver fix of the UNTESTABLE `TestAccount1099_BoxesPerAccount` bullet: PocketBase `SelectField.PrepareValue` keeps the last value of a single select, so a two-box write cannot be refused; the bullet now asserts a write of `["nec_1","misc_1"]` stores exactly `"misc_1"` (one account, at most one box). plan-check re-run: exit 0.
- cp 2: `tinycld/books/lib/tax-id.ts` — comment only: `TAX_ID_TYPE_KEYS` must equal Go `taxIDTypes` (checked by server/form1099_test.go).
- cp 1: `tests/migration-field.ts` (test helper) — shared migration-field parser for the drift tests in form-1099.test.ts and tax-id.test.ts; added by the cp1 test writer; weakens no test.
- cp 0: `core/docs/audit-log.md` (core) — Redacted fields section and the `CollectionConfig` API list updated for `Redact` and the new marker map (reviewer B finding 2; the doc of the API this checkpoint changes).

## Phase notes
- design gate (2026-10-30, books 91ce648, core 1bda334): direction A (Settings → 1099s, one row per expense account with a box select that saves on choose). Packet open questions Q1-Q15 accepted as recommended. Q16 overlap: p2-products-services (lane default) owns `HostSelect` and moves it to `forms/account-fields.tsx`; the human chose to build now — import it from where it lives on main at build time, else only add `export` in `forms/vendor-fields.tsx`; the unit that merges second fixes the import. Needs-extension audit `Redact` accepted (core checkpoint 0). No [platform] items. Packet: ~/tmp/tinycld/auto-helix-books/staging/p3-vendor-1099/packet.md; artboards: same folder, artboards.html.
- phase 3 (2026-10-30, unattended, no human corrections): direction A. Sparks dropped: none. Spark "missing tax ID stands out" kept with other classes: global.css defines no `warning-soft` token, so the spec's `bg-warning-soft` / `text-warning-soft-foreground` chip drew no fill (dark text on dark); the chip is now `rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5` with `text-xs font-medium text-foreground` (core PendingBadge's fill, foreground text). Fixture: tinycld/books/lib/vendor-1099-fixture.ts (local `*1099Columns` interfaces until the migrations checkpoint replaces them with the generated types; 5 tracked vendors: Willamette EIN, Okafor SSN, Keystone Legal attorney, Greenline missing tax ID, Old Town Print inactive; boxes 6100 misc_1, 6200 none, 6210 nec_1, 6900 inactive misc_8; threshold 200000). Reference: docs/plans/vendor-1099-reference/ (capture manifest docs/plans/vendor-1099-capture.json), 390 and 1280, light and dark: settings-admin, settings-writer, settings-read-only, settings-refusal (6100 write pending, 6210 refused), settings-empty-accounts, settings-empty-vendors, settings-loading, settings-error, settings-list (390 only: the 1099s row and its summary), vendor-tracking-on (Keystone, EIN), vendor-tracking-off (Office Supply World). Unsure: (1) the section's place in the list: the route puts 1099s before Access, as artboard A does; the spec says only "a fifth entry". (2) Core SelectInput draws no disabled look, so the pending row in settings-refusal looks like the others. (3) The phone Settings scroller gets FAB clearance in the route (`useFabClearanceStyle`); the real SettingsShell has none, so the last vendor row can sit under the New FAB — the plan should add it in SettingsShell. (4) The vendor form route leaves out the contact and address fields and shows the New FAB at 390 (the real vendor page hides it). (5) Phone account rows indent the select with the label; wide rows indent the label only. (6) The threshold input is capped at 360 px wide.
- phase 4 (2026-10-30, unattended): plan docs/plans/vendor-1099-checkpoints.md, 8 checkpoints (0 core audit Redact; 1 columns/fixture/seed; 2 tax ID and box guards; 3 legal-name search + tax ID redaction; 4 vendor form fields; 5 Settings 1099s + threshold; 6 account box mapping; 7 1099 vendors card + help). E2E budget 12 of 12. Plan review (~/tmp/tinycld/auto-helix-books/staging/p3-vendor-1099/cp/plan-review.md): A1-A9, B1-B6, C1-C3, D1-D6, E1-E3, F1-F2 fixed (F3/F4 nothing). Driver rulings: F1 cp1 adds the 1099 keys only to EMPTY_VENDOR_COLUMNS (plus a `...EMPTY_VENDOR_COLUMNS` spread in useVendorForm insert that cp4 removes); A7 spec bullet now says the audit-log screen shows `[redacted]` (core screen already does; unchanged); threshold schema keeps text and `thresholdCents` converts (spec "Where it lives" updated); stale opening-balances scratch `tests/e2e/helix-states.spec.ts` moved out to staging (it broke tsc and matched -g helix). plan-check --unattended exit 0. review mode: C.
- checkpoint 0 (2026-10-30, core branch books/p3-vendor-1099): audit `CollectionConfig.Redact` added with no core version bump and no `peerVersions` change (Books is unreleased; the field is optional). Before the first Books release, bump core and pin Books' `peerVersions` to the core version that has `Redact` (Decisions, "Core version").

## Checkpoint 0
- test writer: core/server/audit/redact_test.go (fictional `gadgets` collection); red for the right reason: yes (build failure naming only cp0's names: RedactedValue, variadic ComputeDiff/BuildSnapshot, logUpdate's []string); untestable: none. One extra check beyond the bullets: a hidden field gets the full marker map with no Redact list (the Produces line says so).
- implementer: CollectionConfig.Redact, RedactedValue, isRedacted(field, redact), variadic ComputeDiff/BuildSnapshot, RegisterCollection passes redact to both hooks, logUpdate redact param, package comment; DONE
- test disputes: none
- self-declared differences: doc comments of ComputeDiff/BuildSnapshot/isRedacted updated to match; package comment names three redaction sources; ledger Phase-notes line (Do step 6)
- gate 1: tests unedited: yes · pass (go test ./audit/..., go vet, gofmt, core tinycld-pkg check 3042 passed, check:core-isolation 0 refs, books/server go build)
- gate 2: n/a (logic)
- gate 3 A (correctness): no BLOCK; 4 NOTEs → Design notes, except NOTE 3 (label not redacted) fixed as a one-line doc comment on Redact
- gate 3 B (conformance): 1 audit.go package comment named the contacts package → accepted+fixed (neutral pointer to docs/audit-log.md); 2 core/docs/audit-log.md stale for Redact → accepted+fixed (Out-of-plan changes); 3 old package names in core/docs/audit-log.md → out of scope, Design notes for the human; 4 note → Design notes
- fix review: round 1: clean (no BLOCK) · NOTE 2 (pointer path did not resolve) and the doc's contacts register.go example (NOTE 1, one line in a touched file) fixed as text; the per-package tables stay in Design notes
- reviewer-caught deferrals: none
- commit: core 8a1c40cc (books/p3-vendor-1099); core origin/main bd001d13 merged after, check green; PR tinycld/tinycld#408
- human: approved the #408 merge (2026-10-30). CI first red on npm audit (joi GHSA-4528-x5fx-h6hg, high, new advisory): fixed at the source, core/package-versions.json joi floor 17.13.7 → 17.13.9 (5d334a33); all checks green; merged as core 4ed6a7af.

## Checkpoint 1
- test writer: tests/form-1099.test.ts, tax-id.test.ts, vendor-1099-fixture.test.ts, migration-field.ts (helper), vendor-host.test.ts, vendor-columns.test.ts, server/company_settings_test.go, plus the tsc fixes in 6 test files; red for the right reason: yes (missing modules, missing generated fields, 18 vs 22 columns, seeded threshold 0); untestable: none
- implementer: 3 migrations edited in place, lib/form-1099.ts, lib/tax-id.ts, host columns, EMPTY_1099_COLUMNS, useVendorForm insert spread, vendor() defaults, fixture on generated types, seed1099, 4 account inserts + fixture literals; DONE
- test disputes: none
- self-declared differences: useAccountForm insert multi-line; `isExpenseGroupType` via `.some`; TAX_ID_TYPE_OPTIONS built from TAX_ID_TYPES; seed1099 skips '' boxes; migration 2100000004 header names the cp2 guard (as Do step 1 asks); 2100000002 gets a header paragraph and the field comment; biome formatting
- gate 1: tests unedited: yes · pass (tinycld-pkg check 148 files / 3009 tests; go test ./...; implementer's seed boot: vendor-form-list.spec.ts 2 passed, seed log shows 3 account boxes and 5 vendor 1099 updates)
- gate 2: n/a (logic)
- gate 3 A (correctness): no BLOCK; 6 NOTEs → Design notes (one is the out-of-plan helper, recorded)
- gate 3 B (conformance): 1 tests/migration-field.ts out of plan → accepted (Out-of-plan changes); 2 forward-looking comments → Design notes; 3 nit → Design notes
- fix review: n/a (no fix touched source)
- reviewer-caught deferrals: none
- commit: e67f65c

## Checkpoint 2
- test writer: server/vendors_test.go (9 tests + 2 message texts), server/accounts_test.go (6 tests), server/form1099_test.go (3 tests, `listIn`), tests/vendor-messages.test.ts and tests/account-messages.test.ts (2 cases each); red for the right reason: yes (build failure on the cp2 names; behavior reds proven with temporary wrong-value stubs, deleted); untestable: 1 — "`["nec_1","misc_1"]` is refused by the schema" (PocketBase keeps the last single-select value) → plan bullet fixed (Out-of-plan changes), the test writer added the corrected assertion (green: guards existing schema behavior)
- implementer: server/form1099.go (boxes1099, expenseGroupTypes, taxIDTypes, isExpenseGroupType); vendors.go validate1099Fields/normalizeTaxID/dashTaxID + messages; accounts.go box/type check in validateAccount; client message copies; comment pointers; DONE
- test disputes: none
- self-declared differences: comment-only edits in lib/form-1099.ts and lib/tax-id.ts
- gate 1: tests unedited: yes · pass (tinycld-pkg check 3013 tests; go test -count=1 ./... ok; go vet clean; implementer's seed boot vendor-form-list.spec.ts 2 passed with the seeded tax IDs stored dashed)
- gate 2: n/a (logic)
- gate 3 A (correctness): no BLOCK; NOTEs → Design notes; out-of-plan pair judged harmless
- gate 3 B (conformance): 1 plan file out of plan → accepted (Out-of-plan changes); 2 tax-id.ts comment → accepted (Out-of-plan changes); serialized memory rule satisfied
- fix review: n/a (no fix touched source)
- reviewer-caught deferrals: none
- commit: 336e9db

## Checkpoint 3
- test writer: server/search_test.go (TestSearch_FindsVendorsByLegalName), server/registrations_test.go (three TestAudit_Redacts… tests + helpers); red for the right reason: yes (legal_name not matched; tax_id stored and snapshotted in clear); untestable: none. It proved the tests can go green with a temporary source edit, then reverted (retro log).
- implementer: partySource.matchColumns (vendors add c.legal_name), searchParties uses it; Redact tax_id on books_vendors and books_settings with a why-comment; DONE
- test disputes: none
- self-declared differences: one more comment sentence (labels read no redacted field)
- gate 1: tests unedited: yes · pass (go test -count=1 ./... ok; go vet clean; tinycld-pkg check green)
- gate 2: n/a (logic)
- gate 3 A (correctness): no BLOCK; mutation probes confirm every test; 2 NOTEs → Design notes
- gate 3 B (conformance): nothing found; 2 notes → Design notes
- fix review: n/a
- reviewer-caught deferrals: none
- commit: 55c5df2

## Checkpoint 4
- test writer: tests/vendor-host.test.ts, tests/vendor-columns.test.ts (changed); tests/e2e/vendor-1099-helpers.ts, tests/e2e/vendor-1099-form.spec.ts (2 desktop tests); red for the right reason: yes (14 vitest, tsc TS2339, e2e switch not found); untestable: none
- implementer: four built-ins before notes, half widths, layout rule, vendor-1099-fields.tsx (LegalNameField, TaxIdTypeField, TaxIdField, hints), ui.ts, ContactInput `autoCapitalize`, `export` on HostSelect only (books main has no forms/account-fields.tsx), schema + EMPTY_VENDOR_FIELDS, insert spread removed; DONE after one dispute
- test disputes: vendor-host.test.ts:141 asserted rule key `hide-1099-details`; core keySchema refuses dashes (core/lib/forms/key.ts:5) → test wrong; spec/plan renamed to `hide_1099_details`; a fresh test writer changed the assertion and title
- self-declared differences: rule key; EMPTY_1099_COLUMNS declared before EMPTY_VENDOR_FIELDS (TDZ); schema key order + one comment; ContactInput doc line; JSX wrap
- gate 1: tests unedited: yes (after the dispute fix) · pass (check 3023; e2e vendor-1099: 2 passed; implementer's guard vendor-form: 12 passed)
- gate 2: invalid shots: none · blocking: none · notes: 1 (dark off-toggle contrast, core Toggle) → Design notes. Evidence docs/plans/vendor-1099-evidence/cp4/ (capture.json, 8 shots, critique.md)
- gate 3 A (correctness): BLOCK 1 — a server refusal on a rule-hidden 1099 field showed nowhere (tracking on → bad Tax ID → tracking off → Save; setError on an unmounted field, root-only summary, no toast) → accepted+fixed (driver ruling: route it to the root summary; server unchanged); NOTE 2 (stale digits error) → added as a test assertion with the fix tests; NOTE 3 → Design notes; NOTE 4 (vendor-form guard) → run at gate 1 rerun
- gate 3 B (conformance): 1 same hidden-field refusal → same fix; 2 out-of-plan rename/evidence → recorded; 3 Consumes list → Design notes; deferral "vendor-form guard not run" → run (14 passed)
- fix: tests first by a fresh test writer (record-refusals.test.ts two cases; e2e test 2 hidden-field steps + stale-error check; red: setError('root') not called, summary not found), then a fresh implementer (record-refusals.ts, record-save.ts, useRecordSave.ts, useVendorForm.ts, useCustomerForm.ts); declared extras: hidden = evaluate visible false, mixed refusal split, joined messages, hidden set read on refusal, stale hidden error unchanged
- gate 1 rerun: check 3025 passed; e2e `vendor-1099:|vendor-form:` 14 passed; implementer's guard customer-form: 24 passed
- fix review: round 1: no BLOCK; the five extras accepted; mixed-refusal NOTE → Design notes
- reviewer-caught deferrals: none
- commit: e871750

## Checkpoint 5
- test writer: tests/threshold-schema.test.ts (new), form-1099.test.ts, settings-sections.test.ts, e2e books-settings.spec.ts (`vendor-1099: Settings → 1099s` threshold test, desktop + one phone step), vendor-1099-settings.spec.ts (section load), vendor-1099-helpers.ts; red for the right reason: yes (13 vitest; e2e no 1099s rail entry); untestable: none
- implementer: threshold-schema.ts, useThresholdForm, ThresholdCard, useForm1099Section, Form1099Section, settings section + summary, SectionBody, SettingsShell FAB clearance; DONE
- test disputes: none
- self-declared differences: Form1099Section takes no props; NO_RECOVERY const; summaryFor data object; thresholdCents throws on negative; ThresholdBody; out-of-plan fixture filter (seed import chain)
- gate 1: tests unedited: yes · pass (check 3056; e2e `vendor-1099:|books-settings:` 18 passed)
- gate 2: first capture missed settings-writer/read-only (capture failure, not critiqued around): re-captured with a capture-only `books_access` fake (`$authId` in the scratch capture spec); critic 1 on admin/loading/error/list and critic 2 on writer/read-only: no BLOCKING, no NOTEs. Evidence docs/plans/vendor-1099-evidence/cp5/
- gate 3 A (correctness): no BLOCK; NOTE 1 (weak loading step) → Design notes; NOTE 2 = B2; NOTE 3 = B1
- gate 3 B (conformance): 1 form-1099.ts gained a runtime import reached by the seed (the cause of the fixture workaround) → accepted+fixed at the source (form1099Summary moved to settings-sections.ts; form-1099.ts import-free, asserted by a test; fixture restored); 2 shell Retry missed the new accounts query (memory: one merged call) → accepted+fixed (one recoverLiveQueries over three recoveries; useDocSequences exposes recovery); 3 faked load without the realtime abort (decisions rule) → accepted+fixed in the test; 4 no-props Form1099Section → plan amendment recorded
- fix: tests first (summary cases moved to settings-sections.test.ts; no-runtime-import assertion; realtime abort), then implementer; gate 1 rerun: check 3057; e2e 18 passed
- fix review: round 1: no BLOCK; NOTE (dead Retry when the settings row is missing) → Design notes
- reviewer-caught deferrals: none
- commit: 214db36

## Checkpoint 6
- test writer: tests/form-1099.test.ts cases, tests/box-1099-schema.test.ts, tests/refusal.test.ts, tests/e2e/vendor-1099-boxes.spec.ts (`vendor-1099: account boxes`: test 1 desktop + phone, tests 2-3 desktop), account-register-helpers `createAccount`, vendor-1099-helpers; red for the right reason: yes; untestable: none. It caught a plan conflict: box1099ValueSchema (zod) in import-free form-1099.ts → driver amendment (lib/box-1099-schema.ts); the same conflict in cp7 amended ahead (lib/tracked-vendors.ts).
- implementer: form1099Accounts, useAccountBoxMutation (save on choose), AccountBoxesCard, AccountBoxRow, CardEmptyState, refusal helpers, capture writes option; DONE
- test disputes: none
- gate 1: pass (check 3070; e2e with guards 37 passed)
- gate 2: no BLOCKING; 2 NOTEs → Design notes. Evidence docs/plans/vendor-1099-evidence/cp6/ (20 shots, critique.md)
- gate 3 A: BLOCK 1 — clearing the box on an inactive account: the optimistic update drops the row, its mutation unmounts, a refusal shows nowhere → accepted+fixed (Zustand store set before the mutation keeps a pending row listed); NOTE 2 (5xx not logged) → fixed; NOTE 6 (no-write check) → asserted; others → Design notes
- gate 3 B: 1 form1099Accounts copied buildAccountTree → accepted+fixed (lib/form-1099-accounts.ts on buildAccountTree); 2 refusalOf duplicated writeRefusalText → fixed; 3 holdAccountWrite copied holdRecordWrite → fixed (`holdWrite`); 4 new schema test file → kept, recorded
- fix: tests first (moved cases, e2e inactive-clear step red at the vanished row, PATCH count, helper), implementer; gate 1 rerun: check 3070; e2e 73 passed
- fix review: round 1: BLOCK — refused ids kept rows listed, so a stale refusal showed on an account later made inactive or changed elsewhere → fixed in round 2 (only pending ids hold a row; refusals stored with `fromBox`, shown only while the live box equals it; `visibleRefusal` + `heldAccountIds` unit-tested); round 2: PASS, NOTE (stale refusal can reappear) → Design notes. Gate 1 after round 2: check 3076; e2e 22 passed. Round count: 2.
- reviewer-caught deferrals: none
- commit: 9205d1e

## Checkpoint 7
- test writer: tests/tracked-vendors.test.ts (amendment), help-1099-tracking.test.ts, help-vendors/help-settings cases, e2e vendor-1099-vendors.spec.ts (test 1 desktop + phone, test 2), books-settings read-only test, `trackedVendorsSnapshot`; red for the right reason: yes; untestable: none
- implementer: lib/tracked-vendors.ts, Tracked1099VendorsCard, openVendor/openVendors, help/1099-tracking.md, help/vendors.md (legal-name search, never by tax ID), help/settings.md; DONE after one dispute
- test disputes: the phone FAB locator `getByRole('button', { name: 'New' })` — core FAB has no button role (vendor-form-list.spec.ts:346) → test wrong; a fresh test writer changed it to `getByLabel('New', { exact: true })`
- gate 1: pass (check 3103; e2e `vendor-1099:|books-settings:|vendor-form:` 38 passed; new tests 3.2-6.3 s)
- gate 2: no BLOCKING; NOTEs → Design notes. Evidence docs/plans/vendor-1099-evidence/cp7/ (16 shots, critique.md)
- gate 3 A: no BLOCK; NOTE (help omits ITIN) → fixed as text; others → Design notes
- gate 3 B: 1 help named a 1099 report that does not exist yet → fixed (1099-tracking.md, settings.md); 2 help did not say hidden values are still checked on Save → fixed; 3 ITIN → fixed; 4 inactive accounts show only with a box → fixed; 5 vendors.md frontmatter → not required, left
- fix review: round 1: PASS (help-only diff; help tests 21 passed); NOTE → Design notes
- earlier items confirmed: help/vendors.md names legal-name search (cp3); FAB clearance on the phone scroller with three cards, driven by the phone e2e (cp5)
- reviewer-caught deferrals: none

## Final review
- eval:
