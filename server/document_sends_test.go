package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/dbutils"
)

// Email-share spec §4.2: one books_document_sends row for each sent email. Only
// the send route writes it, as the app; a Books reader reads it; the delete of
// its customer, of an estimate or of a draft document takes it away; its audit
// row files it under its document.

const (
	sendsURL         = "/api/collections/books_document_sends/records"
	sendTestTo       = "billing@harborview-dental.test"
	sendTestSubject  = "Invoice 1001 from Harborview Bookkeeping LLC"
	sendTestBody     = "<p>Hello Harborview Dental,</p><p>Attached is invoice 1001.</p>"
	sendTestBodyText = "Hello Harborview Dental,\n\nAttached is invoice 1001."
)

// Each kind a send names, with its email words, as server/testdata/
// send_doc_types.json lists them; tests/send-doc-types.test.ts reads the same
// file against lib/send-doc-types.ts, so the two sides cannot drift.
func TestSendDocTypes_MatchTheSharedFile(t *testing.T) {
	raw, err := os.ReadFile("testdata/send_doc_types.json")
	if err != nil {
		t.Fatalf("read the shared send kinds: %v", err)
	}
	var file struct {
		Kinds []struct {
			Kind  string `json:"kind"`
			Title string `json:"title"`
			Noun  string `json:"noun"`
		} `json:"kinds"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("parse the shared send kinds: %v", err)
	}
	if len(file.Kinds) == 0 {
		t.Fatal("the shared send kinds are empty")
	}
	listed := map[string]bool{}
	for _, k := range file.Kinds {
		listed[k.Kind] = true
		if !sendDocTypes[k.Kind] {
			t.Errorf("sendDocTypes has no %q", k.Kind)
		}
		words, ok := documentEmailWords[k.Kind]
		if !ok || words.title != k.Title || words.noun != k.Noun {
			t.Errorf("documentEmailWords[%q] = {%q, %q} (set %v), want {%q, %q}", k.Kind, words.title, words.noun, ok, k.Title, k.Noun)
		}
	}
	for kind := range sendDocTypes {
		if !listed[kind] {
			t.Errorf("sendDocTypes has %q, which the shared file does not list", kind)
		}
	}
	for kind := range documentEmailWords {
		if !listed[kind] {
			t.Errorf("documentEmailWords has %q, which the shared file does not list", kind)
		}
	}
}

// sendsEnv is an app wired by Register, as production wires it, with the
// generated invoice and estimate form hosts bound in one call (the line guards
// read their row kinds; core keeps one set of bound hosts per app), one user
// per Books level, Harborview Dental and the product its invoices bill.
type sendsEnv struct {
	*invoiceEnv
}

func newSendsEnv(t *testing.T) *sendsEnv {
	t.Helper()
	app, _ := newRegisteredApp(t)
	bindHostsByKey(t, app, invoiceKind.HostKey, estimateKind.HostKey)
	env := ledgerEnvOn(t, app)
	// Not invoiceEnvOn: it binds the invoice host a second time.
	service, err := newProduct(app, map[string]any{
		"type": "service", "name": "Monthly bookkeeping", "taxable": true, "income_account": env.revenue.Id,
	})
	if err != nil {
		t.Fatalf("save product Monthly bookkeeping: %v", err)
	}
	return &sendsEnv{invoiceEnv: &invoiceEnv{
		ledgerEnv: env,
		customer:  mkCustomer(t, app, "Harborview Dental", ""),
		service:   service,
	}}
}

// sendFields is a full send row of docType and documentID for customer.
func (se *sendsEnv) sendFields(docType, documentID string, customer *core.Record) map[string]any {
	return map[string]any{
		"doc_type":  docType,
		"document":  documentID,
		"number":    "1001",
		"customer":  customer.Id,
		"to":        sendTestTo,
		"cc":        "office@harborview-dental.test, owner@harborview-dental.test",
		"subject":   sendTestSubject,
		"body":      sendTestBody,
		"body_text": sendTestBodyText,
		"sent_by":   se.users.bookkeeper.Id,
	}
}

// mkSend saves a send row as the app, as the send route does.
func (se *sendsEnv) mkSend(t testing.TB, docType, documentID string, customer *core.Record) *core.Record {
	t.Helper()
	return saveRecord(t, se.app, documentSendsCollection, se.sendFields(docType, documentID, customer))
}

func (se *sendsEnv) mkPendingEstimate(t testing.TB) *core.Record {
	t.Helper()
	r, err := saveNew(se.app, "books_estimates", map[string]any{
		"customer": se.customer.Id, "status": "pending", "date": estimateTestDay,
	})
	if err != nil {
		t.Fatalf("save a pending estimate: %v", err)
	}
	return r
}

func (se *sendsEnv) mkPostedInvoice(t testing.TB) *core.Record {
	t.Helper()
	inv := se.mkInvoice(t, map[string]any{"memo": "October network work"})
	mkInvoiceLine(t, se.app, inv, 0, item(se.service, 1, 45000, false))
	return mustPostInvoice(t, se.app, inv.Id, se.users.bookkeeper.Id)
}

func sendExists(t testing.TB, app core.App, id string) bool {
	t.Helper()
	_, err := app.FindRecordById(documentSendsCollection, id)
	return err == nil
}

// createSendThroughRequest saves a send row through the create-request hook
// chain as user, as the send route does, so the audit hook bound there writes
// the row's "created" audit row.
func createSendThroughRequest(t testing.TB, app core.App, user *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId(documentSendsCollection)
	if err != nil {
		t.Fatalf("find %s: %v", documentSendsCollection, err)
	}
	record := core.NewRecord(col)
	for k, v := range fields {
		record.Set(k, v)
	}
	re := &core.RequestEvent{App: app, Auth: user}
	re.Request = httptest.NewRequest(http.MethodPost, "/api/books/documents/send", nil)
	re.Response = httptest.NewRecorder()
	event := &core.RecordRequestEvent{RequestEvent: re, Collection: col, Record: record}
	err = app.OnRecordCreateRequest(documentSendsCollection).Trigger(event, func(e *core.RecordRequestEvent) error {
		return e.App.Save(e.Record)
	})
	if err != nil {
		t.Fatalf("create the send through the request hooks: %v", err)
	}
	return record
}

// Spec §4.2: the collection takes a row with every field, as the app.
func TestDocumentSends_TakesARowWithEveryField(t *testing.T) {
	se := newSendsEnv(t)
	invoice := se.mkPostedInvoice(t)
	saved := se.mkSend(t, "invoice", invoice.Id, se.customer)
	stored := reload(t, se.app, documentSendsCollection, saved.Id)
	for field, want := range se.sendFields("invoice", invoice.Id, se.customer) {
		if got := stored.GetString(field); got != want {
			t.Errorf("%s = %q, want %q", field, got, want)
		}
	}
	if stored.GetDateTime("created").IsZero() {
		t.Errorf("created is empty, want the send time")
	}
}

// Spec §4.2: the schema refuses a kind outside the five, an empty document or
// To, a subject above 300 and a body above 50 000 characters.
func TestDocumentSends_SchemaRefusesBadRows(t *testing.T) {
	se := newSendsEnv(t)
	invoice := se.mkPostedInvoice(t)
	cases := []struct {
		field string
		value any
	}{
		{"doc_type", "bill"},
		{"document", ""},
		{"to", ""},
		{"subject", strings.Repeat("s", 301)},
		{"body", strings.Repeat("b", 50_001)},
	}
	for _, tc := range cases {
		t.Run(tc.field, func(t *testing.T) {
			fields := se.sendFields("invoice", invoice.Id, se.customer)
			fields[tc.field] = tc.value
			_, err := saveNew(se.app, documentSendsCollection, fields)
			requireSchemaRefusal(t, err, tc.field)
		})
	}
	// The control: each boundary value one step inside saves.
	fields := se.sendFields("refund_receipt", invoice.Id, se.customer)
	fields["subject"] = strings.Repeat("s", 300)
	fields["body"] = strings.Repeat("b", 50_000)
	if _, err := saveNew(se.app, documentSendsCollection, fields); err != nil {
		t.Errorf("a refund_receipt send with a 300-character subject and a 50 000-character body: %v, want saved", err)
	}
	if n, _ := se.app.CountRecords(documentSendsCollection); n != 1 {
		t.Errorf("%d send rows, want only the control's 1", n)
	}
}

// Spec §4.2 rules: list and view for a Books reader; no create, update or
// delete rule, so a Books writer's request is refused.
func TestDocumentSends_ReadersReadAndNobodyWrites(t *testing.T) {
	se := newSendsEnv(t)
	invoice := se.mkPostedInvoice(t)
	send := se.mkSend(t, "invoice", invoice.Id, se.customer)
	reader := tokenFor(t, se.users.readOnly)
	none := tokenFor(t, se.users.none)
	writer := tokenFor(t, se.users.bookkeeper)
	serveCalls(t, se.app, func(do func(apiReq) callResult) {
		if got := do(get(sendsURL, "", reader)).list(t); got.TotalItems != 1 || len(got.Items) != 1 ||
			stringOf(t, got.Items[0], "id") != send.Id {
			t.Errorf("a Books reader's list: totalItems %d, %d items, want the one send", got.TotalItems, len(got.Items))
		}
		if res := do(get(sendsURL+"/"+send.Id, "", reader)); res.status != http.StatusOK || !strings.Contains(res.body, send.Id) {
			t.Errorf("a Books reader's view: status %d, want 200 with the send; body: %.200s", res.status, res.body)
		}
		if got := do(get(sendsURL, "", none)).list(t); got.TotalItems != 0 || len(got.Items) != 0 {
			t.Errorf("a user with no Books access: totalItems %d, %d items, want 0", got.TotalItems, len(got.Items))
		}

		body := fmt.Sprintf(`{"doc_type":"invoice","document":%q,"customer":%q,"to":"x@harborview-dental.test"}`, invoice.Id, se.customer.Id)
		if res := do(apiReq{method: http.MethodPost, url: sendsURL, token: writer, body: body}); res.status != http.StatusForbidden {
			t.Errorf("a writer's create: status %d, want 403; body: %.200s", res.status, res.body)
		}
		patch := apiReq{method: http.MethodPatch, url: sendsURL + "/" + send.Id, token: writer, body: `{"to":"changed@harborview-dental.test"}`}
		if res := do(patch); res.status != http.StatusForbidden {
			t.Errorf("a writer's update: status %d, want 403; body: %.200s", res.status, res.body)
		}
		if res := do(apiReq{method: http.MethodDelete, url: sendsURL + "/" + send.Id, token: writer}); res.status != http.StatusForbidden {
			t.Errorf("a writer's delete: status %d, want 403; body: %.200s", res.status, res.body)
		}
	})
	if n, _ := se.app.CountRecords(documentSendsCollection); n != 1 {
		t.Errorf("%d send rows after the refused writes, want 1", n)
	}
	if got := reload(t, se.app, documentSendsCollection, send.Id).GetString("to"); got != sendTestTo {
		t.Errorf("to = %q after the refused update, want %q", got, sendTestTo)
	}
}

// Spec §4.2: the sent line reads a document's sends by kind and id, newest
// first, through the index (doc_type, document, created).
func TestDocumentSends_HasTheDocumentIndex(t *testing.T) {
	app := newBooksApp(t)
	col, err := app.FindCollectionByNameOrId(documentSendsCollection)
	if err != nil {
		t.Fatalf("find %s: %v", documentSendsCollection, err)
	}
	var found []string
	for _, raw := range col.Indexes {
		index := dbutils.ParseIndex(raw)
		names := make([]string, len(index.Columns))
		for i, c := range index.Columns {
			names[i] = c.Name
		}
		found = append(found, strings.Join(names, ","))
		if strings.Join(names, ",") == "doc_type,document,created" {
			return
		}
	}
	t.Errorf("%s indexes cover %q, want one on (doc_type, document, created)", documentSendsCollection, found)
}

// Spec §4.2: customer is a cascade-delete relation.
func TestDocumentSends_ACustomerDeleteTakesItsSends(t *testing.T) {
	se := newSendsEnv(t)
	gone := mkCustomer(t, se.app, "Lakewood Optometry", "")
	goneSend := se.mkSend(t, "invoice", "lakewoodinv0001", gone)
	kept := se.mkSend(t, "invoice", "harborview00001", se.customer)
	if err := se.app.Delete(reload(t, se.app, "books_customers", gone.Id)); err != nil {
		t.Fatalf("delete the customer: %v", err)
	}
	if sendExists(t, se.app, goneSend.Id) {
		t.Errorf("the deleted customer's send %s is still stored", goneSend.Id)
	}
	if !sendExists(t, se.app, kept.Id) {
		t.Errorf("another customer's send %s was deleted", kept.Id)
	}
}

// Spec §4.2: the delete of an estimate and of a draft document deletes its
// sends; the sends of another document, or of another kind with the same id,
// stay.
func TestDocumentSends_ADocumentDeleteTakesItsSends(t *testing.T) {
	t.Run("estimate", func(t *testing.T) {
		se := newSendsEnv(t)
		estimate := se.mkPendingEstimate(t)
		other := se.mkPendingEstimate(t)
		first := se.mkSend(t, "estimate", estimate.Id, se.customer)
		second := se.mkSend(t, "estimate", estimate.Id, se.customer)
		otherSend := se.mkSend(t, "estimate", other.Id, se.customer)
		sameIDOtherKind := se.mkSend(t, "invoice", estimate.Id, se.customer)
		if err := se.app.Delete(reload(t, se.app, "books_estimates", estimate.Id)); err != nil {
			t.Fatalf("delete the estimate: %v", err)
		}
		for _, id := range []string{first.Id, second.Id} {
			if sendExists(t, se.app, id) {
				t.Errorf("the deleted estimate's send %s is still stored", id)
			}
		}
		for name, id := range map[string]string{"another estimate's": otherSend.Id, "an invoice send with the same id": sameIDOtherKind.Id} {
			if !sendExists(t, se.app, id) {
				t.Errorf("%s send %s was deleted", name, id)
			}
		}
	})
	t.Run("draft invoice", func(t *testing.T) {
		se := newSendsEnv(t)
		draft := se.mkInvoice(t, nil)
		other := se.mkInvoice(t, nil)
		draftSend := se.mkSend(t, "invoice", draft.Id, se.customer)
		otherSend := se.mkSend(t, "invoice", other.Id, se.customer)
		sameIDOtherKind := se.mkSend(t, "estimate", draft.Id, se.customer)
		if err := se.app.Delete(reload(t, se.app, "books_invoices", draft.Id)); err != nil {
			t.Fatalf("delete the draft invoice: %v", err)
		}
		if sendExists(t, se.app, draftSend.Id) {
			t.Errorf("the deleted draft's send %s is still stored", draftSend.Id)
		}
		for name, id := range map[string]string{"another invoice's": otherSend.Id, "an estimate send with the same id": sameIDOtherKind.Id} {
			if !sendExists(t, se.app, id) {
				t.Errorf("%s send %s was deleted", name, id)
			}
		}
	})
}

// Plan decision 2: the audit view files a send's row under its document, by
// the send's doc_type, and the row opens the document's history. The row's
// label names the sent document (documentSendLabel): its kind and number, or
// the kind word alone when the send has no number.
func TestDocumentSends_AuditRowIsFiledUnderItsDocument(t *testing.T) {
	if got := auditParentFields[documentSendsCollection]; got != "document" {
		t.Errorf("auditParentFields[%s] = %q, want \"document\"", documentSendsCollection, got)
	}
	se := newSendsEnv(t)
	invoice := se.mkPostedInvoice(t)
	estimate := se.mkPendingEstimate(t)
	unnumbered := se.mkPendingEstimate(t)
	for _, tc := range []struct {
		name, docType, collection, number, label string
		document                                 *core.Record
	}{
		{"invoice", "invoice", "books_invoices", "1004", "Invoice 1004", invoice},
		{"estimate", "estimate", "books_estimates", "1007", "Estimate 1007", estimate},
		{"no number", "estimate", "books_estimates", "", "Estimate", unnumbered},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fields := se.sendFields(tc.docType, tc.document.Id, se.customer)
			fields["number"] = tc.number
			send := createSendThroughRequest(t, se.app, se.users.bookkeeper, fields)
			var rows []*core.Record
			waitFor(t, func() bool {
				found, err := se.app.FindRecordsByFilter(auditLogView, "record_id = {:id}", "", 0, 0, dbx.Params{"id": send.Id})
				rows = found
				return err == nil && len(rows) > 0
			})
			if len(rows) != 1 {
				t.Fatalf("%d audit rows for the send, want 1", len(rows))
			}
			row := rows[0]
			if got := row.GetString("record_type"); got != documentSendsCollection {
				t.Errorf("record_type = %q, want %q", got, documentSendsCollection)
			}
			if got := row.GetString("record_label"); got != tc.label {
				t.Errorf("record_label = %q, want %q", got, tc.label)
			}
			requireParents(t, row, tc.collection, tc.document.Id, tc.collection, tc.document.Id)
		})
	}
}
