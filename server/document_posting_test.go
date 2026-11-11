package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// A document's journal entry (origin document) is created, posted and voided
// only by its document's Go hooks. Over REST a person cannot create one, change
// its status, or reverse or replace it; a Go postDocument does all three.

// documentEnv is an invoice env with an A/R account and one entry that a Go
// postDocument posted for a draft invoice: invoice 1001, A/R debit and income
// credit of 45000, both naming the customer.
type documentEnv struct {
	*invoiceEnv
	receivable *core.Record
	invoice    *core.Record
	entry      *core.Record
}

func newDocumentEnv(t *testing.T) *documentEnv {
	t.Helper()
	ie := newInvoiceEnv(t)
	de := &documentEnv{
		invoiceEnv: ie,
		receivable: mkNumberedAccount(t, ie.app, "Receivables", "1200", "accounts_receivable", "accounts_receivable"),
		invoice:    ie.mkInvoice(t, nil),
	}
	entry, err := postDocument(ie.app, de.post(de.invoice.Id, "", 45000))
	if err != nil {
		t.Fatalf("postDocument: %v", err)
	}
	de.entry = entry
	return de
}

func (de *documentEnv) post(documentID, replaces string, amount int64) documentPost {
	return documentPost{
		DocType:    docTypeInvoice,
		DocumentID: documentID,
		Date:       "2026-11-04",
		Memo:       "Posted from Go",
		Actor:      de.users.bookkeeper.Id,
		Customer:   de.customer.Id,
		Replaces:   replaces,
		Lines: []postingLine{
			{Account: de.receivable.Id, Debit: amount},
			{Account: de.revenue.Id, Credit: amount},
		},
	}
}

func mkSuperuser(t testing.TB, app core.App) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatalf("find superusers: %v", err)
	}
	su := core.NewRecord(col)
	su.SetEmail("root@books.test")
	su.SetPassword("Superuser1234!")
	if err := app.Save(su); err != nil {
		t.Fatalf("save superuser: %v", err)
	}
	return su
}

func messageContent(msg string) []string {
	return []string{fmt.Sprintf(`"message":%q`, msg)}
}

// A Go postDocument creates the entry with origin document, posts it, and
// replaces a document entry with a correction; a Go void of it passes too.
func TestPostDocument_GoPassesTheDocumentGuards(t *testing.T) {
	de := newDocumentEnv(t)
	e := reload(t, de.app, "books_journal_entries", de.entry.Id)
	if got, want := [5]string{e.GetString("status"), e.GetString("doc_type"), e.GetString("origin"), e.GetString("document"), e.GetString("number")},
		[5]string{statusPosted, "invoice", "document", de.invoice.Id, "1001"}; got != want {
		t.Errorf("entry status/doc_type/origin/document/number = %v, want %v", got, want)
	}
	if e.GetString("posted_by") != de.users.bookkeeper.Id || e.GetString("created_by") != de.users.bookkeeper.Id {
		t.Errorf("entry posted_by %q created_by %q, want the actor", e.GetString("posted_by"), e.GetString("created_by"))
	}
	want := []entryLine{
		{account: de.receivable.Id, debit: 45000, customer: de.customer.Id},
		{account: de.revenue.Id, credit: 45000, customer: de.customer.Id},
	}
	if got := entryLinesOf(t, de.app, e.Id); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entry lines = %v, want %v", got, want)
	}

	second := de.mkInvoice(t, nil)
	corrected, err := postDocument(de.app, de.post(second.Id, de.entry.Id, 50000))
	if err != nil {
		t.Fatalf("postDocument of a correction: %v", err)
	}
	if corrected.GetString("number") != "1001" || corrected.GetString("replaces") != de.entry.Id || corrected.GetString("status") != statusPosted {
		t.Errorf("correction number %q replaces %q status %q, want 1001, the first entry, posted",
			corrected.GetString("number"), corrected.GetString("replaces"), corrected.GetString("status"))
	}
	if s := reload(t, de.app, "books_journal_entries", de.entry.Id).GetString("status"); s != statusVoid {
		t.Errorf("the replaced entry's status %q, want void", s)
	}

	if err := setStatus(de.app, corrected.Id, statusVoid, de.users.bookkeeper.Id); err != nil {
		t.Fatalf("a Go void of a document entry was refused: %v", err)
	}
	requireNoDrift(t, de.app)
}

// Each subtest has its own app: apiReq allows one call per app.
func TestDocumentEntry_RESTGuards(t *testing.T) {
	// A superuser's request skips the collection's createRule (which refuses the
	// body for anyone else) but still runs the request hook, so only the hook's
	// own refusal can stop it.
	t.Run("creating an entry with origin document is refused", func(t *testing.T) {
		de := newDocumentEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_journal_entries/records",
			token: tokenFor(t, mkSuperuser(t, de.app)),
			body: fmt.Sprintf(`{"date":"2026-11-05","status":"draft","doc_type":"invoice","origin":"document","document":%q}`,
				de.invoice.Id),
			want: http.StatusBadRequest,
			// The text ends with a period already, so PocketBase adds none.
			content: messageContent(msgDocumentEntryByBooks),
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_journal_entries", dbx.HashExp{"origin": "document"}); n != 1 {
					t.Errorf("%d document entries, want only the Go-posted one", n)
				}
			},
		}.run(t, de.app)
	})

	t.Run("voiding a document entry is refused", func(t *testing.T) {
		de := newDocumentEnv(t)
		apiReq{
			method: http.MethodPatch, url: "/api/collections/books_journal_entries/records/" + de.entry.Id,
			token: tokenFor(t, de.users.bookkeeper), body: `{"status":"void"}`,
			want:    http.StatusBadRequest,
			content: messageContent("Invoice 1001 is posted and voided from its invoice."),
			after: func(t testing.TB, app *tests.TestApp) {
				if s := reload(t, app, "books_journal_entries", de.entry.Id).GetString("status"); s != statusPosted {
					t.Errorf("the document entry's status %q after the refusal, want posted", s)
				}
				if rev, err := postedReversalOf(app, de.entry.Id); err != nil || rev != nil {
					t.Errorf("a reversal of the document entry exists (%v, err %v), want none", rev, err)
				}
			},
		}.run(t, de.app)
	})

	for name, body := range map[string]string{
		"a reversal draft naming a document entry is refused":   `{"date":"2026-11-05","status":"draft","doc_type":"journal","origin":"reversal","reverses":%q}`,
		"a correction draft naming a document entry is refused": `{"date":"2026-11-05","status":"draft","doc_type":"journal","origin":"manual","replaces":%q}`,
	} {
		t.Run(name, func(t *testing.T) {
			de := newDocumentEnv(t)
			before, _ := de.app.CountRecords("books_journal_entries")
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_journal_entries/records",
				token: tokenFor(t, de.users.bookkeeper), body: fmt.Sprintf(body, de.entry.Id),
				want:    http.StatusBadRequest,
				content: messageContent("Invoice 1001 is changed from its invoice: use Edit or Void there."),
				after: func(t testing.TB, app *tests.TestApp) {
					if n, _ := app.CountRecords("books_journal_entries"); n != before {
						t.Errorf("%d entries after the refusal, want %d", n, before)
					}
				},
			}.run(t, de.app)
		})
	}
}
