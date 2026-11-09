package books

import (
	"database/sql"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// Refusal texts of the invoice guards. The first group is shown by the client
// too (tinycld/books/lib/invoice-messages.ts); tests/invoice-messages.test.ts
// fails when they drift. PocketBase adds the final period to a text without
// one. %s is the customer's name, which refuseNamedField keeps as typed.
const (
	msgDueBeforeDate      = "The due date cannot be before the invoice date"
	msgPercentTarget      = "A percent line applies to the item or subtotal right above it"
	msgTotalNegative      = "An invoice total cannot be below zero. Use a credit memo."
	msgTotalTooLarge      = "The invoice total is more than Books can store."
	msgTooManyLines       = "An invoice can have at most 250 lines."
	msgCustomerInactive   = "%s is inactive. Choose an active customer."
	msgCustomerOnInvoices = "%s is on invoices. Make it inactive instead."
)

// Go-only refusal texts. msgZeroTotal is posting's (checkpoint 2 of the
// invoice unit refuses it); it lives here with the other invoice texts.
const (
	msgZeroTotal              = "An invoice with a total of zero cannot be posted. Add an amount or keep it as a draft."
	msgInvoicePostedFromForm  = "A draft invoice is posted from the invoice form."
	msgInvoiceNotDraft        = "A posted or void invoice cannot be changed."
	msgInvoiceDeleteNotDraft  = "Only a draft invoice can be deleted."
	msgInvoiceDay             = "Enter a date that exists, in the form YYYY-MM-DD."
	msgInvoiceTaxRateInactive = "The tax rate is inactive. Choose an active rate."
	msgLineStaysOnInvoice     = "A line stays on its invoice."
	msgLineInvoiceNotDraft    = "Only the lines of a draft invoice can change."
	msgLineAmountByBooks      = "Books computes a line's amount."
	msgLineProductInactive    = "Line %d: %s is inactive. Choose an active product or service."
	msgLineBundle             = "Line %d: a bundle is never stored on a line. Pick it again to add its items."
	msgLineTooLarge           = "Line %d: the amount is too large."
	msgLineNoAmountKind       = "Line %d: A %s line has no product or amount."
	msgLineNeedsProduct       = "Line %d: Product or service is required."
	msgLineNeedsDescription   = "Line %d: Description is required."
	msgLineQuantity           = "Line %d: Enter a quantity more than 0."
	msgLineItemPercent        = "Line %d: An item line has no percent."
	msgLinePercentCells       = "Line %d: A percent line has no quantity or rate."
	msgLineRestating          = "Only a line's amount changes while Books restates its invoice."
)

// docTypeInvoice is the doc type of an invoice's sequence and of the entry it
// posts; entry_type_labels.json holds how a reader sees it.
const docTypeInvoice = "invoice"

// maxDocumentLines is the most lines one invoice holds; the client's bound is
// MAX_DOCUMENT_LINES (lib/document-lines.ts).
const maxDocumentLines = 250

// The store keys that mark an invoice whose lines Books is writing itself: the
// restatement of their amounts, or the cascade of the invoice's delete.
const (
	restatingKeyPrefix = "books.invoice.restating."
	deletingKeyPrefix  = "books.invoice.deleting."
)

// registerInvoiceGuards binds the invoice and line guards inside serialized,
// so no other write can commit between a check and the write it allows. Every
// line create, update and delete then restates the invoice (each line's amount
// and the three totals) in the same transaction.
func registerInvoiceGuards(app core.App) {
	bindSerializedGuard(app, "books_invoices", validateInvoice)
	bindSerializedGuard(app, "books_invoice_lines", validateInvoiceLine)
	// Bound after the line guard, so it runs inside the guard's transaction
	// (e.App is the transaction there) and after the write it wraps.
	restateAfter := func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		invoiceID := e.Record.GetString("invoice")
		if isRestating(e.App, invoiceID) {
			return nil
		}
		_, err := restateInvoice(e.App, invoiceID)
		return err
	}
	app.OnRecordCreate("books_invoice_lines").BindFunc(restateAfter)
	app.OnRecordUpdate("books_invoice_lines").BindFunc(restateAfter)
	app.OnRecordDelete("books_invoice_lines").BindFunc(func(e *core.RecordEvent) error {
		invoiceID := e.Record.GetString("invoice")
		if isDeleting(e.App, invoiceID) {
			return e.Next()
		}
		return serializedThen(e,
			func(tx core.App) error { return checkInvoiceLineDelete(tx, e.Record) },
			func(tx core.App) error {
				_, err := restateInvoice(tx, invoiceID)
				return err
			})
	})
	// The cascade deletes the lines one by one; none of them is checked or
	// restates an invoice that is going away. The status is read from the
	// stored row inside serialized: a post that commits after the caller
	// loaded the record must not let its delete cascade a posted invoice. The
	// mark is set only after that re-read passes, so a refused delete never
	// lets a line write skip its guard while it runs.
	app.OnRecordDelete("books_invoices").BindFunc(func(e *core.RecordEvent) error {
		done := func() {}
		defer func() { done() }()
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById("books_invoices", e.Record.Id)
			if err != nil {
				return err
			}
			if stored.GetString("status") != statusDraft {
				return refuse(msgInvoiceDeleteNotDraft)
			}
			done = markDeleting(tx, e.Record.Id)
			return nil
		})
	})
	// Stamp who posted or voided, on the transition only, as entries do: the
	// update rule refuses these fields in a person's body.
	app.OnRecordUpdateRequest("books_invoices").BindFunc(func(e *core.RecordRequestEvent) error {
		from, to := e.Record.Original().GetString("status"), e.Record.GetString("status")
		switch {
		case from == to:
		case to == statusPosted:
			stampActor(e.Record, "posted_by", e.Auth)
		case to == statusVoid:
			stampActor(e.Record, "voided_by", e.Auth)
		}
		return e.Next()
	})
}

// markRestating marks invoiceID's lines as written by restateInvoice, so the
// line guard lets their amounts change; the returned func clears the mark. The
// app store is shared by an app and its transactions.
func markRestating(app core.App, invoiceID string) func() {
	app.Store().Set(restatingKeyPrefix+invoiceID, true)
	return func() { app.Store().Remove(restatingKeyPrefix + invoiceID) }
}

func isRestating(app core.App, invoiceID string) bool {
	return app.Store().Has(restatingKeyPrefix + invoiceID)
}

func markDeleting(app core.App, invoiceID string) func() {
	app.Store().Set(deletingKeyPrefix+invoiceID, true)
	return func() { app.Store().Remove(deletingKeyPrefix + invoiceID) }
}

func isDeleting(app core.App, invoiceID string) bool {
	return app.Store().Has(deletingKeyPrefix + invoiceID)
}

// refuseNamedField is refuseField for a message that starts with a name people
// typed: the message and the field's message are put back as written, as
// refuseNamed does. The format must end with a period.
func refuseNamedField(field, format string, args ...any) error {
	msg := fmt.Sprintf(format, args...)
	err := apis.NewBadRequestError(msg, validation.Errors{
		field: validation.NewError("validation_books", msg),
	})
	err.Message = msg
	if item, ok := err.Data[field].(map[string]any); ok {
		item["message"] = msg
	}
	return err
}

// validateInvoice guards an invoice write. A create is a draft: it stamps the
// id and the currency and runs the draft guards. An update follows the
// invoice's lifecycle (transitionInvoice). stored is the record before an
// update, nil on a create.
func validateInvoice(tx core.App, stored, r *core.Record) error {
	if stored != nil {
		return transitionInvoice(tx, stored, r, time.Now())
	}
	ensureRecordID(r)
	switch r.GetString("status") {
	case statusPosted, statusVoid:
		return refuse(msgInvoicePostedFromForm)
	}
	if err := stampCurrency(tx, r); err != nil {
		return err
	}
	return checkDraftInvoice(tx, nil, r)
}

// invoiceUnlinks are the invoice's links PocketBase clears on its own when the
// row they name is deleted (a user, a form), by collection. That unlink is the
// only change a posted or void invoice accepts besides its void.
var invoiceUnlinks = map[string]string{"posted_by": "users", "voided_by": "users", "form": "forms"}

// voidInvoiceEditable are the only fields a void changes; a correction's post
// also sets replaced_by on the invoice it replaces.
var (
	voidInvoiceEditable    = map[string]bool{"status": true, "voided_by": true, "voided_at": true}
	replaceInvoiceEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true, "replaced_by": true}
)

// transitionInvoice is the invoice's lifecycle: a draft is edited or posted
// (postInvoice), a posted invoice is voided (voidInvoice) or replaced by its
// correction's post, and nothing else changes except PocketBase unlinking a
// deleted user or form.
func transitionInvoice(tx core.App, stored, r *core.Record, now time.Time) error {
	from, to := stored.GetString("status"), r.GetString("status")
	switch {
	case from == statusDraft && to == statusDraft:
		return checkDraftInvoice(tx, stored, r)
	case from == statusDraft && to == statusPosted:
		if err := checkDraftInvoice(tx, stored, r); err != nil {
			return err
		}
		return postInvoice(tx, r, now)
	case from == statusPosted && to == statusVoid && isReplacing(tx, r.Id):
		if len(changedFields(stored, r, replaceInvoiceEditable)) > 0 {
			return refuse(msgInvoiceNotDraft)
		}
		return nil
	case from == statusPosted && to == statusVoid:
		if len(changedFields(stored, r, voidInvoiceEditable)) > 0 {
			return refuse(msgInvoiceNotDraft)
		}
		return voidInvoice(tx, r, now)
	case from == to:
		unlinks, err := onlyInvoiceUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		return refuse(msgInvoiceNotDraft)
	}
	return refuse(msgInvoiceCannotGo, invoiceName(stored), from, to)
}

// onlyInvoiceUnlinks reports whether every field r changes is one of
// invoiceUnlinks that PocketBase cleared because the row it named is gone. A
// link cleared while its row still exists is a change like any other.
// PocketBase deletes the row before it unlinks the references, inside the same
// transaction, so tx no longer finds it.
func onlyInvoiceUnlinks(tx core.App, stored, r *core.Record) (bool, error) {
	for _, name := range changedFields(stored, r, nil) {
		collection, ok := invoiceUnlinks[name]
		if !ok || r.GetString(name) != "" {
			return false, nil
		}
		_, err := tx.FindRecordById(collection, stored.GetString(name))
		if err == nil {
			return false, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return false, err
		}
	}
	return true, nil
}

// checkDraftInvoice runs the header guards of a draft, sets the sort key, and
// sets the three totals from the stored lines and the header tax.
func checkDraftInvoice(tx core.App, stored, r *core.Record) error {
	if err := checkInvoiceDays(r); err != nil {
		return err
	}
	if err := checkInvoiceCustomer(tx, stored, r); err != nil {
		return err
	}
	if err := checkInvoiceTaxRate(tx, stored, r); err != nil {
		return err
	}
	if !isAddress(r.Get("bill_to")) {
		return refuseField("bill_to", msgAddressShape)
	}
	r.Set("sort_key", invoiceSortKey(r))

	lines, err := invoiceLines(tx, r.Id)
	if err != nil {
		return err
	}
	totals, err := invoiceTotals(tx, r, lineInputs(lines))
	if err != nil {
		return err
	}
	if err := checkInvoiceTotals(totals); err != nil {
		return err
	}
	setInvoiceTotals(r, totals)
	return nil
}

func checkInvoiceDays(r *core.Record) error {
	date, err := parseDay(r.GetString("date"))
	if err != nil {
		return refuseField("date", msgInvoiceDay)
	}
	due, err := parseDay(r.GetString("due_date"))
	if err != nil {
		return refuseField("due_date", msgInvoiceDay)
	}
	if due.Before(date) {
		return refuseField("due_date", msgDueBeforeDate)
	}
	return nil
}

// checkInvoiceCustomer refuses an inactive customer when the write chooses it;
// a draft keeps a customer that became inactive after it was chosen, and a
// correction keeps its original's. A customer that does not exist is the
// schema's refusal.
func checkInvoiceCustomer(tx core.App, stored, r *core.Record) error {
	id := r.GetString("customer")
	if id == "" || (stored != nil && stored.GetString("customer") == id) {
		return nil
	}
	customer, err := tx.FindRecordById("books_customers", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the invoice's customer: %w", err)
	}
	if !customer.GetBool("inactive") {
		return nil
	}
	keeps, err := keepsCorrectedCustomer(tx, r, id)
	if err != nil || keeps {
		return err
	}
	return refuseNamedField("customer", msgCustomerInactive, customer.GetString("display_name"))
}

// checkInvoiceTaxRate refuses an inactive rate or group when the write chooses
// it, as checkInvoiceCustomer does for the customer.
func checkInvoiceTaxRate(tx core.App, stored, r *core.Record) error {
	id := r.GetString("tax_rate")
	if id == "" || (stored != nil && stored.GetString("tax_rate") == id) {
		return nil
	}
	rate, err := tx.FindRecordById("books_tax_rates", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the invoice's tax rate: %w", err)
	}
	if rate.GetBool("inactive") {
		return refuseField("tax_rate", msgInvoiceTaxRateInactive)
	}
	return nil
}

// invoiceSortKey orders invoices by date, then number, then id: a draft has
// sequence 0, so it sorts before the numbered invoices of its day.
func invoiceSortKey(r *core.Record) string {
	return fmt.Sprintf("%s %010d%s%s", r.GetString("date"), r.GetInt("sequence"), sortIDSep, r.Id)
}

// invoiceLines reads an invoice's stored lines in their order.
func invoiceLines(tx core.App, invoiceID string) ([]*core.Record, error) {
	lines, err := tx.FindRecordsByFilter("books_invoice_lines", "invoice = {:id}", "position,id", 0, 0,
		dbx.Params{"id": invoiceID})
	if err != nil {
		return nil, fmt.Errorf("books: read the invoice's lines: %w", err)
	}
	return lines, nil
}

func lineInputs(lines []*core.Record) []documentLine {
	out := make([]documentLine, len(lines))
	for i, l := range lines {
		out[i] = documentLine{
			Kind:       l.GetString("kind"),
			Quantity:   l.GetFloat("quantity"),
			Rate:       int64(l.GetInt("rate")),
			PercentPpm: int64(l.GetInt("percent_ppm")),
			Taxable:    l.GetBool("taxable"),
		}
	}
	return out
}

// invoiceTotals runs documentTotals over lines with the invoice's header tax:
// a rate is its own one component, a group its components in the group's order.
func invoiceTotals(tx core.App, invoice *core.Record, lines []documentLine) (documentTotalsResult, error) {
	ppms, ids, err := taxComponents(tx, invoice.GetString("tax_rate"))
	if err != nil {
		return documentTotalsResult{}, err
	}
	return documentTotals(lines, ppms, ids), nil
}

func taxComponents(tx core.App, taxRateID string) ([]int64, []string, error) {
	if taxRateID == "" {
		return nil, nil, nil
	}
	rate, err := tx.FindRecordById("books_tax_rates", taxRateID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses the write; until then the invoice has no tax.
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("books: read the invoice's tax rate: %w", err)
	}
	if rate.GetString("type") != "group" {
		return []int64{int64(rate.GetInt("rate_ppm"))}, []string{rate.Id}, nil
	}
	ids := rate.GetStringSlice("components")
	components, err := tx.FindRecordsByIds("books_tax_rates", ids)
	if err != nil {
		return nil, nil, fmt.Errorf("books: read the tax group's rates: %w", err)
	}
	ppmOf := make(map[string]int64, len(components))
	for _, c := range components {
		ppmOf[c.Id] = int64(c.GetInt("rate_ppm"))
	}
	var ppms []int64
	var found []string
	for _, id := range ids {
		if ppm, ok := ppmOf[id]; ok {
			ppms = append(ppms, ppm)
			found = append(found, id)
		}
	}
	return ppms, found, nil
}

// checkInvoiceTotals refuses a percent line with no target, a line amount
// past maxAmount and a total below zero or past maxStoredAmount. Line numbers
// count from 1 in the lines' order.
func checkInvoiceTotals(totals documentTotalsResult) error {
	if len(totals.PercentTargetErrors) > 0 {
		return refuse("Line %d: %s", totals.PercentTargetErrors[0]+1, msgPercentTarget)
	}
	for i, amount := range totals.Amounts {
		if totals.HasAmount[i] && (amount > maxAmount || amount < -maxAmount) {
			return refuse(msgLineTooLarge, i+1)
		}
	}
	if totals.TooLarge || totals.Total > maxStoredAmount || totals.Subtotal > maxStoredAmount {
		return refuse(msgTotalTooLarge)
	}
	if totals.Total < 0 {
		return refuse(msgTotalNegative)
	}
	return nil
}

func setInvoiceTotals(r *core.Record, totals documentTotalsResult) {
	r.Set("subtotal", totals.Subtotal)
	r.Set("tax_total", totals.TaxTotal)
	r.Set("total", totals.Total)
}

// validateInvoiceLine checks one line write of a draft: the line stays on its
// invoice, the invoice holds at most maxDocumentLines lines, the line's kind
// has its own cells and no others, a product the write chooses is active and
// not a bundle, and the invoice's lines with this write still have a target for
// every percent line and totals Books can store. It sets the line's amount.
// While restateInvoice writes the invoice's lines, an update that changes only
// the amount passes and any other update is refused. stored is the record
// before an update, nil on a create.
func validateInvoiceLine(tx core.App, stored, r *core.Record) error {
	invoiceID := r.GetString("invoice")
	if stored != nil && stored.GetString("invoice") != invoiceID {
		return refuseField("invoice", msgLineStaysOnInvoice)
	}
	if stored != nil && isRestating(tx, invoiceID) {
		if !onlyAmountChanged(stored, r) {
			return refuse(msgLineRestating)
		}
		return nil
	}
	if stored != nil && stored.GetInt("amount") != r.GetInt("amount") {
		return refuse(msgLineAmountByBooks)
	}
	invoice, err := tx.FindRecordById("books_invoices", invoiceID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a line whose invoice does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's invoice: %w", err)
	}
	if invoice.GetString("status") != statusDraft {
		return refuse(msgLineInvoiceNotDraft)
	}
	if stored == nil {
		ensureRecordID(r)
		n, err := tx.CountRecords("books_invoice_lines", dbx.HashExp{"invoice": invoiceID})
		if err != nil {
			return fmt.Errorf("books: count the invoice's lines: %w", err)
		}
		if n >= maxDocumentLines {
			return refuse(msgTooManyLines)
		}
	}

	others, err := invoiceLines(tx, invoiceID)
	if err != nil {
		return err
	}
	lines := withLine(others, r)
	index := slices.IndexFunc(lines, func(l *core.Record) bool { return l.Id == r.Id })
	if err := checkLineCells(r, index+1); err != nil {
		return err
	}
	if err := checkLineProduct(tx, stored, r, index+1); err != nil {
		return err
	}
	totals, err := invoiceTotals(tx, invoice, lineInputs(lines))
	if err != nil {
		return err
	}
	if err := checkInvoiceTotals(totals); err != nil {
		return err
	}
	r.Set("amount", totals.Amounts[index])
	return nil
}

// onlyAmountChanged reports whether r differs from stored in amount and the
// autodate fields alone, the write restateInvoice makes.
func onlyAmountChanged(stored, r *core.Record) bool {
	for _, field := range r.Collection().Fields {
		name := field.GetName()
		if name == "amount" || field.Type() == core.FieldTypeAutodate {
			continue
		}
		if !reflect.DeepEqual(stored.Get(name), r.Get(name)) {
			return false
		}
	}
	return true
}

// withLine is the invoice's lines with r written: r in place of its stored
// row, or added, in position order (id breaks a tie, as invoiceLines sorts).
func withLine(stored []*core.Record, r *core.Record) []*core.Record {
	lines := make([]*core.Record, 0, len(stored)+1)
	for _, l := range stored {
		if l.Id != r.Id {
			lines = append(lines, l)
		}
	}
	lines = append(lines, r)
	slices.SortStableFunc(lines, compareLines)
	return lines
}

func compareLines(a, b *core.Record) int {
	if d := a.GetInt("position") - b.GetInt("position"); d != 0 {
		return d
	}
	return strings.Compare(a.Id, b.Id)
}

// checkLineCells holds a line to its kind: an item and a percent line name a
// product; an item's quantity is more than 0 (PocketBase skips the schema's
// min for a 0 or missing number) and it has no percent; a percent line has no
// quantity or rate; a description line has a description; a description or
// subtotal line has no product, rate or percent. A 0% percent line is stored:
// refusing it is the client's rule. Core's forms mirror checks only the host
// declaration, so the kinds' cells are checked here. n is the line number.
func checkLineCells(r *core.Record, n int) error {
	kind := r.GetString("kind")
	switch kind {
	case lineKindItem, lineKindPercent:
		if r.GetString("product") == "" {
			return refuse(msgLineNeedsProduct, n)
		}
		if kind == lineKindItem && r.GetFloat("quantity") <= 0 {
			return refuse(msgLineQuantity, n)
		}
		if kind == lineKindItem && r.GetInt("percent_ppm") != 0 {
			return refuse(msgLineItemPercent, n)
		}
		if kind == lineKindPercent && (r.GetFloat("quantity") != 0 || r.GetInt("rate") != 0) {
			return refuse(msgLinePercentCells, n)
		}
	case lineKindDescription, lineKindSubtotal:
		if r.GetString("product") != "" || r.GetInt("rate") != 0 || r.GetInt("percent_ppm") != 0 {
			return refuse(msgLineNoAmountKind, n, kind)
		}
		if kind == lineKindDescription && strings.TrimSpace(r.GetString("description")) == "" {
			return refuse(msgLineNeedsDescription, n)
		}
	}
	return nil
}

// checkLineProduct refuses a bundle (the form adds a bundle's items, never the
// bundle) and an inactive product when the write chooses it; a line keeps a
// product that became inactive after it was chosen. A product that does not
// exist is the schema's refusal. n is the line number.
func checkLineProduct(tx core.App, stored, r *core.Record, n int) error {
	id := r.GetString("product")
	if id == "" || (stored != nil && stored.GetString("product") == id) {
		return nil
	}
	product, err := tx.FindRecordById("books_products", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's product: %w", err)
	}
	if product.GetString("type") == "bundle" {
		return refuse(msgLineBundle, n)
	}
	if product.GetBool("inactive") {
		return refuseNamed(msgLineProductInactive, n, product.GetString("name"))
	}
	return nil
}

// checkInvoiceLineDelete allows a draft's line to go when the lines left still
// have a target for every percent line and totals Books can store.
func checkInvoiceLineDelete(tx core.App, line *core.Record) error {
	invoice, err := tx.FindRecordById("books_invoices", line.GetString("invoice"))
	if err != nil {
		return fmt.Errorf("books: read the line's invoice: %w", err)
	}
	if invoice.GetString("status") != statusDraft {
		return refuse(msgLineInvoiceNotDraft)
	}
	stored, err := invoiceLines(tx, invoice.Id)
	if err != nil {
		return err
	}
	left := slices.DeleteFunc(stored, func(l *core.Record) bool { return l.Id == line.Id })
	totals, err := invoiceTotals(tx, invoice, lineInputs(left))
	if err != nil {
		return err
	}
	return checkInvoiceTotals(totals)
}

// restateInvoice recomputes every line amount and the invoice's totals from
// its stored lines and header tax, and saves each line whose amount changed
// and the invoice. The line guard lets the amounts through while the invoice
// is marked restating; the invoice guard sets the same totals again.
func restateInvoice(tx core.App, invoiceID string) (documentTotalsResult, error) {
	invoice, err := tx.FindRecordById("books_invoices", invoiceID)
	if err != nil {
		return documentTotalsResult{}, fmt.Errorf("books: read the invoice to restate: %w", err)
	}
	lines, err := invoiceLines(tx, invoiceID)
	if err != nil {
		return documentTotalsResult{}, err
	}
	totals, err := invoiceTotals(tx, invoice, lineInputs(lines))
	if err != nil {
		return documentTotalsResult{}, err
	}
	if err := checkInvoiceTotals(totals); err != nil {
		return documentTotalsResult{}, err
	}
	if err := restateLineAmounts(tx, invoiceID, lines, totals); err != nil {
		return documentTotalsResult{}, err
	}
	setInvoiceTotals(invoice, totals)
	if err := tx.Save(invoice); err != nil {
		return documentTotalsResult{}, err
	}
	return totals, nil
}
