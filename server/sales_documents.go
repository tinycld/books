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
	"tinycld.org/core/forms"
)

// The lifecycles of a sales document kind (the client's DocumentLifecycle,
// lib/sales-document-kinds.ts). A posting document is a draft, then posted,
// then void; a quote is pending, accepted or rejected while the customer
// decides, and closed once an invoice is made from it. A quote never posts.
const (
	lifecyclePosting = "posting"
	lifecycleQuote   = "quote"
)

// The parties a document names: the header field that holds it and the field
// of each journal line that names it.
const (
	partyCustomer = "customer"
	partyVendor   = "vendor"
)

// salesDocKind is one kind of document of the shared layer: the sales
// documents (an invoice, a sales receipt, an estimate) and the purchase
// documents (a bill). It holds the collections the kind writes, the forms host
// of its lines, its doc type, its lifecycle, its party, its refusal texts and
// the parts of its guards and posting that differ by kind. Every guard and the
// posting below take a kind; invoiceKind (invoices.go), salesReceiptKind
// (sales_receipts.go), estimateKind (estimates.go) and billKind (bills.go) are
// the kinds.
type salesDocKind struct {
	// DocType is the doc type of the kind's sequence and of the entry it posts.
	DocType string
	// Lifecycle is lifecyclePosting or lifecycleQuote: which statuses a person
	// edits, and whether the document posts.
	Lifecycle string
	// Collection, LinesCollection and TaxLinesCollection are the header, line
	// and posted tax line collections; ParentField is the field of a line and
	// of a tax line that names its document.
	Collection, LinesCollection, TaxLinesCollection, ParentField string
	// HostKey is the forms host whose line table built-ins say which cells
	// each kind of line needs (forms/hosts.ts).
	HostKey string
	// LineTables are the host's table built-ins whose row kinds a line may
	// take: a line's kind is looked up in each of them.
	LineTables []string
	// LineRowLabels names a line in a refusal by its kind ("Account line"),
	// numbered among the document's lines of that kind. nil numbers every line
	// across the document as "Line n" (the sales kinds' one table).
	LineRowLabels map[string]string
	// Party is the header field that names the document's party, partyCustomer
	// or partyVendor; the entry's lines name it in the field of the same name.
	// PartyCollection is the party's collection.
	Party, PartyCollection string
	// AddressField is the header's address snapshot of the party (an
	// invoice's bill_to, a bill's mailing_address).
	AddressField string
	// CustomerRequired records the schema's rule that the party is required:
	// the invoice's `customer` and the bill's `vendor` relations are required
	// in their migrations, the sales receipt's is not. No Go code reads it:
	// the shared guard checks a party only when one is chosen, and the schema
	// refuses an empty one. It mirrors the client kind's `customerRequired`
	// (lib/sales-document-kinds.ts).
	CustomerRequired bool
	// HasTax is false for a kind with no sales tax: no tax-rate guard, no tax
	// in its totals and no tax snapshot when it posts.
	HasTax bool
	Msgs   salesDocMessages
	// CheckHeader runs the kind's own header guards on a draft write; stored
	// is the row before an update, nil on a create.
	CheckHeader func(tx core.App, stored, r *core.Record) error
	// AfterCreate runs after a create's write, in its transaction, so a
	// failure rolls the create back (an invoice closes the estimate it is made
	// from); nil is no step.
	AfterCreate func(tx core.App, r *core.Record) error
	// CheckDelete runs inside a delete's transaction before the status check
	// (an estimate an invoice names is refused); nil is no check.
	CheckDelete func(tx core.App, stored *core.Record) error
	// Withdraw runs when a posting document stops standing: its draft is
	// deleted, or it is voided (an invoice reopens its estimate). It does not
	// run when a correction's post replaces the document (Replace does); nil
	// is no step.
	Withdraw func(tx core.App, doc *core.Record) error
	// Replace runs when a correction's post sets its original void (an
	// invoice moves its estimate to the correction); nil is no step.
	Replace func(tx core.App, original, correction *core.Record) error
	// BeforePost runs in the posting transaction before the lines are read;
	// nil is no step, and a quote has none.
	BeforePost func(tx core.App, doc *core.Record) error
	// DebitAccount is the account the posting debits for the total (a sales
	// kind's control account); CreditAccount the account it credits for the
	// total (a bill's Accounts payable). A posting kind sets exactly one of
	// them; a quote, which never posts, sets neither.
	DebitAccount  func(tx core.App, doc *core.Record) (string, error)
	CreditAccount func(tx core.App, doc *core.Record) (string, error)
	// LineAccounts are the entry's lines for the document's lines, on the side
	// opposite the total's; nil is incomeByAccount (the sales kinds' credits).
	LineAccounts func(tx core.App, lines []*core.Record, totals documentTotalsResult) ([]postingLine, error)
}

// isEditableStatus reports whether a person may change a document in status
// and its lines: a posting document only while it is a draft, a quote until
// it is closed.
func (k salesDocKind) isEditableStatus(status string) bool {
	if k.Lifecycle == lifecycleQuote {
		return status != statusClosed
	}
	return status == statusDraft
}

// salesDocMessages are the refusal texts that name the kind ("invoice",
// "sales receipt", "estimate", "bill"). The texts every kind shares are
// constants. On a quote, NotDraft, DeleteNotDraft and LineNotDraft are the
// texts of a closed document; ZeroTotal, PostedFromForm and EditMissing are
// posting texts. PartyInactive refuses an inactive party; %s is its name.
type salesDocMessages struct {
	TotalNegative, TotalTooLarge, TooManyLines, ZeroTotal, PostedFromForm, NotDraft, DeleteNotDraft,
	LineStays, LineNotDraft, LineRestating, LineUnknownKind, EditMissing, CustomerOnDocs, PartyInactive string
}

// The lines built-in of every sales document host, whose row kinds say which
// cells each kind of line needs.
const salesDocLinesKey = "lines"

// Refusal texts every document kind shares. A line's texts start with its
// label (lineRowLabel: "Line 3", "Account line 2"); a product's name is kept
// as typed (refuseNamed).
const (
	msgDocumentDay             = "Enter a date that exists, in the form YYYY-MM-DD."
	msgDocumentTaxRateInactive = "The tax rate is inactive. Choose an active rate."
	msgLineAmountByBooks       = "Books computes a line's amount."
	msgLineProductInactive     = "%s: %s is inactive. Choose an active product or service."
	msgLineBundle              = "%s: a bundle is never stored on a line. Pick it again to add its items."
	msgLineTooLarge            = "%s: the amount is too large."
	msgLineNoAmountKind        = "%s: A %s line has no product or amount."
	msgLineCell                = "%s: %s."
	msgLineQuantity            = "%s: Enter a quantity more than 0."
	msgLineItemPercent         = "%s: An item line has no percent."
	msgLinePercentCells        = "%s: A percent line has no quantity or rate."
)

// documentDocTypes are the doc types of the documents that post: their entries
// come only from posting the document (entries.go).
var documentDocTypes = map[string]bool{docTypeInvoice: true, docTypeSalesReceipt: true, docTypeBill: true}

// maxDocumentLines is the most lines one sales document holds; the client's
// bound is MAX_DOCUMENT_LINES (lib/document-lines.ts).
const maxDocumentLines = 250

// registerSalesDocGuards binds the kind's header and line guards inside
// serialized, so no other write can commit between a check and the write it
// allows. Every line create, update and delete then restates the document
// (each line's amount and the three totals) in the same transaction.
func registerSalesDocGuards(app core.App, kind salesDocKind) {
	bindSerializedGuardThen(app, kind.Collection, func(tx core.App, stored, r *core.Record) error {
		return validateSalesDoc(tx, kind, stored, r)
	}, kind.AfterCreate)
	bindSerializedGuard(app, kind.LinesCollection, func(tx core.App, stored, r *core.Record) error {
		return validateSalesDocLine(tx, kind, stored, r)
	})
	// Bound after the line guard, so it runs inside the guard's transaction
	// (e.App is the transaction there) and after the write it wraps.
	restateAfter := func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		docID := e.Record.GetString(kind.ParentField)
		if isRestating(e.App, kind, docID) {
			return nil
		}
		_, err := restateSalesDoc(e.App, kind, docID)
		return err
	}
	app.OnRecordCreate(kind.LinesCollection).BindFunc(restateAfter)
	app.OnRecordUpdate(kind.LinesCollection).BindFunc(restateAfter)
	app.OnRecordDelete(kind.LinesCollection).BindFunc(func(e *core.RecordEvent) error {
		docID := e.Record.GetString(kind.ParentField)
		if isDeleting(e.App, kind, docID) {
			return e.Next()
		}
		return serializedThen(e,
			func(tx core.App) error { return checkSalesDocLineDelete(tx, kind, e.Record) },
			func(tx core.App) error {
				_, err := restateSalesDoc(tx, kind, docID)
				return err
			})
	})
	// The cascade deletes the lines one by one; none of them is checked or
	// restates a document that is going away. The status is read from the
	// stored row inside serialized: a post (or a conversion) that commits after
	// the caller loaded the record must not let its delete cascade a posted
	// document (or a closed estimate). The mark is set only after that re-read
	// passes, so a refused delete never lets a line write skip its guard while
	// it runs. The kind's CheckDelete and Withdraw run in the same
	// transaction, before the row goes: Withdraw clears the links that name
	// it (an estimate's invoice), so PocketBase's unlink of the deleted row
	// never writes to a closed estimate or a posted invoice.
	app.OnRecordDelete(kind.Collection).BindFunc(func(e *core.RecordEvent) error {
		done := func() {}
		defer func() { done() }()
		return serialized(e, func(tx core.App) error {
			stored, err := tx.FindRecordById(kind.Collection, e.Record.Id)
			if err != nil {
				return err
			}
			if kind.CheckDelete != nil {
				if err := kind.CheckDelete(tx, stored); err != nil {
					return err
				}
			}
			if !kind.isEditableStatus(stored.GetString("status")) {
				return refuse("%s", kind.Msgs.DeleteNotDraft)
			}
			if kind.Withdraw != nil {
				if err := kind.Withdraw(tx, stored); err != nil {
					return err
				}
			}
			done = markDeleting(tx, kind, e.Record.Id)
			return nil
		})
	})
	if kind.Lifecycle != lifecyclePosting {
		return
	}
	// Stamp who posted or voided, on the transition only, as entries do: the
	// update rule refuses these fields in a person's body. A quote has neither.
	app.OnRecordUpdateRequest(kind.Collection).BindFunc(func(e *core.RecordRequestEvent) error {
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

// The app store keys of a document whose lines Books is writing itself: the
// restatement of their amounts, or the cascade of the document's delete. They
// are per doc type ("books.invoice.restating.<id>"), so the invoice's keys are
// the ones it always had.
func restatingKey(kind salesDocKind, docID string) string {
	return "books." + kind.DocType + ".restating." + docID
}

func deletingKey(kind salesDocKind, docID string) string {
	return "books." + kind.DocType + ".deleting." + docID
}

// markRestating marks docID's lines as written by restateSalesDoc, so the line
// guard lets their amounts change; the returned func clears the mark. The app
// store is shared by an app and its transactions.
func markRestating(app core.App, kind salesDocKind, docID string) func() {
	app.Store().Set(restatingKey(kind, docID), true)
	return func() { app.Store().Remove(restatingKey(kind, docID)) }
}

func isRestating(app core.App, kind salesDocKind, docID string) bool {
	return app.Store().Has(restatingKey(kind, docID))
}

func markDeleting(app core.App, kind salesDocKind, docID string) func() {
	app.Store().Set(deletingKey(kind, docID), true)
	return func() { app.Store().Remove(deletingKey(kind, docID)) }
}

func isDeleting(app core.App, kind salesDocKind, docID string) bool {
	return app.Store().Has(deletingKey(kind, docID))
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

// validateSalesDoc guards a document write. A quote's create and update follow
// the quote lifecycle (createQuote, transitionQuote in estimates.go). A
// posting document's create is a draft: it stamps the id and the currency and
// runs the draft guards; its update follows the posting lifecycle
// (transitionSalesDoc). stored is the record before an update, nil on a
// create.
func validateSalesDoc(tx core.App, kind salesDocKind, stored, r *core.Record) error {
	if kind.Lifecycle == lifecycleQuote {
		if stored != nil {
			return transitionQuote(tx, kind, stored, r)
		}
		return createQuote(tx, kind, r)
	}
	if stored != nil {
		return transitionSalesDoc(tx, kind, stored, r, time.Now())
	}
	ensureRecordID(r)
	switch r.GetString("status") {
	case statusPosted, statusVoid:
		return refuse("%s", kind.Msgs.PostedFromForm)
	}
	if err := stampCurrency(tx, r); err != nil {
		return err
	}
	return checkDraftSalesDoc(tx, kind, nil, r)
}

// salesDocUnlinks are a document's links PocketBase clears on its own when the
// row they name is deleted (a user, a form), by collection. That unlink is the
// only change a posted or void document accepts besides its void.
var salesDocUnlinks = map[string]string{"posted_by": "users", "voided_by": "users", "form": "forms"}

// voidSalesDocEditable are the only fields a void changes; a correction's post
// also sets replaced_by on the document it replaces.
var (
	voidSalesDocEditable    = map[string]bool{"status": true, "voided_by": true, "voided_at": true}
	replaceSalesDocEditable = map[string]bool{"status": true, "voided_by": true, "voided_at": true, "replaced_by": true}
)

// transitionSalesDoc is a document's lifecycle: a draft is edited or posted
// (postSalesDoc), a posted document is voided (voidSalesDoc) or replaced by its
// correction's post, and nothing else changes except PocketBase unlinking a
// deleted user or form.
func transitionSalesDoc(tx core.App, kind salesDocKind, stored, r *core.Record, now time.Time) error {
	from, to := stored.GetString("status"), r.GetString("status")
	switch {
	case from == statusDraft && to == statusDraft:
		return checkDraftSalesDoc(tx, kind, stored, r)
	case from == statusDraft && to == statusPosted:
		if err := checkDraftSalesDoc(tx, kind, stored, r); err != nil {
			return err
		}
		return postSalesDoc(tx, kind, r, now)
	case from == statusPosted && to == statusVoid && isReplacing(tx, kind, r.Id):
		if len(changedFields(stored, r, replaceSalesDocEditable)) > 0 {
			return refuse("%s", kind.Msgs.NotDraft)
		}
		return nil
	case from == statusPosted && to == statusVoid:
		if len(changedFields(stored, r, voidSalesDocEditable)) > 0 {
			return refuse("%s", kind.Msgs.NotDraft)
		}
		return voidSalesDoc(tx, kind, r, now)
	case from == to:
		unlinks, err := onlySalesDocUnlinks(tx, stored, r)
		if err != nil || unlinks {
			return err
		}
		return refuse("%s", kind.Msgs.NotDraft)
	}
	return refuse(msgSalesDocCannotGo, salesDocName(kind, stored), from, to)
}

// onlySalesDocUnlinks reports whether every field r changes is one of
// salesDocUnlinks that PocketBase cleared because the row it named is gone. A
// link cleared while its row still exists is a change like any other.
// PocketBase deletes the row before it unlinks the references, inside the same
// transaction, so tx no longer finds it.
func onlySalesDocUnlinks(tx core.App, stored, r *core.Record) (bool, error) {
	for _, name := range changedFields(stored, r, nil) {
		collection, ok := salesDocUnlinks[name]
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

// checkDraftSalesDoc runs the header guards of a draft (the kind's own, then
// the party, the tax rate of a kind with tax and the address every kind has),
// sets the sort key, and sets the totals from the stored lines and the header
// tax.
func checkDraftSalesDoc(tx core.App, kind salesDocKind, stored, r *core.Record) error {
	if err := kind.CheckHeader(tx, stored, r); err != nil {
		return err
	}
	if err := checkSalesDocParty(tx, kind, stored, r); err != nil {
		return err
	}
	if kind.HasTax {
		if err := checkSalesDocTaxRate(tx, stored, r); err != nil {
			return err
		}
	}
	if !isAddress(r.Get(kind.AddressField)) {
		return refuseField(kind.AddressField, msgAddressShape)
	}
	r.Set("sort_key", salesDocSortKey(r))

	lines, err := salesDocLines(tx, kind, r.Id)
	if err != nil {
		return err
	}
	totals, err := salesDocTotals(tx, kind, r, lineInputs(lines))
	if err != nil {
		return err
	}
	if err := checkSalesDocTotals(kind, lines, totals); err != nil {
		return err
	}
	setSalesDocTotals(kind, r, totals)
	return nil
}

// checkSalesDocParty refuses an inactive party (customer or vendor) when the
// write chooses it; a draft keeps a party that became inactive after it was
// chosen, and a correction keeps its original's. An empty party passes: the
// invoice's and the bill's schemas require one, the sales receipt's does not.
// A party that does not exist is the schema's refusal.
func checkSalesDocParty(tx core.App, kind salesDocKind, stored, r *core.Record) error {
	id := r.GetString(kind.Party)
	if id == "" || (stored != nil && stored.GetString(kind.Party) == id) {
		return nil
	}
	party, err := tx.FindRecordById(kind.PartyCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the document's %s: %w", kind.Party, err)
	}
	if !party.GetBool("inactive") {
		return nil
	}
	keeps, err := keepsCorrectedParty(tx, kind, r, id)
	if err != nil || keeps {
		return err
	}
	return refuseNamedField(kind.Party, kind.Msgs.PartyInactive, party.GetString("display_name"))
}

// checkSalesDocTaxRate refuses an inactive rate or group when the write
// chooses it, as checkSalesDocParty does for the party.
func checkSalesDocTaxRate(tx core.App, stored, r *core.Record) error {
	id := r.GetString("tax_rate")
	if id == "" || (stored != nil && stored.GetString("tax_rate") == id) {
		return nil
	}
	rate, err := tx.FindRecordById("books_tax_rates", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the document's tax rate: %w", err)
	}
	if rate.GetBool("inactive") {
		return refuseField("tax_rate", msgDocumentTaxRateInactive)
	}
	return nil
}

// salesDocSortKey orders documents by date, then number, then id: a draft has
// sequence 0, so it sorts before the numbered documents of its day.
func salesDocSortKey(r *core.Record) string {
	return fmt.Sprintf("%s %010d%s%s", r.GetString("date"), r.GetInt("sequence"), sortIDSep, r.Id)
}

// salesDocLines reads a document's stored lines in their order.
func salesDocLines(tx core.App, kind salesDocKind, docID string) ([]*core.Record, error) {
	return docLineRecords(tx, kind.LinesCollection, kind.ParentField, docID)
}

// docLineRecords is salesDocLines by collection and parent field, for a
// caller (the PDF builders) that names the lines collection itself.
func docLineRecords(tx core.App, linesCollection, parentField, docID string) ([]*core.Record, error) {
	lines, err := tx.FindRecordsByFilter(linesCollection, parentField+" = {:id}", "position,id", 0, 0,
		dbx.Params{"id": docID})
	if err != nil {
		return nil, fmt.Errorf("books: read the document's lines: %w", err)
	}
	return lines, nil
}

// lineInputs reads the lines as the totals math takes them. Amount is the
// stored amount, which the math reads only on an account line (typed there).
func lineInputs(lines []*core.Record) []documentLine {
	out := make([]documentLine, len(lines))
	for i, l := range lines {
		out[i] = documentLine{
			Kind:       l.GetString("kind"),
			Quantity:   l.GetFloat("quantity"),
			Rate:       int64(l.GetInt("rate")),
			PercentPpm: int64(l.GetInt("percent_ppm")),
			Taxable:    l.GetBool("taxable"),
			Amount:     int64(l.GetInt("amount")),
		}
	}
	return out
}

// lineRowLabel is how a refusal names line among the document's lines (in
// their order): "Line 3" for a sales kind, whose lines are numbered across the
// document; "Account line 2" for a kind with LineRowLabels, numbered among
// the lines of the same kind.
func lineRowLabel(kind salesDocKind, lines []*core.Record, line *core.Record) string {
	label, n := lineRowPlace(kind, lines, line)
	return fmt.Sprintf("%s %d", label, n)
}

// lineRowPlace is lineRowLabel's label and number apart. A kind with no label
// of its own (every kind of a sales document) names the line "Line" by its
// place among all the lines.
func lineRowPlace(kind salesDocKind, lines []*core.Record, line *core.Record) (string, int) {
	label, ok := kind.LineRowLabels[line.GetString("kind")]
	if !ok {
		label = "Line"
	}
	n := 0
	for _, l := range lines {
		if ok && l.GetString("kind") != line.GetString("kind") {
			continue
		}
		n++
		if l.Id == line.Id {
			break
		}
	}
	return label, n
}

// salesDocTotals runs documentTotals over lines with the document's header
// tax: a rate is its own one component, a group its components in the group's
// order. A kind with no tax has none.
func salesDocTotals(tx core.App, kind salesDocKind, doc *core.Record, lines []documentLine) (documentTotalsResult, error) {
	if !kind.HasTax {
		return documentTotals(lines, nil, nil), nil
	}
	ppms, ids, err := taxComponents(tx, doc.GetString("tax_rate"))
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
		// The schema refuses the write; until then the document has no tax.
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("books: read the document's tax rate: %w", err)
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

// checkSalesDocTotals refuses a percent line with no target, a line amount
// past maxAmount and a total below zero or past maxStoredAmount. totals are
// those of lines, in the same order; a line is named by lineRowLabel.
func checkSalesDocTotals(kind salesDocKind, lines []*core.Record, totals documentTotalsResult) error {
	if len(totals.PercentTargetErrors) > 0 {
		line := lines[totals.PercentTargetErrors[0]]
		return refuse("%s: %s", lineRowLabel(kind, lines, line), msgPercentTarget)
	}
	for i, amount := range totals.Amounts {
		if totals.HasAmount[i] && (amount > maxAmount || amount < -maxAmount) {
			return refuse(msgLineTooLarge, lineRowLabel(kind, lines, lines[i]))
		}
	}
	if totals.TooLarge || totals.Total > maxStoredAmount || totals.Subtotal > maxStoredAmount {
		return refuse("%s", kind.Msgs.TotalTooLarge)
	}
	if totals.Total < 0 {
		return refuse("%s", kind.Msgs.TotalNegative)
	}
	return nil
}

// setSalesDocTotals writes the totals; a kind with no tax has no tax_total.
func setSalesDocTotals(kind salesDocKind, r *core.Record, totals documentTotalsResult) {
	r.Set("subtotal", totals.Subtotal)
	if kind.HasTax {
		r.Set("tax_total", totals.TaxTotal)
	}
	r.Set("total", totals.Total)
}

// validateSalesDocLine checks one line write of an editable document (a draft,
// a quote that is not closed): the line stays on its
// document, the document holds at most maxDocumentLines lines, the line's kind
// has its own cells and no others, a product the write chooses is active and
// not a bundle, and the document's lines with this write still have a target
// for every percent line and totals Books can store. It sets the line's
// amount: Books computes it, so a write that sends one is refused, except on
// an account line, which keeps the amount typed. While restateSalesDoc writes the document's lines, an update
// that changes only the amount passes and any other update is refused. stored
// is the record before an update, nil on a create.
func validateSalesDocLine(tx core.App, kind salesDocKind, stored, r *core.Record) error {
	docID := r.GetString(kind.ParentField)
	if stored != nil && stored.GetString(kind.ParentField) != docID {
		return refuseField(kind.ParentField, "%s", kind.Msgs.LineStays)
	}
	if stored != nil && isRestating(tx, kind, docID) {
		if !onlyAmountChanged(stored, r) {
			return refuse("%s", kind.Msgs.LineRestating)
		}
		return nil
	}
	typedAmount := r.GetString("kind") == lineKindAccount
	if !typedAmount && stored == nil && r.GetInt("amount") != 0 {
		return refuse(msgLineAmountByBooks)
	}
	if !typedAmount && stored != nil && stored.GetInt("amount") != r.GetInt("amount") {
		return refuse(msgLineAmountByBooks)
	}
	doc, err := tx.FindRecordById(kind.Collection, docID)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a line whose document does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the line's document: %w", err)
	}
	if !kind.isEditableStatus(doc.GetString("status")) {
		return refuse("%s", kind.Msgs.LineNotDraft)
	}
	if stored == nil {
		ensureRecordID(r)
		n, err := tx.CountRecords(kind.LinesCollection, dbx.HashExp{kind.ParentField: docID})
		if err != nil {
			return fmt.Errorf("books: count the document's lines: %w", err)
		}
		if n >= maxDocumentLines {
			return refuse("%s", kind.Msgs.TooManyLines)
		}
	}

	others, err := salesDocLines(tx, kind, docID)
	if err != nil {
		return err
	}
	lines := withLine(others, r)
	index := slices.IndexFunc(lines, func(l *core.Record) bool { return l.Id == r.Id })
	if err := checkLineCells(tx, kind, lines, r); err != nil {
		return err
	}
	if err := checkLineProduct(tx, stored, r, lineRowLabel(kind, lines, r)); err != nil {
		return err
	}
	totals, err := salesDocTotals(tx, kind, doc, lineInputs(lines))
	if err != nil {
		return err
	}
	if err := checkSalesDocTotals(kind, lines, totals); err != nil {
		return err
	}
	r.Set("amount", totals.Amounts[index])
	return nil
}

// onlyAmountChanged reports whether r differs from stored in amount and the
// autodate fields alone, the write restateSalesDoc makes.
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

// withLine is the document's lines with r written: r in place of its stored
// row, or added, in position order (id breaks a tie, as salesDocLines sorts).
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

// checkLineCells holds line r, one of the document's lines (in their order),
// to its kind. A kind that no table of the document kind holds is refused.
// The cells each kind requires (an item's and a percent line's product, a
// description line's description, an account line's account) are core's
// check of the document kind's forms host's row kinds, the same rule the form
// runs; a host that is not bound refuses every line rather than let one
// through unchecked. The rest are Books rules core does not make: an item's
// quantity is more than 0 (PocketBase skips the schema's min for a 0 or
// missing number) and it has no percent; a percent line has no quantity or
// rate; a description or subtotal line has no product, rate or percent; a
// bill's product line has no account; an account line has no product,
// quantity or rate, and checkBillAccountLine checks its account. A 0% percent line is
// stored: refusing it is the client's rule.
func checkLineCells(tx core.App, kind salesDocKind, lines []*core.Record, r *core.Record) error {
	label := lineRowLabel(kind, lines, r)
	_, n := lineRowPlace(kind, lines, r)
	table, err := lineTable(tx, kind, r.GetString("kind"))
	if err != nil {
		return err
	}
	if table == nil {
		// A kind no table holds has no label of its own: n counts every line.
		return refuse(kind.Msgs.LineUnknownKind, n)
	}
	if msg := table.RowError(storedLineCells(r)); msg != "" {
		return refuse(msgLineCell, label, msg)
	}
	lineKind := r.GetString("kind")
	switch lineKind {
	case lineKindItem, lineKindPercent:
		// Only a bill's lines have an account cell; a sales line reads "".
		if lineKind == lineKindItem && r.GetString("account") != "" {
			return refuse(msgBillProductLineAccount, label)
		}
		if lineKind == lineKindItem && r.GetFloat("quantity") <= 0 {
			return refuse(msgLineQuantity, label)
		}
		if lineKind == lineKindItem && r.GetInt("percent_ppm") != 0 {
			return refuse(msgLineItemPercent, label)
		}
		if lineKind == lineKindPercent && (r.GetFloat("quantity") != 0 || r.GetInt("rate") != 0) {
			return refuse(msgLinePercentCells, label)
		}
	case lineKindDescription, lineKindSubtotal:
		if r.GetString("product") != "" || r.GetInt("rate") != 0 || r.GetInt("percent_ppm") != 0 {
			return refuse(msgLineNoAmountKind, label, lineKind)
		}
	case lineKindAccount:
		if r.GetString("product") != "" || r.GetFloat("quantity") != 0 || r.GetInt("rate") != 0 {
			return refuse(msgBillAccountLineCells, label)
		}
		return checkBillAccountLine(tx, r, n)
	}
	return nil
}

// lineTable is the table built-in of the document kind's forms host, among
// its LineTables, whose row kinds hold lineKind; nil when none does.
func lineTable(tx core.App, kind salesDocKind, lineKind string) (*forms.Builtin, error) {
	host := forms.HostFor(tx, kind.HostKey)
	if host == nil {
		return nil, fmt.Errorf("books: the %s forms host is not bound", kind.HostKey)
	}
	for _, key := range kind.LineTables {
		table := host.Builtin(key)
		if table == nil {
			return nil, fmt.Errorf("books: the %s host has no %s built-in", kind.HostKey, key)
		}
		if slices.ContainsFunc(table.RowKinds, func(k forms.RowKind) bool { return k.Key == lineKind }) {
			return table, nil
		}
	}
	return nil, nil
}

// storedLineCells is a stored line's cells keyed as the form keys them, for
// core's row check: a stored line holds its percent in ppm.
func storedLineCells(r *core.Record) map[string]any {
	row := map[string]any{"percent": r.Get("percent_ppm")}
	for _, key := range []string{"kind", "product", "account", "description", "quantity", "rate", "taxable"} {
		row[key] = r.Get(key)
	}
	return row
}

// checkLineProduct refuses a bundle (the form adds a bundle's items, never the
// bundle) and an inactive product when the write chooses it; a line keeps a
// product that became inactive after it was chosen. A product that does not
// exist is the schema's refusal. label names the line (lineRowLabel).
func checkLineProduct(tx core.App, stored, r *core.Record, label string) error {
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
		return refuse(msgLineBundle, label)
	}
	if product.GetBool("inactive") {
		return refuseNamed(msgLineProductInactive, label, product.GetString("name"))
	}
	return nil
}

// checkSalesDocLineDelete allows a line of an editable document (a draft, a
// quote that is not closed) to go when the lines left still have a target for
// every percent line and totals Books can store.
func checkSalesDocLineDelete(tx core.App, kind salesDocKind, line *core.Record) error {
	doc, err := tx.FindRecordById(kind.Collection, line.GetString(kind.ParentField))
	if err != nil {
		return fmt.Errorf("books: read the line's document: %w", err)
	}
	if !kind.isEditableStatus(doc.GetString("status")) {
		return refuse("%s", kind.Msgs.LineNotDraft)
	}
	stored, err := salesDocLines(tx, kind, doc.Id)
	if err != nil {
		return err
	}
	left := slices.DeleteFunc(stored, func(l *core.Record) bool { return l.Id == line.Id })
	totals, err := salesDocTotals(tx, kind, doc, lineInputs(left))
	if err != nil {
		return err
	}
	return checkSalesDocTotals(kind, left, totals)
}

// restateSalesDoc recomputes every line amount and the document's totals from
// its stored lines and header tax, and saves each line whose amount changed
// and the document. An account line's amount is the typed one, so it never
// changes here. The line guard lets the amounts through while the document
// is marked restating; the header guard sets the same totals again.
func restateSalesDoc(tx core.App, kind salesDocKind, docID string) (documentTotalsResult, error) {
	doc, err := tx.FindRecordById(kind.Collection, docID)
	if err != nil {
		return documentTotalsResult{}, fmt.Errorf("books: read the document to restate: %w", err)
	}
	lines, err := salesDocLines(tx, kind, docID)
	if err != nil {
		return documentTotalsResult{}, err
	}
	totals, err := salesDocTotals(tx, kind, doc, lineInputs(lines))
	if err != nil {
		return documentTotalsResult{}, err
	}
	if err := checkSalesDocTotals(kind, lines, totals); err != nil {
		return documentTotalsResult{}, err
	}
	if err := restateLineAmounts(tx, kind, docID, lines, totals); err != nil {
		return documentTotalsResult{}, err
	}
	setSalesDocTotals(kind, doc, totals)
	if err := tx.Save(doc); err != nil {
		return documentTotalsResult{}, err
	}
	return totals, nil
}
