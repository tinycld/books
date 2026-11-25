package cli

import (
	"fmt"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// banked is the sales book with one posted deposit (one item, one line) and one
// posted vendor refund (one line).
func banked(t *testing.T) *fakeBooks {
	t.Helper()
	f := sales(t)
	f.addRow("books_deposits", "depposted000001", map[string]any{
		"date": "2026-11-12", "deposit_to": "acctchecking001", "memo": "Week 46", "status": "posted", "number": "1001",
		"total": cents(29500), "items_total": cents(30000), "lines_total": cents(-500), "entry": "entryinvoice001",
	})
	f.addRow("books_deposit_items", "depitem00000001", map[string]any{
		"deposit": "depposted000001", "position": cents(0), "line": "lineinvoice0001", "entry": "entryinvoice001",
		"account": "acctchecking001", "customer": "custacme0000001", "amount": cents(30000), "date": "2026-11-04",
		"doc_type": "payment", "number": "1001", "document": "payposted000001", "payment_method": "check", "posted": true,
	})
	f.addRow("books_deposit_lines", "depline00000001", map[string]any{
		"deposit": "depposted000001", "position": cents(0), "account": "acctsoftware001", "amount": cents(-500), "description": "Bank fee",
	})
	f.addRow("books_vendor_refunds", "refposted000001", map[string]any{
		"vendor": "vendsummit00001", "date": "2026-11-12", "refunded_to": "acctchecking001", "amount": cents(4000),
		"payment_method": "check", "status": "posted", "number": "1001", "entry": "entryinvoice001",
	})
	f.addRow("books_vendor_refund_lines", "refline00000001", map[string]any{
		"refund": "refposted000001", "position": cents(0), "vendor_credit": "vcposted0000001", "amount": cents(4000),
	})
	return f
}

// The batch of `vendor-refunds add --post`. A vendor refund has no revision.
// server/cli_deposits_test.go sends a copy.
func TestVendorRefundAddAndPostInOneBatch(t *testing.T) {
	f := banked(t)
	fixedIDs(t, "refnew000000001")
	input := `{"vendor": "vendsummit00001", "date": "2026-11-12", "refunded_to": "acctchecking001", "amount": 4000, "payment_method": "check",
		"lines": [{"vendor_credit": "vcposted0000001", "amount": 4000}]}`
	_, errOut, err := runCmd(t, f.serve(), input, "books", "vendor-refunds", "add", "--input", "-", "--post", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_vendor_refunds/records","body":{"amount":4000,"date":"2026-11-12","id":"refnew000000001","payment_method":"check","refunded_to":"acctchecking001","status":"draft","vendor":"vendsummit00001"}},` +
		`{"method":"POST","url":"/api/collections/books_vendor_refund_lines/records","body":{"amount":4000,"position":0,"refund":"refnew000000001","vendor_credit":"vcposted0000001"}},` +
		`{"method":"PATCH","url":"/api/collections/books_vendor_refunds/records/refnew000000001","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(errOut, "added and posted vendor refund") {
		t.Errorf("stderr = %q", errOut)
	}
}

const newDeposit = `{"date": "2026-11-12", "deposit_to": "acctchecking001", "memo": "Week 46",
	"items": [{"line": "lineinvoice0001"}],
	"lines": [{"account": "acctsoftware001", "amount": -500, "description": "Bank fee"}]}`

// The batch of `deposits add --post`: the items, then the lines, each table
// with its own positions. server/cli_deposits_test.go sends a copy.
func TestDepositAddSendsItsItemsAndItsLines(t *testing.T) {
	f := banked(t)
	fixedIDs(t, "depnew000000001")
	out, _, err := runCmd(t, f.serve(), newDeposit, "books", "deposits", "add", "--input", "-", "--post", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_deposits/records","body":{"date":"2026-11-12","deposit_to":"acctchecking001","id":"depnew000000001","memo":"Week 46","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_deposit_items/records","body":{"deposit":"depnew000000001","line":"lineinvoice0001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_deposit_lines/records","body":{"account":"acctsoftware001","amount":-500,"deposit":"depnew000000001","description":"Bank fee","position":0}},` +
		`{"method":"PATCH","url":"/api/collections/books_deposits/records/depnew000000001","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"items": [`) || !strings.Contains(out, `"lines": [`) {
		t.Errorf("the printed deposit:\n%s", out)
	}
}

// `show` prints what Books wrote on an item. A correction sends back only the
// journal line of each item: Books refuses an item that states its amount.
func TestDepositShowAndCorrection(t *testing.T) {
	f := banked(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "deposits", "show", "depposted000001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"total": 29500,`, `"items_total": 30000,`, `"lines_total": -500,`, `"line": "lineinvoice0001"`, `"doc_type": "payment"`, `"description": "Bank fee"`} {
		if !strings.Contains(out, want) {
			t.Errorf("the deposit has no %s:\n%s", want, out)
		}
	}
	fixedIDs(t, "depnew000000001")
	if _, _, err := runCmd(t, f.serve(), `{"lines": [{"account": "acctsoftware001", "amount": -700, "description": "Bank fee"}]}`,
		"books", "deposits", "edit", "depposted000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_deposits/records","body":{"date":"2026-11-12","deposit_to":"acctchecking001","id":"depnew000000001","memo":"Week 46","replaces":"depposted000001","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_deposit_items/records","body":{"deposit":"depnew000000001","line":"lineinvoice0001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_deposit_lines/records","body":{"account":"acctsoftware001","amount":-700,"deposit":"depnew000000001","description":"Bank fee","position":0}},` +
		`{"method":"PATCH","url":"/api/collections/books_deposits/records/depnew000000001","body":{"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the correction:\n%s\nwant:\n%s", got, want)
	}
	// With only the memo in the input, the correction sends the stored line
	// back, with its empty customer and vendor.
	fixedIDs(t, "depnew000000002")
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Week 46, corrected"}`, "books", "deposits", "edit", "depposted000001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	stored := `{"method":"POST","url":"/api/collections/books_deposit_lines/records","body":{"account":"acctsoftware001","amount":-500,"customer":"","deposit":"depnew000000002","description":"Bank fee","position":0,"vendor":""}}`
	if got := sentBatch(t, f, 1); !strings.Contains(got, stored) || !strings.Contains(got, `"memo":"Week 46, corrected","replaces":"depposted000001"`) {
		t.Errorf("the correction of the memo:\n%s\nwant the line:\n%s", got, stored)
	}
}

func TestDepositAndVendorRefundInputIsCheckedBeforeItIsSent(t *testing.T) {
	f := banked(t)
	rows := func(row string, count int) string {
		return strings.TrimSuffix(strings.Repeat(row+",", count), ",")
	}
	const deposit = `"date": "2026-11-12", "deposit_to": "acctchecking001"`
	const refund = `"vendor": "vendsummit00001", "date": "2026-11-12", "refunded_to": "acctchecking001"`
	cases := []struct{ group, input, want string }{
		{"deposits", `{"date": "2026-11-12"}`, `"deposit_to" is required`},
		{"deposits", `{` + deposit + `, "items": [{}]}`, `items[0]: "line" is required`},
		{"deposits", `{` + deposit + `, "items": [{"line": "lineinvoice0001", "amount": 30000}]}`, `items[0]: "amount" is set by the server`},
		{"deposits", `{` + deposit + `, "lines": [{"amount": 1}]}`, `lines[0]: "account" is required`},
		{"deposits", `{` + deposit + `, "total": 1}`, `"total" is set by the server`},
		{"deposits", `{` + deposit + `, "items": [` + rows(`{"line": "lineinvoice0001"}`, 501) + `]}`, `"items" has 501 rows: the most is 500`},
		{"deposits", `{` + deposit + `, "lines": [` + rows(`{"account": "acctsoftware001", "amount": 1}`, 101) + `]}`, `"lines" has 101 rows: the most is 100`},
		{"vendor-refunds", `{"vendor": "vendsummit00001", "date": "2026-11-12"}`, `"refunded_to" is required`},
		{"vendor-refunds", `{` + refund + `, "lines": [{"amount": 1}]}`, `lines[0]: "vendor_credit" is required`},
		{"vendor-refunds", `{` + refund + `, "revision": 1}`, `vendor-refunds has no field "revision"`},
		{"vendor-refunds", `{` + refund + `, "lines": [` + rows(`{"vendor_credit": "vcposted0000001", "amount": 1}`, 501) + `]}`, `"lines" has 501 rows: the most is 500`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", tc.group, "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s %.80s: exit = %d, err = %v, want %q", tc.group, tc.input, got, err, tc.want)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
	root := newTestRoot(nil)
	for _, name := range []string{"deposits", "vendor-refunds"} {
		group, _, err := root.Find([]string{"books", name})
		if err != nil {
			t.Fatal(err)
		}
		want := "add,delete,edit,entry,list,post,show,void"
		if name == "deposits" {
			want = "add,delete,edit,entry,list,post,show,undeposited,void"
		}
		if got := strings.Join(subcommandNames(group), ","); got != want {
			t.Errorf("%s: commands = %s", name, got)
		}
	}
}

// An edit of a draft removes and creates every row of each table it names. A
// full deposit with both tables in the input is 1200 writes, and the server
// takes 1100 in one batch: the command says so and sends nothing. One table in
// each call fits.
func TestDepositEditOverTheBatchLimitIsRefusedBeforeItIsSent(t *testing.T) {
	f := banked(t)
	f.addRow("books_deposits", "depbig000000001", map[string]any{"date": "2026-11-12", "deposit_to": "acctchecking001", "status": "draft"})
	for i := range 500 {
		f.addRow("books_deposit_items", fmt.Sprintf("bigitem%08d", i), map[string]any{"deposit": "depbig000000001", "position": cents(i), "line": "lineinvoice0001"})
	}
	for i := range 100 {
		f.addRow("books_deposit_lines", fmt.Sprintf("bigline%08d", i), map[string]any{"deposit": "depbig000000001", "position": cents(i), "account": "acctsoftware001", "amount": cents(1)})
	}
	rows := func(row string, count int) string {
		return strings.TrimSuffix(strings.Repeat(row+",", count), ",")
	}
	items := `"items": [` + rows(`{"line": "lineinvoice0001"}`, 500) + `]`
	lines := `"lines": [` + rows(`{"account": "acctsoftware001", "amount": 1}`, 100) + `]`
	_, _, err := runCmd(t, f.serve(), `{`+items+`, `+lines+`}`, "books", "deposits", "edit", "depbig000000001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "this change is 1200 writes, and Books takes 1100 in one step") {
		t.Errorf("exit = %d, err = %v", got, err)
	}
	for _, request := range f.requests {
		if !strings.HasPrefix(request, "GET ") {
			t.Errorf("the refused edit sent %s", request)
		}
	}
	if _, _, err := runCmd(t, f.serve(), `{`+items+`}`, "books", "deposits", "edit", "depbig000000001", "--input", "-", "--json"); err != nil {
		t.Fatalf("an edit of one table: %v", err)
	}
	if got := len(f.batches[0]); got != 1000 {
		t.Errorf("the edit of the items sent %d writes, want 1000", got)
	}
}

// A field may hold the id of a row of a line table: its ref names the document
// and the table, and the schema says so.
func TestARefMayNameALineTable(t *testing.T) {
	items := findDocument("deposits").table("items")
	line := items.asResource().field("line")
	if line == nil || line.Ref != rowRef(journalDocument, "lines") {
		t.Fatalf("deposits.items.line = %+v", line)
	}
	if got, want := fmt.Sprint(fieldSchema(line)["description"]), "(the id of a row of `lines` of `books journal-entries`)"; !strings.HasSuffix(got, want) {
		t.Errorf("description = %q, want the end %q", got, want)
	}
	broken := strings.Replace(string(documentsJSON), `"ref": "journal-entries.lines"`, `"ref": "journal-entries.rows"`, 1)
	if _, err := loadDocuments([]byte(broken)); err == nil || !strings.Contains(err.Error(), `ref "journal-entries.rows" is not a resource`) {
		t.Errorf("err = %v", err)
	}
}
