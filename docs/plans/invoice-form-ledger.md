# invoice-form — helix run ledger

- mode: unattended
- unit: p2-invoice
- started: 2026-11-08
- package branch: books/p2-invoice (from books main 66846ed)   core checkout: main b021c3af; checkpoint 0 on core branch books/p2-invoice
- spec: docs/specs/invoice-form-design.md
- checkpoints: docs/plans/invoice-form-checkpoints.md
- reference: docs/plans/invoice-form-reference/
- evidence: docs/plans/invoice-form-evidence/cp<N>/ (built screenshots, capture.json, critique.md)
- scratch files: tinycld/books/screens/helix-mockup.tsx, tests/e2e/helix-capture.spec.ts — excluded from git; finish.mjs deletes both
- capture manifest: docs/plans/invoice-form-capture.json
- review mode: C — none (unattended)
- core extension: E1 table row kinds, E2 table keyboard + one-stop row menu with `ShortcutButton` add actions (reshaped 2026-11-08), E3 locked optional built-ins (spec §7) — checkpoint 0, core PR on branch books/p2-invoice, merges before checkpoint 1; `exclusive`. Core merge: pre-approved by the human (2026-11-06, re-confirmed 2026-11-08) — merge when checks are green, unless the checkpoint 0 runner reports an out-of-plan file, a deferral, a rebuttal, or STOPPED.
- sparks:
  - the amount the customer owes is the largest figure → expressible ("Balance due" `text-2xl font-semibold text-foreground tabular-nums`, as `EntryHeader`)
  - who it is for and when it is due read as one block → expressible (`rounded-xl border border-border bg-surface-secondary p-4`, Books `SectionCard` surface)
  - totals line up under the amount column, total set apart → expressible (shared amount-column width constant, `tabular-nums text-right`, total row `border-t border-border font-semibold`)

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
- phase 1: intake regenerated 2026-11-08 against books 66846ed / core b021c3af (the 2026-11-06 intake was discarded so the unit could wait for p5-general-ledger). Feature inventory unchanged; three sparks, all expressible; needs extension E1–E3 re-checked (still missing in core), E2 reshaped around core `ShortcutButton` and `Menu` `shortcut` text.
- design gate 2026-11-08 (human):
  - direction: A — full-page document form (header band, full-width line grid with four line kinds, message and totals side by side, sticky action bar, PDF in a tab; phone: stacked band, line cards, sticky bar).
  - Q1–Q20: as accepted on 2026-11-06 (Q1 own collections posting to a journal entry; Q2 `invoice` sequence, no prefix, next 1001, at posting; Q3 bar Cancel / Save draft / Post / Post & new / More; Q4 line kinds Item, Description, Subtotal, Percent, reorder by menu and keys; Q5 required and locked built-ins; Q6 due date from terms; Q7 correction by `?replaces`; Q8 customer default terms; Q9 Bill to and email snapshot; Q10 bundles expand to item lines + subtotal; Q11 one header tax, computed; Q12 total ≥ 0, ≤ limit, ≤ 250 lines, Post needs an Item line; Q13 entry points; Q14 PDF view tab; Q15 read view actions; Q16 delete guards; Q17 access; Q18 seed; Q19 one unit, core checkpoint 0 + 5 Books checkpoints; Q20 p5-general-ledger party model).
  - Q21: every line of the invoice's journal entry (A/R, income, tax) sets `customer`.
  - Q22: no `customerReferences` list; the customer delete hook counts `books_invoices` (drafts included) first — "<Customer name> is on invoices. Make it inactive instead." — then `refusePartyOnLines`.
  - Q23: Post of a draft whose customer is inactive is refused before any write, under Customer: "<Customer name> is inactive. Choose an active customer."; a correction may keep the original's now-inactive customer.
  - Q24: `entry_type_labels.json` `"transfer"` key becomes `"docTypes": { "transfer": "Transfer", "invoice": "Invoice" }`; Go formula and `lib/register.ts` `DOC_TYPE_LABELS` read it; no old-shape reader.
  - Q25: p5-journal-report (lane purchases) owns the `entryTypeLabel` helper in `server/report_spec_helpers.go`; p2-invoice does not wait for it; whichever merges second adapts to the other's helper (spec §4.2).
  - platform: autofocus on Customer + type-to-open pickers, web only — signed off 2026-11-08; shortcuts on web + iOS hardware keyboard only — signed off 2026-11-06.
  - core checkpoint 0 (E1, E2 reshaped, E3): accepted, `exclusive`, core merge pre-approved.
- spec self-review (2026-11-08, after writing the answers): 6 fixed — Customer change now states Due date recomputes from the new Terms; an inactive customer default tax rate is not filled (falls to the default rate, else none); Terms None leaves Due date unchanged and Due on receipt is 0 days; the Post-only "at least one Item line" check is a zod `superRefine` on a post variant of the schema; §4.2 states the Q25 formula ownership for both merge orders; §7 states E1–E3 in full instead of pointing at the packet.
- phase 3 (2026-11-09, unattended, pass 2): direction A captured. Fixture `tinycld/books/lib/invoice-form-fixture.ts` (local `InvoiceRecord` / `InvoiceLineRecord` / `InvoiceTaxLineRecord` mirroring spec §4.1 — the migration checkpoint must replace them with the generated types via `satisfies`; also `CUSTOMER_TERMS_PATCHES`, a `Discount` service in `INVOICE_PRODUCTS` for percent lines, `INVOICE_TAX_LINES` snapshots; every amount and total checked against `taxOn` and half-away-from-zero rounding). Scratch route `tinycld/books/screens/helix-mockup.tsx` (states: new, filled, edit-address, exempt, no-tax, errors, errors-post, refusal, correction, pdf-unsaved, pdf-stale, posted, void, reader, void-dialog, no-access, cannot-edit, not-found, loading, error). Manifest `docs/plans/invoice-form-capture.json`; reference `docs/plans/invoice-form-reference/` (28 shots, 82 images, light + dark). Sparks: all three kept (Balance due `text-2xl` top right / under the title on a phone; one header band; totals under the Amount column with the Total row ruled). No spark dropped. No human corrections (unattended).
  - stand-ins (checkpoint 0 and later must replace, not copy): the line grid is hand-drawn in the route, not core `TableField` (E1 row kinds, E2 one-stop row menu, line keys); the description cell is a fixed 2-row textarea (spec: grows to 3 lines; core TextInput has no autosize); the PDF tab shows a framed placeholder where `PdfCanvasViewer` renders the server PDF; the back link is `EntryBackLink` ("Journal entries"); tabs use core `SetupTabs` (setup wizard component — the build may need a shared tab bar); read-view `VoidDialog` confirm still says "Void entry"; phone read-view actions wrap (no More menu).
  - core finding for checkpoint 0 (E2): core `formatKeys` (core/lib/shortcuts/keys.ts) draws ArrowUp, ArrowDown, Backspace and lowercase letters verbatim ("⌘⌥ArrowUp", "⌥t"), so the row menu `shortcut` text and the ⌘-held hints of the line keys read wrong. The reference shows ↑ ↓ ⌫ and capital letters through a local map in the route; checkpoint 0 must add these glyphs to core `formatCombo`.
  - widths: measured on `/a/books/helix-mockup` inside the Books layout, which is the shipping layout (`books/invoices/*` are Books routes). Wide/phone switch is the window breakpoint here; the spec's switch is the form width ≥ 640 px.
- phase 4 (2026-11-09, unattended): plan `docs/plans/invoice-form-checkpoints.md`, 7 checkpoints (core checkpoint 0 + 6 Books; the `**Sizing:**` line gives why 6, not the 5 of Q19: posting split from the data rules, line keys split from the form, each under ~2,000 lines). plan-check `--unattended`: 0 errors, 158 warnings (Produces not yet consumed by name / Consumes not yet in source), exit 0. E2E 12 tests (cp3 4, cp4 3, cp5 4, cp6 1).
  - core base: spec written on core b021c3af; core main is ee5ca9f4; checkpoint 0 branches from ee5ca9f4; E1–E3 and the key glyphs are still missing there.
  - Q25: books main 66846ed has no `entryTypeLabel`; checkpoint 2 changes `typeLabelCase` and re-checks books main first; if p5-journal-report has merged, it adapts to that helper.
  - plan decisions a later phase must know: a zero-total invoice is refused at Post (`validateLines` refuses zero lines; a zero-total draft saves); A/R = the active `accounts_receivable` account with the lowest `sort_key`, else `ensureReceivables` creates "Accounts receivable" 1100; a reader on new or a draft gets `no-access`; the empty trailing Item line is dropped before validation (`invoiceLinesForSave`); a form with no row gets core's `Lines is required`; new client texts `customerLoadFailed`, `bundleEmpty` (bundle with no active items), `bundleLoadFailed`, Go `Line %d: A %s line has no product or amount.`; core E1 gains `HostRowKind.columnAt` (Percent cell sits under Rate) and the header shows the first kind's columns; `useFormState` gains a last parameter `recordSchema`; E2 key labels `TABLE_ROW_KEY_LABELS` / `tableKindKeyLabel`; Post & new goes to `new?fresh=<nonce>` and the form is keyed on `formKey`; Bill to / Email Tab stops through `useInvoiceBandStore`; seed posts noTax, exempt, posted as 1001–1003, all with Denver combined.
- plan review (one general-purpose agent; report `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-invoice/plan-review.md`): 35 behavior gaps, 19 hedges, 10 name mismatches, 6 live-query gaps, 8 record-state gaps. Fixed: Terms sets Due date (`DocumentTermsField`); taxable defaults (`lineTaxableDefaults`, `percentTaxableDefault`); offline writes (`useWritesAvailable`); dialog submit key on Discard / DeleteDraft / Void dialogs; trailing empty line; Percent column (`columnAt`); Bill to / Email Tab stops; customer picker (new `CustomerField` + `useInvoiceCustomerOptions`, not the parent-only `CustomerPicker`); customer load in screen state; unit tests for `invoiceScreenState`, `invoiceRefusalTarget`, `balanceDueText`, routes, `postAndNewHref`, help topic, tax-line delete reference; core tests for insert above/below, duplicate and remove focus; e2e now press the bar, line, picker, read-view and tab keys, walk the Tab order, cover offline, Esc with a dialog open, not-found, Retry, PDF error retry, phone More rows; bundle lines read once (`useBundleLines` with `queryOnce`); read-view tax from the snapshot (`useInvoiceTaxLines`); `invoiceReadActions` loses `isReplaced`; seed numbers and memos; CP5 correction e2e opens the original from Journal Entries (replace navigation removes it from history); all hedges resolved; helper paths corrected. Not changed: the Q25 conditional (decided by a stated rule); read-view V and ⌘P not pressed by e2e (unit-tested key map / core `ShortcutButton`); description growth to 3 lines is a gate-2 check; register Name column is covered by the existing `customer` read and a Go test.
- review mode switches: none

## Final review
- eval: 
- human comments and what changed
- native: not executed in this run
