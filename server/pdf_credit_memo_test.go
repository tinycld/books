package books

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The credit memo PDF (spec §3.8): the credit_memo kind prints Credit to (the
// Bill to snapshot), the number, Date, "For invoice 1004" when linked ("For
// invoice 1004 (void)" when that invoice is void), every line kind, the
// subtotal, the tax line, Total and Credit amount, and the message under
// Notes. It never prints the memo, terms or a due date.
//
// The tests reach the builder through documentKinds["credit_memo"], so the
// package compiles before buildCreditMemoDocument and creditMemoFileName
// exist; the kind's FileName is creditMemoFileName.

const (
	creditMemoPDFMessage = "We are sorry about the returned hardware.\nThis credit applies to your next invoice."
	creditMemoPDFMemo    = "Internal: restocking fee waived"
	creditMemoPDFNote    = "Returned unopened."
)

var creditMemoPDFBillTo = map[string]any{
	"line1": "1450 Larimer St", "line2": "Suite 300", "city": "Denver",
	"region": "CO", "postal_code": "80202", "country": "USA",
}

func creditMemoPDFKind(t testing.TB) documentKind {
	t.Helper()
	kind, ok := documentKinds["credit_memo"]
	if !ok {
		t.Fatal(`documentKinds has no "credit_memo" kind`)
	}
	if kind.Collection != "books_credit_memos" || kind.Build == nil || kind.FileName == nil {
		t.Fatalf("credit_memo kind = {Collection %q, Build set %v, FileName set %v}, want books_credit_memos with both set",
			kind.Collection, kind.Build != nil, kind.FileName != nil)
	}
	return kind
}

func buildCreditMemoPDF(t testing.TB, app core.App, id string) pdfDocument {
	t.Helper()
	doc, err := creditMemoPDFKind(t).Build(app, reload(t, app, "books_credit_memos", id))
	if err != nil {
		t.Fatalf("build the credit memo document: %v", err)
	}
	if err := doc.validate(); err != nil {
		t.Fatalf("the credit memo document is invalid: %v", err)
	}
	return doc
}

func creditMemoPDFText(t *testing.T, doc pdfDocument) string {
	t.Helper()
	pdf, _ := render(t, doc, testOrg())
	_, text := extractPDFText(t, pdf)
	return text
}

// linkedInvoice posts a one-line invoice numbered 1004 for the memo's
// customer.
func (ce *creditMemoEnv) linkedInvoice(t testing.TB) *core.Record {
	t.Helper()
	if err := setFields(t, ce.app, "books_doc_sequences", "booksseqinvoice", map[string]any{"next_number": 1004}); err != nil {
		t.Fatalf("start the invoices at 1004: %v", err)
	}
	inv := ce.postedInvoiceFor(t, ce.customer, 200000)
	if inv.GetString("number") != "1004" {
		t.Fatalf("the linked invoice is numbered %q, want 1004", inv.GetString("number"))
	}
	return inv
}

// everyKindMemo saves a draft memo with the Denver group, the printed fields
// and one line of each kind.
func (ce *creditMemoEnv) everyKindMemo(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{
		"tax_rate": ce.denver.Id, "message": creditMemoPDFMessage, "memo": creditMemoPDFMemo,
		"bill_to": creditMemoPDFBillTo,
	}
	for k, v := range fields {
		all[k] = v
	}
	m := ce.mkCreditMemo(t, all)
	for i, line := range []map[string]any{
		item(ce.service, 1, 50000, true),
		item(ce.accessPoint, 2, 18900, true),
		subtotalLine(),
		percentLine(ce.discount, -100000),
		descriptionLine(creditMemoPDFNote),
	} {
		mkCreditMemoLine(t, ce.app, m, i, line)
	}
	return m
}

// requireNeverPrinted holds what no credit memo PDF prints: the memo, terms and
// a due date.
func requireNeverPrinted(t *testing.T, text string) {
	t.Helper()
	for _, never := range []string{creditMemoPDFMemo, "Terms", "Due"} {
		if strings.Contains(text, never) {
			t.Errorf("the rendered PDF prints %q:\n%s", never, text)
		}
	}
}

func TestCreditMemoPDF_PostedLinkedPrintsEveryKindAndCreditAmount(t *testing.T) {
	ce := newCreditMemoEnv(t)
	inv := ce.linkedInvoice(t)
	m := ce.everyKindMemo(t, map[string]any{"invoice": inv.Id})
	posted := mustPostCreditMemo(t, ce.app, m.Id, ce.users.bookkeeper.Id)
	total := int64(posted.GetInt("total"))
	if posted.GetString("number") != "1001" {
		t.Fatalf("the credit memo is numbered %q, want 1001", posted.GetString("number"))
	}

	doc := buildCreditMemoPDF(t, ce.app, m.Id)
	if doc.Number != "1001" || !strings.HasPrefix(doc.Title, "Credit memo") {
		t.Errorf("title %q number %q, want Credit memo and 1001", doc.Title, doc.Number)
	}
	if got, want := fmt.Sprint(doc.Dates), fmt.Sprint([]pdfDate{{Label: "Date", Day: creditMemoDay}}); got != want {
		t.Errorf("dates = %s, want %s (no due date)", got, want)
	}
	if len(doc.Parties) != 1 {
		t.Fatalf("parties = %+v, want one Credit to", doc.Parties)
	}
	party := doc.Parties[0]
	wantAddress := postalAddress{
		Line1: "1450 Larimer St", Line2: "Suite 300", City: "Denver",
		Region: "CO", PostalCode: "80202", Country: "USA",
	}
	if party.Label != "Credit to" || party.Name != "Harborview Dental" || party.Address == nil || *party.Address != wantAddress {
		t.Errorf("party = {%q %q %+v}, want Credit to, Harborview Dental, the snapshot address %+v",
			party.Label, party.Name, party.Address, wantAddress)
	}
	kinds := make([]pdfLineKind, len(doc.Lines))
	for i, l := range doc.Lines {
		kinds[i] = l.Kind
	}
	if got, want := fmt.Sprint(kinds), fmt.Sprint([]pdfLineKind{lineItem, lineItem, lineSubtotal, linePercent, lineDescription}); got != want {
		t.Errorf("line kinds = %s, want %s", got, want)
	}
	if doc.SubtotalCents != int64(posted.GetInt("subtotal")) {
		t.Errorf("subtotal = %d, want the memo's %d", doc.SubtotalCents, posted.GetInt("subtotal"))
	}
	if len(doc.TaxLines) != 1 || doc.TaxLines[0].Name != "Denver combined" || doc.TaxLines[0].AmountCents != int64(posted.GetInt("tax_total")) {
		t.Errorf("tax lines = %+v, want one Denver combined of %d", doc.TaxLines, posted.GetInt("tax_total"))
	}
	if got, want := fmt.Sprint(doc.Totals), fmt.Sprint([]pdfAmount{
		{Label: "Total", Cents: total}, {Label: "Credit amount", Cents: total},
	}); got != want {
		t.Errorf("totals = %s, want %s", got, want)
	}
	if doc.Notes != creditMemoPDFMessage {
		t.Errorf("notes = %q, want the message %q", doc.Notes, creditMemoPDFMessage)
	}
	if got := creditMemoPDFKind(t).FileName(doc); got != "credit-memo-1001" {
		t.Errorf("file name = %q, want credit-memo-1001", got)
	}

	text := creditMemoPDFText(t, doc)
	for _, want := range []string{
		"Credit memo", "1001", "Credit to", "Harborview Dental", "1450 Larimer St", "Denver",
		"Date", "Nov 10, 2026", "For invoice 1004",
		"Monthly bookkeeping", "Wireless access point", "Discount", creditMemoPDFNote,
		"Subtotal", "Denver combined", "Total", "Credit amount", "Notes", "We are sorry about the returned hardware.",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("the rendered PDF has no %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "For invoice 1004 (void)") {
		t.Errorf("the rendered PDF says the posted invoice is void:\n%s", text)
	}
	requireNeverPrinted(t, text)
}

func TestCreditMemoPDF_VoidInvoicePrintsForInvoiceVoid(t *testing.T) {
	ce := newCreditMemoEnv(t)
	inv := ce.linkedInvoice(t)
	m := ce.everyKindMemo(t, map[string]any{"invoice": inv.Id})
	if err := voidInvoiceAs(ce.app, inv.Id, ce.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the linked invoice: %v", err)
	}
	mustPostCreditMemo(t, ce.app, m.Id, ce.users.bookkeeper.Id)

	text := creditMemoPDFText(t, buildCreditMemoPDF(t, ce.app, m.Id))
	if !strings.Contains(text, "For invoice 1004 (void)") {
		t.Errorf("the rendered PDF has no %q:\n%s", "For invoice 1004 (void)", text)
	}
	requireNeverPrinted(t, text)
}

func TestCreditMemoPDF_NoLinkPrintsNoForInvoice(t *testing.T) {
	ce := newCreditMemoEnv(t)
	m := ce.everyKindMemo(t, nil)
	mustPostCreditMemo(t, ce.app, m.Id, ce.users.bookkeeper.Id)

	text := creditMemoPDFText(t, buildCreditMemoPDF(t, ce.app, m.Id))
	if strings.Contains(text, "For invoice") {
		t.Errorf("the rendered PDF of an unlinked memo prints For invoice:\n%s", text)
	}
	requireNeverPrinted(t, text)
}

func TestCreditMemoPDF_EmptyMessagePrintsNoNotes(t *testing.T) {
	ce := newCreditMemoEnv(t)
	m := ce.everyKindMemo(t, map[string]any{"message": ""})
	doc := buildCreditMemoPDF(t, ce.app, m.Id)
	if doc.Notes != "" {
		t.Errorf("notes = %q, want none", doc.Notes)
	}
	text := creditMemoPDFText(t, doc)
	if strings.Contains(text, "Notes") {
		t.Errorf("the rendered PDF prints Notes with an empty message:\n%s", text)
	}
	requireNeverPrinted(t, text)
}

func TestCreditMemoPDF_DraftHasNoNumber(t *testing.T) {
	ce := newCreditMemoEnv(t)
	m := ce.everyKindMemo(t, nil)
	doc := buildCreditMemoPDF(t, ce.app, m.Id)
	if doc.Title != "Draft credit memo" || doc.Number != "" {
		t.Errorf("title %q number %q, want Draft credit memo and no number", doc.Title, doc.Number)
	}
	if got := creditMemoPDFKind(t).FileName(doc); got != "draft-credit-memo" {
		t.Errorf("file name = %q, want draft-credit-memo", got)
	}
	text := creditMemoPDFText(t, doc)
	if !strings.Contains(text, "Draft credit memo") || strings.Contains(text, "No.") {
		t.Errorf("the rendered draft PDF must print Draft credit memo and no number:\n%s", text)
	}
	requireNeverPrinted(t, text)
}

func TestCreditMemoPDF_VoidSaysVoidInTheTitle(t *testing.T) {
	ce := newCreditMemoEnv(t)
	actor := ce.users.bookkeeper.Id
	m := ce.everyKindMemo(t, nil)
	mustPostCreditMemo(t, ce.app, m.Id, actor)
	if err := voidCreditMemoAs(ce.app, m.Id, actor); err != nil {
		t.Fatalf("void the credit memo: %v", err)
	}
	doc := buildCreditMemoPDF(t, ce.app, m.Id)
	if doc.Title != "Credit memo 1001 (void)" {
		t.Errorf("title = %q, want Credit memo 1001 (void)", doc.Title)
	}
	text := creditMemoPDFText(t, doc)
	if !strings.Contains(text, "Credit memo 1001 (void)") {
		t.Errorf("the rendered PDF has no %q:\n%s", "Credit memo 1001 (void)", text)
	}
	requireNeverPrinted(t, text)
}
