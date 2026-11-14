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

// salesDocKind is one kind of sales document (an invoice, a sales receipt, an
// estimate): the collections it writes, the forms host of its lines, its doc
// type, its lifecycle, its refusal texts and the parts of its guards and
// posting that differ by kind. Every guard and the posting below take a kind;
// invoiceKind (invoices.go), salesReceiptKind (sales_receipts.go) and
// estimateKind (estimates.go) are the kinds.
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
	// HostKey is the forms host whose lines built-in says which cells each
	// kind of line needs (forms/hosts.ts).
	HostKey string
	// CustomerRequired records the schema's rule: the invoice's `customer`
	// relation is required in its migration, the sales receipt's is not. No Go
	// code reads it: the shared guard checks a customer only when one is
	// chosen, and the schema refuses an empty one on an invoice. It mirrors
	// the client kind's `customerRequired` (lib/sales-document-kinds.ts).
	CustomerRequired bool
	Msgs             salesDocMessages
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
	// DebitAccount is the account the posting debits for the total; nil for a
	// quote, which never posts.
	DebitAccount func(tx core.App, doc *core.Record) (string, error)
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
// "sales receipt", "estimate"). The texts every kind shares are constants. On
// a quote, NotDraft, DeleteNotDraft and LineNotDraft are the texts of a closed
// document; ZeroTotal, PostedFromForm and EditMissing are posting texts.
type salesDocMessages struct {
	TotalNegative, TotalTooLarge, TooManyLines, ZeroTotal, PostedFromForm, NotDraft, DeleteNotDraft,
	LineStays, LineNotDraft, LineRestating, LineUnknownKind, EditMissing, CustomerOnDocs string
	// RevisionConflict refuses a save or a post of a document that changed after
	// the caller loaded it (revision.go), with status 409.
	RevisionConflict string
}

// The lines built-in of every sales document host, whose row kinds say which
// cells each kind of line needs.
const salesDocLinesKey = "lines"

// Refusal texts every sales document kind shares. A line's texts start with
// its number; a product's name is kept as typed (refuseNamed).
const (
	msgDocumentDay             = "Enter a date that exists, in the form YYYY-MM-DD."
	msgDocumentDayTooEarly     = "Enter a date in 1900 or later."
	msgDocumentTaxRateInactive = "The tax rate is inactive. Choose an active rate."
	msgLineAmountByBooks       = "Books computes a line's amount."
	msgLineProductInactive     = "Line %d: %s is inactive. Choose an active product or service."
	msgLineBundle              = "Line %d: a bundle is never stored on a line. Pick it again to add its items."
	msgLineTooLarge            = "Line %d: the amount is too large."
	msgLineNoAmountKind        = "Line %d: A %s line has no product or amount."
	msgLineCell                = "Line %d: %s."
	msgLineQuantity            = "Line %d: Enter a quantity more than 0."
	msgLineItemPercent         = "Line %d: An item line has no percent."
	msgLinePercentCells        = "Line %d: A percent line has no quantity or rate."
)

// documentDocTypes are the doc types of the sales documents: their entries come
// only from posting the document (entries.go).
var documentDocTypes = map[string]bool{docTypeInvoice: true, docTypeSalesReceipt: true}

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
	if kind.TaxLinesCollection != "" {
		bindTaxLineGuards(app, kind)
	}
	bindSalesDocDeferral(app, kind)
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
		// The owner of the batch restates the document one time (sales_document_deferral.go).
		if isDeferring(e.App, kind, docID) {
			markDirty(e.App, kind, docID)
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
				if isDeferring(tx, kind, docID) {
					markDirty(tx, kind, docID)
					return nil
				}
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
	// A request that updates a document a person can edit (a draft, a quote
	// that is not closed) states the revision it saw (revision.go). A posting
	// kind also stamps who posted or voided, on the transition only, as
	// entries do: the update rule refuses these fields in a person's body. A
	// quote has neither.
	app.OnRecordUpdateRequest(kind.Collection).BindFunc(func(e *core.RecordRequestEvent) error {
		from, to := e.Record.Original().GetString("status"), e.Record.GetString("status")
		done, err := checkRequestRevision(e, kind.isEditableStatus(from), kind.Msgs.RevisionConflict)
		if err != nil {
			return err
		}
		defer done()
		if kind.Lifecycle == lifecyclePosting && from != to {
			switch to {
			case statusPosted:
				stampActor(e.Record, "posted_by", e.Auth)
			case statusVoid:
				stampActor(e.Record, "voided_by", e.Auth)
			}
		}
		return e.Next()
	})
}

// The marks of a document whose rows Books is writing itself: the restatement
// of its lines' amounts, the cascade of its delete, the void a correction's
// post makes. Each is per doc type and belongs to one transaction
// (txmarks.go), so a write of another request never reads it.
func docMark(kind salesDocKind, what string) string {
	return kind.DocType + "." + what
}

// markRestating marks docID's lines as written by restateSalesDoc, so the line
// guard lets their amounts change; the returned func clears the mark.
func markRestating(tx core.App, kind salesDocKind, docID string) func() {
	return setTxMark(tx, docMark(kind, "restating"), docID)
}

func isRestating(tx core.App, kind salesDocKind, docID string) bool {
	return hasTxMark(tx, docMark(kind, "restating"), docID)
}

func markDeleting(tx core.App, kind salesDocKind, docID string) func() {
	return setTxMark(tx, docMark(kind, "deleting"), docID)
}

// isDeleting is read by a line delete before it opens its own transaction: the
// cascade of a document's delete runs with that delete's transaction app and
// reads the mark; a person's line delete runs with the base app and reads none.
func isDeleting(tx core.App, kind salesDocKind, docID string) bool {
	return hasTxMark(tx, docMark(kind, "deleting"), docID)
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

// refuseDocumentDay refuses a document's day that parseDay refused, under its
// field: a year before 1900 has its own text, because "a date that exists"
// would be false for it.
func refuseDocumentDay(field string, err error) error {
	if isDayTooEarly(err) {
		return refuseField(field, msgDocumentDayTooEarly)
	}
	return refuseField(field, msgDocumentDay)
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
	if err := checkNewSalesDoc(kind, r); err != nil {
		return err
	}
	if err := stampCurrency(tx, r); err != nil {
		return err
	}
	startRevision(tx, kind, r)
	return checkDraftSalesDoc(tx, kind, nil, r)
}

// startRevision gives a new document revision 1, whatever its record carries,
// and records the create for its transaction, so the lines written with it are
// part of the create (revision.go). The create rule refuses the field in a
// person's body.
func startRevision(tx core.App, kind salesDocKind, r *core.Record) {
	r.Set("revision", 1)
	markCreated(tx, kind.Collection, r.Id)
}

// The header fields only Books writes, on the kinds that have them (an
// estimate has no entry and no post). The rules pin them for a person; the
// checks below hold for Go and a superuser too, as checkNewEntry and
// transitionEntry do for a journal entry.
//
// salesDocNewBooksFields must be empty on a new document. number and sequence
// are in the list only for a posting kind: a quote takes them from its
// sequence at create and replaces whatever the record carries.
//
// salesDocKeptBooksFields cannot change while a person edits the document.
// posted_by is not in it: a Go caller names the poster with the post, as for
// an entry. replaces is fixed at create: an invoice's estimate is checked
// against it only then (checkInvoiceEstimate).
var (
	salesDocNewBooksFields  = []string{"entry", "replaced_by", "posted_at", "posted_by", "voided_at", "voided_by", "invoice"}
	salesDocKeptBooksFields = []string{"number", "sequence", "currency", "entry", "replaces", "replaced_by", "posted_at", "voided_at", "voided_by", "invoice"}
)

func checkNewSalesDoc(kind salesDocKind, r *core.Record) error {
	names := salesDocNewBooksFields
	if kind.Lifecycle == lifecyclePosting {
		names = append([]string{"number", "sequence"}, names...)
	}
	var set []string
	for _, name := range names {
		field := r.Collection().Fields.GetByName(name)
		if field == nil {
			continue
		}
		// An empty number field reads "0". Only there is "0" empty: the text
		// field number can hold the text "0".
		empty := ""
		if field.Type() == core.FieldTypeNumber {
			empty = "0"
		}
		if v := r.GetString(name); v != "" && v != empty {
			set = append(set, name)
		}
	}
	return refuseServerFields(set)
}

func checkSalesDocBooksFieldsKept(stored, r *core.Record) error {
	var changed []string
	for _, name := range salesDocKeptBooksFields {
		if r.Collection().Fields.GetByName(name) == nil {
			continue
		}
		if stored.GetString(name) != r.GetString(name) {
			changed = append(changed, name)
		}
	}
	return refuseServerFields(changed)
}

// msgTaxLineByBooks refuses a write of a posted document's tax lines.
const msgTaxLineByBooks = "Books writes a document's tax lines when the document posts."

// markSnapshotting marks docID while writeTaxSnapshot writes its tax lines;
// the returned func clears the mark, which belongs to the posting transaction.
func markSnapshotting(tx core.App, kind salesDocKind, docID string) func() {
	return setTxMark(tx, docMark(kind, "snapshotting"), docID)
}

func isSnapshotting(tx core.App, kind salesDocKind, docID string) bool {
	return hasTxMark(tx, docMark(kind, "snapshotting"), docID)
}

// bindTaxLineGuards keeps the tax lines the posting snapshot: only the post
// creates them, nothing changes one, and one goes only with its document's
// delete. Their rules are null, so no person reaches these hooks; they hold
// for Go. e.App is the caller's app: the post's and the cascade's transaction.
func bindTaxLineGuards(app core.App, kind salesDocKind) {
	app.OnRecordCreate(kind.TaxLinesCollection).BindFunc(func(e *core.RecordEvent) error {
		if !isSnapshotting(e.App, kind, e.Record.GetString(kind.ParentField)) {
			return refuse(msgTaxLineByBooks)
		}
		return e.Next()
	})
	app.OnRecordUpdate(kind.TaxLinesCollection).BindFunc(func(e *core.RecordEvent) error {
		return refuse(msgTaxLineByBooks)
	})
	app.OnRecordDelete(kind.TaxLinesCollection).BindFunc(func(e *core.RecordEvent) error {
		if !isDeleting(e.App, kind, e.Record.GetString(kind.ParentField)) {
			return refuse(msgTaxLineByBooks)
		}
		return e.Next()
	})
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
		// Every draft write, a person's or Books' own save of the totals after
		// a line write, takes the transaction's one increase.
		if err := settleRevision(tx, stored, r, kind.Msgs.RevisionConflict); err != nil {
			return err
		}
		// Books' own save of the totals after a line write: restateSalesDoc
		// computed them from the stored lines and changed no other field.
		if isOwnWrite(tx, kind.Collection, stored.Id) {
			return nil
		}
		if err := checkSalesDocBooksFieldsKept(stored, r); err != nil {
			return err
		}
		return checkDraftSalesDoc(tx, kind, stored, r)
	case from == statusDraft && to == statusPosted:
		if err := settleRevision(tx, stored, r, kind.Msgs.RevisionConflict); err != nil {
			return err
		}
		if err := checkSalesDocBooksFieldsKept(stored, r); err != nil {
			return err
		}
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
// the customer, the tax rate and the address every kind has), sets the sort
// key, and sets the three totals from the stored lines and the header tax.
func checkDraftSalesDoc(tx core.App, kind salesDocKind, stored, r *core.Record) error {
	if err := kind.CheckHeader(tx, stored, r); err != nil {
		return err
	}
	if err := checkSalesDocCustomer(tx, kind, stored, r); err != nil {
		return err
	}
	if err := checkSalesDocTaxRate(tx, stored, r); err != nil {
		return err
	}
	if !isAddress(r.Get("bill_to")) {
		return refuseField("bill_to", msgAddressShape)
	}
	r.Set("sort_key", salesDocSortKey(r))

	lines, err := salesDocLines(tx, kind, r.Id)
	if err != nil {
		return err
	}
	totals, err := salesDocTotals(tx, r, lineInputs(lines))
	if err != nil {
		return err
	}
	if err := checkSalesDocTotals(kind, totals); err != nil {
		return err
	}
	setSalesDocTotals(r, totals)
	return nil
}

// checkSalesDocCustomer refuses an inactive customer when the write chooses it;
// a draft keeps a customer that became inactive after it was chosen, and a
// correction keeps its original's. An empty customer passes: the invoice's
// schema requires one, the sales receipt's does not. A customer that does not
// exist is the schema's refusal.
func checkSalesDocCustomer(tx core.App, kind salesDocKind, stored, r *core.Record) error {
	id := r.GetString("customer")
	if id == "" || (stored != nil && stored.GetString("customer") == id) {
		return nil
	}
	customer, err := tx.FindRecordById("books_customers", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the document's customer: %w", err)
	}
	if !customer.GetBool("inactive") {
		return nil
	}
	keeps, err := keepsCorrectedCustomer(tx, kind, r, id)
	if err != nil || keeps {
		return err
	}
	return refuseNamedField("customer", msgCustomerInactive, customer.GetString("display_name"))
}

// checkSalesDocTaxRate refuses an inactive rate or group when the write
// chooses it, as checkSalesDocCustomer does for the customer.
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

// ownLineAmount is the amount of a line that depends on no other line: an
// item's quantity times its rate. A percent or subtotal line's amount comes
// from the lines before it, so the restatement writes it; until then it is 0.
func ownLineAmount(r *core.Record) int64 {
	totals := documentTotals(lineInputs([]*core.Record{r}), nil, nil)
	if r.GetString("kind") != lineKindItem || !totals.HasAmount[0] {
		return 0
	}
	return totals.Amounts[0]
}

// salesDocTotals runs documentTotals over lines with the document's header
// tax: a rate is its own one component, a group its components in the group's
// order.
func salesDocTotals(tx core.App, doc *core.Record, lines []documentLine) (documentTotalsResult, error) {
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
// past maxAmount and a total below zero or past maxStoredAmount. Line numbers
// count from 1 in the lines' order.
func checkSalesDocTotals(kind salesDocKind, totals documentTotalsResult) error {
	if len(totals.PercentTargetErrors) > 0 {
		return refuse("Line %d: %s", totals.PercentTargetErrors[0]+1, msgPercentTarget)
	}
	for i, amount := range totals.Amounts {
		if totals.HasAmount[i] && (amount > maxAmount || amount < -maxAmount) {
			return refuse(msgLineTooLarge, i+1)
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

func setSalesDocTotals(r *core.Record, totals documentTotalsResult) {
	r.Set("subtotal", totals.Subtotal)
	r.Set("tax_total", totals.TaxTotal)
	r.Set("total", totals.Total)
}

// validateSalesDocLine checks one line write of an editable document (a draft,
// a quote that is not closed): the line stays on its
// document, the document holds at most maxDocumentLines lines, the line's kind
// has its own cells and no others, a product the write chooses is active and
// not a bundle, and the document's lines with this write still have a target
// for every percent line and totals Books can store. It sets the line's
// amount. While restateSalesDoc writes the document's lines, an update that
// changes only the amount passes and any other update is refused. stored is
// the record before an update, nil on a create.
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
	if stored != nil && stored.GetInt("amount") != r.GetInt("amount") {
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

	// In a batch the owner checks the document one time, after the last write
	// (sales_document_deferral.go): this write checks its own line only and
	// reads no other line. The line number is the line's position (the client
	// writes positions with no gap).
	if isDeferring(tx, kind, docID) {
		n := r.GetInt("position") + 1
		if err := checkLineCells(tx, kind, r, n); err != nil {
			return err
		}
		if err := checkLineProduct(tx, stored, r, n); err != nil {
			return err
		}
		r.Set("amount", ownLineAmount(r))
		return nil
	}

	others, err := salesDocLines(tx, kind, docID)
	if err != nil {
		return err
	}
	lines := withLine(others, r)
	index := slices.IndexFunc(lines, func(l *core.Record) bool { return l.Id == r.Id })
	if err := checkLineCells(tx, kind, r, index+1); err != nil {
		return err
	}
	if err := checkLineProduct(tx, stored, r, index+1); err != nil {
		return err
	}
	totals, err := salesDocTotals(tx, doc, lineInputs(lines))
	if err != nil {
		return err
	}
	if err := checkSalesDocTotals(kind, totals); err != nil {
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

// checkLineCells holds a line to its kind. The cells each kind requires (an
// item's and a percent line's product, a description line's description) are
// core's check of the document kind's forms host's row kinds, the same rule
// the form runs; a host that is not bound refuses every line rather than let
// one through unchecked. The rest are Books rules core does not make: an
// item's quantity is more than 0 (PocketBase skips the schema's min for a 0 or
// missing number) and it has no percent; a percent line has no quantity or
// rate; a description or subtotal line has no product, rate or percent. A 0%
// percent line is stored: refusing it is the client's rule. n is the line
// number.
func checkLineCells(tx core.App, kind salesDocKind, r *core.Record, n int) error {
	msg, err := lineRowError(tx, kind, r)
	if err != nil {
		return err
	}
	if msg != "" {
		return refuse(msgLineCell, n, msg)
	}
	lineKind := r.GetString("kind")
	switch lineKind {
	case lineKindItem, lineKindPercent:
		if lineKind == lineKindItem && r.GetFloat("quantity") <= 0 {
			return refuse(msgLineQuantity, n)
		}
		if lineKind == lineKindItem && r.GetInt("percent_ppm") != 0 {
			return refuse(msgLineItemPercent, n)
		}
		if lineKind == lineKindPercent && (r.GetFloat("quantity") != 0 || r.GetInt("rate") != 0) {
			return refuse(msgLinePercentCells, n)
		}
	case lineKindDescription, lineKindSubtotal:
		if r.GetString("product") != "" || r.GetInt("rate") != 0 || r.GetInt("percent_ppm") != 0 {
			return refuse(msgLineNoAmountKind, n, lineKind)
		}
	}
	return nil
}

// lineRowError is core's per-kind required check of the document kind's lines
// built-in over the line's cells, keyed as the form keys them: "" when the
// line has every cell its kind needs. A stored line holds its percent in ppm.
func lineRowError(tx core.App, kind salesDocKind, r *core.Record) (string, error) {
	host := forms.HostFor(tx, kind.HostKey)
	if host == nil {
		return "", fmt.Errorf("books: the %s forms host is not bound", kind.HostKey)
	}
	lines := host.Builtin(salesDocLinesKey)
	if lines == nil {
		return "", fmt.Errorf("books: the %s host has no %s built-in", kind.HostKey, salesDocLinesKey)
	}
	row := map[string]any{"percent": r.Get("percent_ppm")}
	for _, key := range []string{"kind", "product", "description", "quantity", "rate", "taxable"} {
		row[key] = r.Get(key)
	}
	return lines.RowError(row), nil
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
	// The owner checks the lines the batch leaves (sales_document_deferral.go).
	if isDeferring(tx, kind, doc.Id) {
		return nil
	}
	stored, err := salesDocLines(tx, kind, doc.Id)
	if err != nil {
		return err
	}
	left := slices.DeleteFunc(stored, func(l *core.Record) bool { return l.Id == line.Id })
	totals, err := salesDocTotals(tx, doc, lineInputs(left))
	if err != nil {
		return err
	}
	return checkSalesDocTotals(kind, totals)
}

// restateSalesDoc recomputes every line amount and the document's totals from
// its stored lines and header tax, and saves each line whose amount changed
// and the document. The line guard lets the amounts through while the
// document is marked restating; the header guard lets Books' own save through.
func restateSalesDoc(tx core.App, kind salesDocKind, docID string) (documentTotalsResult, error) {
	doc, err := tx.FindRecordById(kind.Collection, docID)
	if err != nil {
		return documentTotalsResult{}, fmt.Errorf("books: read the document to restate: %w", err)
	}
	lines, err := salesDocLines(tx, kind, docID)
	if err != nil {
		return documentTotalsResult{}, err
	}
	totals, err := salesDocTotals(tx, doc, lineInputs(lines))
	if err != nil {
		return documentTotalsResult{}, err
	}
	if err := checkSalesDocTotals(kind, totals); err != nil {
		return documentTotalsResult{}, err
	}
	if err := restateLineAmounts(tx, kind, docID, lines, totals); err != nil {
		return documentTotalsResult{}, err
	}
	setSalesDocTotals(doc, totals)
	// The header guard would read the lines again to set these same totals.
	defer ownWrite(tx, kind.Collection, doc.Id)()
	if err := tx.Save(doc); err != nil {
		return documentTotalsResult{}, err
	}
	return totals, nil
}
