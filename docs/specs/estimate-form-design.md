# Estimate form — design

Unit p2-estimate · package books · feature `estimate-form`. Built against books main@d809243, core 865049eb. Approved at design gate 1 (2026-11-12): direction A; open questions Q1–Q21 of the packet accepted as recommended (Q3 confirmed after discussion: an "Estimates" card in the existing Settings → Numbering section, admin-only prefix and forward-only next number, like the other document types).

## 1. Goal
A writer creates an estimate for a customer, keeps it up to date while the customer decides (Pending, Accepted, Rejected, with an optional expiration date), and converts it into an invoice in one step; the estimate then closes and links to that invoice.

## 2. Where it lives
- Routes: `/a/books/estimates/new` (query `?customer=<id>`, `?copy=<id>`, `?fresh=`), `/a/books/estimates/[id]`. Screens `screens/estimates/new.tsx`, `screens/estimates/[id].tsx`, each a `DocumentScreen` of the new kind `ESTIMATE_DOCUMENT`.
- + New menu → Customers column → "Estimate", after "Invoice" (`lib/shell-nav.ts`, id `estimate`).
- Books search finds estimates (kind `estimate`, drafts do not exist; every estimate is listed).
- The invoice form gains `?estimate=<id>` (convert); a converted invoice names its estimate in its header band and read view.
- No list screen: the Estimates list belongs to p2-sales-lists. Until it lands, estimates are found by search and by the link on their invoice.

## 3. Behavior

### 3.1 Shared layer
- The estimate is the third kind of the sales document layer (`SalesDocumentKind` / `DocumentKind`, `components/documents/*`, Go `salesDocKind`). The layer gains a **lifecycle** per kind: `posting` (invoice, sales receipt: draft → posted → void, unchanged) and `quote` (estimate: pending / accepted / rejected → closed). Every file of the layer that reads `draft | posted | void` reads the kind's lifecycle instead; the invoice and the sales receipt behave exactly as before and their tests stay green. No estimate file copies a layer file.
- In the `quote` lifecycle the form opens for a writer on pending, accepted and rejected estimates; a closed estimate opens in the read view for everyone; a reader sees every estimate in the read view.

### 3.2 Keyboard (speed first, carried from p2-invoice)
- On new and edit the Customer field has focus (web); pickers open by typing (web); every action button is a `ShortcutButton`; one Tab stop per line; Enter / ⌥↵ adds a line, as on the invoice.
- Form keys, ⇧? group "Estimate": Save & close ⌘↵, Save & new ⌘⇧↵, Save ⌘S, Cancel Esc, Delete estimate ⌘⌫, Convert to invoice ⌥I, Download PDF ⌘P, tabs ⌥1 / ⌥2.
- Read view keys (closed estimate): Copy C, Open invoice I, Download PDF ⌘P.

### 3.3 Header band
- Row 1, as the invoice's: Customer (required, locked), Bill to, Email; then Estimate date (default today), Expiration date, Tax.
- Row 2 (the band's second row, `bandSplitAt: 'status'`): Status, Accepted by, Accepted date.
- Status is a select with Pending, Accepted, Rejected (custom built-in `EstimateStatusField`, locked, required). A new estimate is Pending. Closed is never offered; only the server sets it.
- Accepted by (text ≤ 200, optional) and Accepted date (day, required while shown, default today when the user picks Accepted) show only while Status is Accepted (Books `hideBuiltins`; core rules cannot test a custom built-in). Choosing Pending or Rejected hides them and the save clears them; the server clears them on any status other than accepted.
- Expiration date is optional and must not be before the estimate date: inline "Expiration date can't be before the estimate date." and the same server refusal. A new estimate starts with no expiration date.
- **Expired**: a Pending or Accepted estimate whose expiration date is before today shows a warning badge "Expired" beside its status badge in the title, and the hint "Expired on <date>" under Expiration date. Expired is a display, not a status: it changes nothing the estimate can do.
- Title: "New estimate" until the first save, then "Estimate <number>" with the status badge (and Expired badge) beside it. The big figure at the top right is "Total".
- Customer fills: as the invoice (Bill to, Email, Tax, line taxable defaults); no Terms (an estimate has none).

### 3.4 Lines and totals
- The invoice's line table unchanged (`DOCUMENT_LINES_BUILTIN`: item, description, subtotal and percent rows; add, insert, reorder, remove; product picker; cards on phones).
- Totals panel: Subtotal, Tax (one row naming the rate), Total. No Balance due.

### 3.5 Footer
- "Message to customer (printed)" and "Internal memo (not printed)" (`DOCUMENT_NOTE_LABELS`); hint "Shown on the estimate and its PDF." A new blank estimate starts with the Books setting "Default message to customer" (`defaultMessageFor`), as the invoice and the sales receipt do; the Settings card is renamed "Invoices, estimates and sales receipts" and its note "New invoices, estimates and sales receipts start with this message. You can change it on each one."

### 3.6 Saving
- Action bar (wide): Cancel · Delete estimate (saved, not closed) · Convert to invoice · Save · Save & close · Save & new; on a phone Save & new and Convert to invoice move into More, as Post & new does on the invoice.
- There is no draft. The first Save creates the estimate as Pending (or the status chosen), and the server gives it the next estimate number in the same write. Save keeps the form open on `/estimates/<id>` (replace, no new history entry); Save & close goes back; Save & new opens a blank form.
- A saved estimate stays editable (every field, every line) while it is pending, accepted or rejected.
- Delete estimate: a confirm dialog "Delete estimate 1001? This can't be undone."; allowed while no invoice names the estimate. Otherwise refused: "Estimate 1001 has invoice 1004. Set it to Rejected instead." Numbers are never reused, so a deleted estimate leaves a gap (estimates do not post).
- Refusals land as the invoice's do: field refusals inline, the rest in the form summary, line refusals as "Line <n>: …".

### 3.7 Convert to invoice
- Offered on a saved or new estimate whose status is Pending or Accepted (not Rejected, not Closed), to writers.
- Pressing it first saves the estimate when the form has changes (a refused save stays on the form and does not convert), then opens `/a/books/invoices/new?estimate=<id>`.
- The invoice form starts from the estimate: customer, Bill to, Email, Tax, every line (all row kinds, in order), message; invoice date today, Terms and Due date from the customer as on a new invoice; no memo, no custom field values. Its header band shows "From estimate 1001" as a link (a Tab stop after Customer, no shortcut, lesson 28) that opens the estimate. The customer cannot be changed on an invoice from an estimate (the Customer field is read-only there) and the server refuses a change: "An invoice from an estimate bills the estimate's customer."
- Nothing happens to the estimate until the invoice's first save (Save draft or Post). That write, in one transaction: refuses when the estimate is rejected or closed or already named by another invoice that is not void ("Estimate 1001 is already on invoice 1004."), sets the invoice's `estimate`, sets the estimate's status to Closed and its `invoice` to the new invoice. Cancel on the unsaved invoice changes nothing.
- Undoing a conversion: deleting the draft invoice, or voiding the posted invoice by Void, sets the estimate back to Accepted when it has an accepted date, else Pending, and clears its `invoice`. Editing a posted invoice (a correction) keeps the estimate closed: the correction carries `estimate`, and when it posts the estimate's `invoice` moves to the correction.

### 3.8 Read view (closed estimates, and every estimate for a reader)
- `DocumentReadView` with the estimate's details: estimate date, expiration date, status badge, Accepted by / Accepted date when set, and for a closed estimate the line "Converted to invoice 1004" with Open invoice.
- Actions: Copy (writers only), Open invoice (closed estimates only, every user), Download PDF (every user). No Edit, no Void, no journal entry (an estimate has none).
- Engine reach: the Accepted fields hide through Books `hideBuiltins` (lib/form-definition.ts) on the watched Status value, as p2-products-services hides fields by product kind; "Accepted date required while shown" and "Expiration not before the estimate date" are `.superRefine` rules of the kind's zod schema (lib/document-schema.ts), as Due date's is; the read-only Customer on a converted invoice is a new `isReadOnly` mode of the shared `CustomerField`.

### 3.9 PDF
- PDF view tab and Download PDF, kind `estimate` (`server/pdf_kinds.go`, the spec's PDF list names estimates): title "Estimate", number, estimate date, expiration date when set, Bill to, lines, Subtotal, Tax, Total, message. No status, no acceptance, no memo. File name `estimate-<number>`.

### 3.10 States
- Loading, load error with Retry for each failing read, not found, no access (reader on `/new`): the document layer's states.
- Offline: the bar's buttons disable while writes are unavailable (`useWritesAvailable`), as the invoice.

### 3.11 Elsewhere in Books
- Settings → Numbering gains an "Estimates" card (sequence `estimate`, row `booksseqestimat`, no prefix, next 1001).
- Customer delete refused while the customer is on an estimate: "<name> is on estimates. Make it inactive instead." Product delete and tax rate delete refused while on an estimate line / estimate (`productReferences`, `taxRateReferences`).
- Books search: kind `estimate`, title "Estimate 1001 · <customer>", matches number, message, memo and the customer's name.
- Audit log, OAuth scope collections and every other registry the sales receipt joined include the estimate collections.
- Estimates never post: no journal entry, no register line, no report reads them.

## 4. Data
- New migration `2100000012_create_books_estimates.js`:
  - `books_estimates`: customer (relation books_customers, required), status (select pending, accepted, rejected, closed; required), number (text ≤ 40), sequence (int), date (day, required), expiration_date (day, optional), accepted_by (text ≤ 200), accepted_date (day, optional), bill_to (json), email, tax_rate (relation), message, memo (text ≤ 4000), subtotal, tax_total, total (int cents), currency, invoice (relation books_invoices, optional), form, fields, sort_key (hidden), created, updated.
  - Rules: list/view READ; create WRITE with status ≠ closed and server fields unset; update WRITE, server fields unset, stored status ≠ closed and body status ≠ closed; delete WRITE and status ≠ closed. Server fields: number, sequence, subtotal, tax_total, total, currency, invoice, sort_key.
  - `books_estimate_lines`: the invoice line shape, parent field `estimate` (cascade); create/update/delete only while the estimate is not closed.
  - No tax lines collection: an estimate never posts, so there is no tax snapshot; the server keeps tax_total live as it does on a draft invoice.
  - `books_invoices.estimate` (relation books_estimates, optional, not cascade), added by this migration (2100000010 runs before estimates exist).
  - FTS table `fts_books_estimates` (record_id, number, memo, message).
- Migration 2100000001 edited in place (Books unreleased): `books_doc_sequences.doc_type` gains `estimate`; seed row `booksseqestimat` (next 1001, no prefix).
- Server (Go): an `estimateKind` of `salesDocKind` with the `quote` lifecycle: the shared draft guards (customer, tax rate, address, days, lines, totals, line cells, products) run on every create and update of a not-closed estimate; the create allocates the number (`allocateNumber(tx, "estimate")`) inside `serialized`; status transitions pending ↔ accepted ↔ rejected are free; closed is set and cleared only by the invoice guards (§3.7); acceptance fields are cleared off accepted. The invoice guard gains the estimate checks and writes of §3.7 inside its transaction; the invoice delete hook and void reopen the estimate.
- Forms host `books:estimate` (`forms/hosts.ts`): built-ins customer, bill_to, email, date ("Estimate date"), expiration_date, tax_rate, status, accepted_by, accepted_date, lines, message, memo; layout as §3.3.
- Reads: the estimate's data source `hooks/estimate-data.ts` (its `useStore` calls), as invoice-data/sales-receipt-data; the closed estimate's invoice number through `materialize()` of the invoice row.
- Seed (`seed.ts`, through the fixture `lib/estimate-form-fixture.ts`): a Pending estimate expiring after today, a Pending estimate already expired, an Accepted one with Accepted by, a Rejected one, and a Closed one converted to a draft invoice (no posted entry, so no ledger spec moves). Dates after mid-2026.

## 5. Cut
- Estimates list with filters and batch actions (shot 3) — p2-sales-lists.
- Public accept / decline link — p2-estimate-public-link.
- Email view, Save and send, Cc/Bcc — p2-email-share.
- Payor view — the public link unit owns what the customer sees.
- Progress invoicing (partial conversion) — v1.1 in the spec.
- Converting from the invoice side ("add estimate to invoice" drawer) — one path, from the estimate.
- Previous / next arrows in the title — no list order exists until p2-sales-lists.
- Side panel (customization, payment options, design, scheduling, customer reports) — design lives in Settings → Company (p2-pdf); the rest is out of v0 scope.
- E-signature prompts, tours, feedback — out of scope.
- Company block and logo on the form — they print on the PDF only (p2-pdf).
- Class column — classes are Later in the spec.
- A default-expiration setting — an estimate starts with no expiration date.

## 6. Platform notes
Standing approval for every Books form (human, 2026-11-11): keyboard shortcuts on web and iOS with a hardware keyboard (Android uses visible buttons and menus); Customer autofocus and type-to-open pickers on web only (native opens a picker by tap). No new platform item.

## 7. Sparks carried
- Status at a glance: a shared `StatusBadge` (rounded-full outline badge, tone → `border-<tone> text-<tone>`), generalized from `EntryStatusBadge`: Pending info, Accepted success, Rejected destructive, Closed muted (`border-border text-muted-foreground`), Expired warning.
- Total as the largest figure: `DocumentHeader`'s big figure, label "Total".
- No core extension.

## 8. Non-goals
- No journal entry, register line, report row or A/R effect from an estimate.
- No draft status and no "Post" on an estimate.
- No editing of a closed estimate; undo the conversion on the invoice side instead.
- No status change by the customer in this unit (the public link unit adds it).
- No automatic expiry: nothing changes status when the expiration date passes.
