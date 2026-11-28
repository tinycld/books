package cli

import (
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// paid is the sales book with one posted bill payment of two lines and one
// void bill payment. No fixture holds the bills or the vendor it names: the
// fake server checks no reference, so the ids are only strings here.
func paid(t *testing.T) *fakeBooks {
	t.Helper()
	f := sales(t)
	f.addRow("books_bill_payments", "billpayposted01", map[string]any{
		"vendor": "vendsummit00001", "paid_from": "acctchecking001", "payment_method": "check", "reference_no": "301",
		"date": "2026-11-10", "status": "posted", "number": "1001", "total": cents(35000), "entry": "entryinvoice001",
	})
	f.addRow("books_bill_payment_lines", "billpayline0002", map[string]any{
		"payment": "billpayposted01", "position": cents(1), "bill": "billposted00002", "amount": cents(5000),
	})
	f.addRow("books_bill_payment_lines", "billpayline0001", map[string]any{
		"payment": "billpayposted01", "position": cents(0), "bill": "billposted00001", "amount": cents(30000),
	})
	f.addRow("books_bill_payments", "billpayvoid0001", map[string]any{
		"vendor": "vendsummit00001", "paid_from": "acctchecking001", "payment_method": "check",
		"date": "2026-11-09", "status": "void", "number": "1000",
	})
	return f
}

const newBillPayment = `{"vendor": "vendsummit00001", "paid_from": "acctchecking001", "payment_method": "check", "reference_no": "301", "date": "2026-11-10", "lines": [
	{"bill": "billposted00001", "amount": 30000},
	{"bill": "billposted00002", "amount": 5000}]}`

// The batch of `bill-payments add`: the header is created posted, and no write
// posts it. server/cli_bill_payments_test.go sends a copy.
func TestBillPaymentAddIsOneBatchWithNoPost(t *testing.T) {
	f := paid(t)
	fixedIDs(t, "billpaynew00001")
	out, errOut, err := runCmd(t, f.serve(), newBillPayment, "books", "bill-payments", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_bill_payments/records","body":{"date":"2026-11-10","id":"billpaynew00001","paid_from":"acctchecking001","payment_method":"check","reference_no":"301","status":"posted","vendor":"vendsummit00001"}},` +
		`{"method":"POST","url":"/api/collections/books_bill_payment_lines/records","body":{"amount":30000,"bill":"billposted00001","payment":"billpaynew00001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_bill_payment_lines/records","body":{"amount":5000,"bill":"billposted00002","payment":"billpaynew00001","position":1}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"status": "posted"`) || !strings.Contains(out, `"bill": "billposted00002"`) || strings.Contains(out, `"revision"`) {
		t.Errorf("the printed bill payment:\n%s", out)
	}
	if !strings.Contains(errOut, "added and posted bill payment") {
		t.Errorf("stderr = %q", errOut)
	}
}

// A type with no draft has no --post, no `post` and no `delete`.
func TestBillPaymentHasNoDraftCommands(t *testing.T) {
	root := newTestRoot(nil)
	group, _, err := root.Find([]string{"books", "bill-payments"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), ","); got != "add,edit,entry,list,show,void" {
		t.Errorf("commands = %s", got)
	}
	add, _, err := root.Find([]string{"books", "bill-payments", "add"})
	if err != nil {
		t.Fatal(err)
	}
	if add.Flags().Lookup("post") != nil {
		t.Error("`bill-payments add` has a --post flag")
	}
	// The help says that `add` changes the books at once.
	if !strings.Contains(add.Long, "It has no draft: Books posts and numbers it at once") {
		t.Errorf("the help of `bill-payments add` does not say that it posts:\n%s", add.Long)
	}
	f := paid(t)
	_, _, err = runCmd(t, f.serve(), newBillPayment, "books", "bill-payments", "add", "--input", "-", "--post", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("add --post: exit = %d, err = %v", got, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused call sent %v", f.requests)
	}
}

func TestBillPaymentShowEntryAndVoid(t *testing.T) {
	f := paid(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "bill-payments", "show", "billpayposted01", "--json")
	if err != nil {
		t.Fatal(err)
	}
	first, second := strings.Index(out, `"bill": "billposted00001"`), strings.Index(out, `"bill": "billposted00002"`)
	if first < 0 || second < first || !strings.Contains(out, `"total": 35000,`) {
		t.Errorf("the bill payment, with its lines in order:\n%s", out)
	}
	entry, _, err := runCmd(t, f.serve(), "", "books", "bill-payments", "entry", "billpayposted01", "--json")
	if err != nil || !strings.Contains(entry, `"id": "entryinvoice001"`) {
		t.Errorf("entry (%v):\n%s", err, entry)
	}
	if _, _, err := runCmd(t, f.serve(), "", "books", "bill-payments", "void", "billpayposted01", "--yes", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := mustJSON(f.lastPatch), `{"status":"void"}`; got != want {
		t.Errorf("void sent %s, want %s", got, want)
	}
	// The message of a void one does not send the caller to a `delete` the type has not.
	_, _, err = runCmd(t, f.serve(), "", "books", "bill-payments", "void", "billpayvoid0001", "--yes", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || strings.Contains(err.Error(), "delete") {
		t.Errorf("void of a void one: exit = %d, err = %v", got, err)
	}
}

// `edit` of a bill payment is a correction: one batch that creates the new one
// posted, with `replaces`, and no post. A void one cannot be changed.
func TestBillPaymentEditIsACorrectionWithNoPost(t *testing.T) {
	f := paid(t)
	fixedIDs(t, "billpaynew00001")
	_, errOut, err := runCmd(t, f.serve(), `{"lines": [{"bill": "billposted00001", "amount": 30000}, {"bill": "billposted00002", "amount": 6000}]}`,
		"books", "bill-payments", "edit", "billpayposted01", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_bill_payments/records","body":{"date":"2026-11-10","id":"billpaynew00001","paid_from":"acctchecking001","payment_method":"check","reference_no":"301","replaces":"billpayposted01","status":"posted","vendor":"vendsummit00001"}},` +
		`{"method":"POST","url":"/api/collections/books_bill_payment_lines/records","body":{"amount":30000,"bill":"billposted00001","payment":"billpaynew00001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_bill_payment_lines/records","body":{"amount":6000,"bill":"billposted00002","payment":"billpaynew00001","position":1}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the correction:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(errOut, "corrected bill payment") {
		t.Errorf("stderr = %q", errOut)
	}
	f = paid(t)
	_, _, err = runCmd(t, f.serve(), `{"reference_no": "302"}`, "books", "bill-payments", "edit", "billpayvoid0001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "is void: it cannot be changed") {
		t.Errorf("edit of a void one: exit = %d, err = %v", got, err)
	}
	for _, request := range f.requests {
		if strings.HasPrefix(request, "POST") {
			t.Errorf("a refused edit sent %s", request)
		}
	}
}

func TestBillPaymentInputIsCheckedBeforeItIsSent(t *testing.T) {
	f := paid(t)
	const header = `"vendor": "vendsummit00001", "paid_from": "acctchecking001", "payment_method": "check", "date": "2026-11-10"`
	cases := []struct{ input, want string }{
		{`{"vendor": "vendsummit00001", "payment_method": "check", "date": "2026-11-10"}`, `"paid_from" is required`},
		{`{` + header + `, "lines": [{"amount": 1}]}`, `lines[0]: "bill" is required`},
		{`{` + header + `, "status": "posted"}`, `"status" is set by the server`},
		{`{` + header + `, "memo": "x"}`, `bill-payments has no field "memo"`},
		{`{` + header + `, "payment_method": "barter"}`, `"payment_method"`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "bill-payments", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%.80s: exit = %d, err = %v, want %q", tc.input, got, err, tc.want)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
}

// The rules of a type that is created posted, checked when documents.json loads.
func TestLoadDocumentsChecksATypeThatIsCreatedPosted(t *testing.T) {
	doc := findDocument("bill-payments")
	if doc.hasDraft() || !doc.corrects() || doc.initialStatus() != statusPosted || doc.editedInPlace(statusPosted) {
		t.Fatal("bill-payments has a draft, or `edit` does not correct it")
	}
	text := string(documentsJSON)
	at := strings.Index(text, `"name": "bill-payments"`)
	if at < 0 {
		t.Fatal("documents.json has no bill-payments")
	}
	breakIt := func(old, next string) string {
		i := strings.Index(text[at:], old)
		if i < 0 {
			t.Fatalf("bill-payments has no %s", old)
		}
		return text[:at+i] + next + text[at+i+len(old):]
	}
	cases := []struct{ old, next, want string }{
		{`"enum": ["posted", "void"]`, `"enum": ["draft", "posted", "void"]`, "a document that is created posted has a read-only status with the values posted, void"},
		{`"name": "replaces", "type": "id", "ref": "bill-payments"`, `"name": "replaces", "type": "id", "ref": "bills"`, "replaces is the id of a document of its own type"},
		{`"name": "currency", "type": "string"`, `"name": "revision", "type": "integer"`, "a document that is created posted has no revision"},
	}
	for _, tc := range cases {
		if _, err := loadDocuments([]byte(breakIt(tc.old, tc.next))); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: err = %v, want %q", tc.next, err, tc.want)
		}
	}
}
