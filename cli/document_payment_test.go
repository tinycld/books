package cli

import (
	"fmt"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// received is the sales book with payments: one draft with one application and
// one posted with two.
func received(t *testing.T) *fakeBooks {
	t.Helper()
	f := sales(t)
	f.addRow("books_payments", "paydraft0000001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-04", "amount": cents(4000), "status": "draft",
	})
	f.addRow("books_payment_applications", "payapply0000001", map[string]any{
		"payment": "paydraft0000001", "position": cents(0), "invoice": "invposted000001", "amount": cents(4000),
	})
	f.addRow("books_payments", "payposted000001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-04", "amount": cents(35000), "payment_method": "check", "reference_no": "2210",
		"deposit_to": "acctchecking001", "status": "posted", "number": "1001", "applied": cents(35000), "entry": "entryinvoice001",
	})
	f.addRow("books_payment_applications", "payapply0000002", map[string]any{
		"payment": "payposted000001", "position": cents(0), "invoice": "invposted000001", "amount": cents(30000),
	})
	f.addRow("books_payment_applications", "payapply0000003", map[string]any{
		"payment": "payposted000001", "position": cents(1), "invoice": "invdraft0000001", "amount": cents(5000),
	})
	return f
}

const newPayment = `{"customer": "custacme0000001", "date": "2026-11-04", "amount": 35000, "payment_method": "check", "reference_no": "2210", "applications": [
	{"invoice": "invposted000001", "amount": 30000},
	{"invoice": "invdraft0000001", "amount": 5000}]}`

// The batch of `payments add --post`. A payment has no revision, so its post
// states none. server/cli_payments_test.go sends a copy.
func TestPaymentAddSendsItsApplicationsAndPostsWithNoRevision(t *testing.T) {
	f := received(t)
	fixedIDs(t, "paynew000000001")
	out, errOut, err := runCmd(t, f.serve(), newPayment, "books", "payments", "add", "--input", "-", "--post", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_payments/records","body":{"amount":35000,"customer":"custacme0000001","date":"2026-11-04","id":"paynew000000001","payment_method":"check","reference_no":"2210","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_payment_applications/records","body":{"amount":30000,"invoice":"invposted000001","payment":"paynew000000001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_payment_applications/records","body":{"amount":5000,"invoice":"invdraft0000001","payment":"paynew000000001","position":1}},` +
		`{"method":"PATCH","url":"/api/collections/books_payments/records/paynew000000001","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"applications": [`) || strings.Contains(out, `"lines"`) || strings.Contains(out, `"revision"`) {
		t.Errorf("the printed payment:\n%s", out)
	}
	if !strings.Contains(errOut, "added and posted payment") {
		t.Errorf("stderr = %q", errOut)
	}
}

func TestPaymentShowAndEntry(t *testing.T) {
	f := received(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "payments", "show", "payposted000001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"amount": 35000,`, `"applied": 35000,`, `"credited": 0,`, `"invoice": "invposted000001"`, `"amount": 5000`} {
		if !strings.Contains(out, want) {
			t.Errorf("the payment has no %s:\n%s", want, out)
		}
	}
	entry, _, err := runCmd(t, f.serve(), "", "books", "payments", "entry", "payposted000001", "--json")
	if err != nil || !strings.Contains(entry, `"id": "entryinvoice001"`) {
		t.Errorf("entry (%v):\n%s", err, entry)
	}
	root := newTestRoot(nil)
	group, _, err := root.Find([]string{"books", "payments"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), ","); got != "add,delete,edit,entry,list,post,show,void" {
		t.Errorf("commands = %s", got)
	}
}

// A draft payment is changed with no revision. An input with only rows writes
// only rows; an input with only header fields writes only the header.
func TestPaymentEditOfADraftStatesNoRevision(t *testing.T) {
	f := received(t)
	fixedIDs(t)
	if _, _, err := runCmd(t, f.serve(), `{"amount": 6000, "applications": [{"invoice": "invposted000001", "amount": 6000}]}`, "books", "payments", "edit", "paydraft0000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"PATCH","url":"/api/collections/books_payment_applications/records/payapply0000001","body":{"amount":6000,"invoice":"invposted000001","position":0}},` +
		`{"method":"PATCH","url":"/api/collections/books_payments/records/paydraft0000001","body":{"amount":6000}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if _, _, err := runCmd(t, f.serve(), `{"applications": []}`, "books", "payments", "edit", "paydraft0000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if got := sentBatch(t, f, 1); !strings.HasPrefix(got, `[{"method":"DELETE","url":"/api/collections/books_payment_applications/records/`) || strings.Contains(got, "PATCH") || strings.Contains(got, "POST") {
		t.Errorf("an edit of only the rows:\n%s", got)
	}
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Changed"}`, "books", "payments", "edit", "paydraft0000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := sentBatch(t, f, 2), `[{"method":"PATCH","url":"/api/collections/books_payments/records/paydraft0000001","body":{"memo":"Changed"}}]`; got != want {
		t.Errorf("an edit of only the header:\n%s\nwant:\n%s", got, want)
	}
}

func TestPaymentPostVoidAndCorrection(t *testing.T) {
	f := received(t)
	if _, _, err := runCmd(t, f.serve(), "", "books", "payments", "post", "paydraft0000001", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := mustJSON(f.lastPatch), `{"status":"posted"}`; got != want {
		t.Errorf("post sent %s, want %s", got, want)
	}
	if _, _, err := runCmd(t, f.serve(), "", "books", "payments", "void", "payposted000001", "--yes", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := mustJSON(f.lastPatch), `{"status":"void"}`; got != want {
		t.Errorf("void sent %s, want %s", got, want)
	}
	f = received(t)
	fixedIDs(t, "paynew000000001")
	if _, _, err := runCmd(t, f.serve(), `{"amount": 36000}`, "books", "payments", "edit", "payposted000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_payments/records","body":{"amount":36000,"customer":"custacme0000001","date":"2026-11-04","deposit_to":"acctchecking001","id":"paynew000000001","memo":"","payment_method":"check","reference_no":"2210","replaces":"payposted000001","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_payment_applications/records","body":{"amount":30000,"invoice":"invposted000001","payment":"paynew000000001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_payment_applications/records","body":{"amount":5000,"invoice":"invdraft0000001","payment":"paynew000000001","position":1}},` +
		`{"method":"PATCH","url":"/api/collections/books_payments/records/paynew000000001","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the correction:\n%s\nwant:\n%s", got, want)
	}
}

func TestPaymentInputIsCheckedBeforeItIsSent(t *testing.T) {
	f := received(t)
	rows := make([]string, 501)
	for i := range rows {
		rows[i] = `{"invoice": "invposted000001", "amount": 1}`
	}
	cases := []struct{ input, want string }{
		{`{"date": "2026-11-04", "amount": 1}`, `"customer" is required`},
		{`{"customer": "custacme0000001", "date": "2026-11-04", "applications": [{"amount": 1}]}`, `applications[0]: "invoice" is required`},
		{`{"customer": "custacme0000001", "date": "2026-11-04", "applications": [{"invoice": "invposted000001", "payment": "x"}]}`, `applications[0]: applications has no field "payment"`},
		{`{"customer": "custacme0000001", "date": "2026-11-04", "lines": []}`, `payments has no field "lines"`},
		{`{"customer": "custacme0000001", "date": "2026-11-04", "applied": 1}`, `"applied" is set by the server`},
		{`{"customer": "custacme0000001", "date": "2026-11-04", "revision": 1}`, `payments has no field "revision"`},
		{`{"customer": "custacme0000001", "date": "2026-11-04", "applications": [` + strings.Join(rows, ",") + `]}`, `"applications" has 501 rows: the most is 500`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "payments", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%.80s: exit = %d, err = %v, want %q", tc.input, got, err, tc.want)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
	// 500 rows are sent: the limit is the table's own, not the 250 of a line table.
	fixedIDs(t, "paynew000000001")
	input := `{"customer": "custacme0000001", "date": "2026-11-04", "amount": 500, "applications": [` + strings.Join(rows[:500], ",") + `]}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "payments", "add", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(sentBatch(t, f, 0), "books_payment_applications"); got != 500 {
		t.Errorf("%d applications sent, want 500", got)
	}
	if got := fmt.Sprint(documentInputSchema(findDocument("payments"), true)["properties"].(map[string]any)["applications"].(map[string]any)["maxItems"]); got != "500" {
		t.Errorf("the schema says maxItems = %s", got)
	}
	if got := fmt.Sprint(documentInputSchema(findDocument("invoices"), true)["properties"].(map[string]any)["lines"].(map[string]any)["maxItems"]); got != "250" {
		t.Errorf("the schema of an invoice says maxItems = %s", got)
	}
}

func TestLoadDocumentsTakesATypeWithNoRevision(t *testing.T) {
	if findDocument("payments").hasRevision() || !findDocument("invoices").hasRevision() {
		t.Fatal("payments has a revision, or invoices has none")
	}
	// A quote states the next revision in every status change.
	text := string(documentsJSON)
	at := strings.Index(text, `"name": "estimates"`)
	old := `"name": "revision"`
	next := strings.Index(text[at:], old)
	if at < 0 || next < 0 {
		t.Fatal("documents.json has no estimates with a revision")
	}
	broken := text[:at+next] + `"name": "saves"` + text[at+next+len(old):]
	if _, err := loadDocuments([]byte(broken)); err == nil || !strings.Contains(err.Error(), "a quote has a read-only integer revision") {
		t.Errorf("err = %v", err)
	}
	if _, err := loadDocuments([]byte(strings.Replace(text, `"max": 500`, `"max": -1`, 1))); err == nil || !strings.Contains(err.Error(), "max -1 is below zero") {
		t.Errorf("err = %v", err)
	}
}
