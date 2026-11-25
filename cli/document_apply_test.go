package cli

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// postingCommands is the command list of a posting document with an `entry`:
// with `apply` and `unapply` when documents.json gives the type a table for them.
func postingCommands(name string) string {
	if findDocument(name).applyTable() != nil {
		return "add,apply,delete,edit,entry,list,post,show,unapply,void"
	}
	return "add,delete,edit,entry,list,post,show,void"
}

// credited is the sales book with a posted credit memo that is applied to two
// invoices, and a posted vendor credit that is applied to one bill.
func credited(t *testing.T) *fakeBooks {
	t.Helper()
	f := sales(t)
	f.addRow("books_credit_memos", "memoposted00001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-05", "status": "posted", "number": "1001",
		"total": cents(25000), "balance": cents(10000), "revision": cents(1),
	})
	// Stored in the other order: `show` sorts by the date.
	f.addRow("books_credit_memo_applications", "memoapply000002", map[string]any{
		"credit_memo": "memoposted00001", "invoice": "invdraft0000001", "amount": cents(5000), "date": "2026-11-08",
	})
	f.addRow("books_credit_memo_applications", "memoapply000001", map[string]any{
		"credit_memo": "memoposted00001", "invoice": "invposted000001", "amount": cents(10000), "date": "2026-11-06",
	})
	f.addRow("books_credit_memo_applications", "memoapply000009", map[string]any{
		"credit_memo": "memoother000001", "invoice": "invposted000001", "amount": cents(100), "date": "2026-11-06",
	})
	f.addRow("books_vendor_credits", "vcposted0000001", map[string]any{
		"vendor": "vendsummit00001", "date": "2026-11-05", "status": "posted", "number": "1001",
		"total": cents(5000), "balance": cents(2000), "revision": cents(1),
	})
	f.addRow("books_vendor_credit_applications", "vcapply00000001", map[string]any{
		"vendor_credit": "vcposted0000001", "bill": "billposted00001", "amount": cents(3000), "date": "2026-11-06",
	})
	return f
}

// `apply` is one write of one record, with the document's id and no position.
// server/cli_apply_credit_test.go sends a copy of each body.
func TestApplySendsOneRecordAndPrintsTheDocument(t *testing.T) {
	cases := []struct{ group, id, input, wantURL, wantBody string }{
		{"credit-memos", "memoposted00001", `{"invoice": "invposted000001", "amount": 10000, "date": "2026-11-09"}`,
			"POST /api/collections/books_credit_memo_applications/records",
			`{"amount":10000,"credit_memo":"memoposted00001","date":"2026-11-09","id":"applynew0000001","invoice":"invposted000001"}`},
		{"vendor-credits", "vcposted0000001", `{"bill": "billposted00001", "amount": 2000, "date": "2026-11-09"}`,
			"POST /api/collections/books_vendor_credit_applications/records",
			`{"amount":2000,"bill":"billposted00001","date":"2026-11-09","id":"applynew0000001","vendor_credit":"vcposted0000001"}`},
	}
	for _, tc := range cases {
		f := credited(t)
		fixedIDs(t, "applynew0000001")
		out, errOut, err := runCmd(t, f.serve(), tc.input, "books", tc.group, "apply", tc.id, "--input", "-", "--json")
		if err != nil {
			t.Fatal(err)
		}
		if len(f.requests) == 0 || f.requests[0] != tc.wantURL {
			t.Errorf("%s: the requests %v, want first %s", tc.group, f.requests, tc.wantURL)
		}
		if got := mustJSON(f.lastCreate); got != tc.wantBody {
			t.Errorf("%s: apply sent\n%s\nwant\n%s", tc.group, got, tc.wantBody)
		}
		if !strings.Contains(out, `"id": "applynew0000001"`) || !strings.Contains(out, `"applications": [`) {
			t.Errorf("%s: the printed document has no new application:\n%s", tc.group, out)
		}
		if !strings.Contains(errOut, "applied ") {
			t.Errorf("stderr = %q", errOut)
		}
	}
}

func TestShowPrintsTheApplicationsInDateOrder(t *testing.T) {
	f := credited(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "credit-memos", "show", "memoposted00001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	first, second := strings.Index(out, `"id": "memoapply000001"`), strings.Index(out, `"id": "memoapply000002"`)
	if first < 0 || second < first || strings.Contains(out, "memoapply000009") || strings.Contains(out, "applied_by") {
		t.Errorf("the applications of the credit memo:\n%s", out)
	}
}

// `unapply` removes only a row of the document it names.
func TestUnapplyRemovesARowOfItsOwnDocument(t *testing.T) {
	f := credited(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "credit-memos", "unapply", "memoposted00001", "memoapply000001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if f.find("books_credit_memo_applications", "memoapply000001") != nil || strings.Contains(out, "memoapply000001") || !strings.Contains(out, "memoapply000002") {
		t.Errorf("the row was not removed, or the printed credit memo still has it:\n%s", out)
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "credit-memos", "unapply", "memoposted00001", "memoapply000009", "--json")
	if got := exitcode.Of(err); got != exitcode.NotFound || !strings.Contains(err.Error(), "application memoapply000009 is not of credit memo memoposted00001") {
		t.Errorf("a row of another credit memo: exit = %d, err = %v", got, err)
	}
	if f.find("books_credit_memo_applications", "memoapply000009") == nil {
		t.Error("unapply removed a row of another credit memo")
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "credit-memos", "unapply", "memoposted00001", "nosuchrow000001", "--json")
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Errorf("a row that does not exist: exit = %d, err = %v", got, err)
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "credit-memos", "unapply", "memoposted00001", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("no application id: exit = %d, err = %v", got, err)
	}
}

// The input of `apply` is checked before a request, and a refusal of Books is
// exit 6 with its message.
func TestApplyChecksItsInputAndPassesARefusalOn(t *testing.T) {
	f := credited(t)
	cases := []struct{ input, want string }{
		{`{"amount": 100, "date": "2026-11-09"}`, `"invoice" is required`},
		{`{"invoice": "invposted000001", "date": "2026-11-09"}`, `"amount" is required`},
		{`{"invoice": "invposted000001", "amount": 100}`, `"date" is required`},
		{`{"invoice": "invposted000001", "amount": 100, "date": "2026-11-09", "credit_memo": "x"}`, `"credit_memo"`},
		{`{"invoice": "invposted000001", "amount": 100, "date": "2026-11-09", "position": 0}`, `"position"`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "credit-memos", "apply", "memoposted00001", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%.80s: exit = %d, err = %v, want %q", tc.input, got, err, tc.want)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
	f.refuse("POST", 400, `{"status":400,"message":"Failed to create record.","data":{"invoice":{"code":"validation_books","message":"Invoice 1001: the credit is more than its open balance of $300.00."}}}`)
	_, _, err := runCmd(t, f.serve(), `{"invoice": "invposted000001", "amount": 99999, "date": "2026-11-09"}`, "books", "credit-memos", "apply", "memoposted00001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "the credit is more than its open balance of $300.00.") {
		t.Errorf("a refusal of Books: exit = %d, err = %v", got, err)
	}
}

// The applications are not part of `add` or `edit`: a correction does not copy them.
func TestApplicationsAreNotInTheInputOfAddOrEdit(t *testing.T) {
	f := credited(t)
	_, _, err := runCmd(t, f.serve(), `{"customer": "custacme0000001", "date": "2026-11-05", "applications": []}`, "books", "credit-memos", "add", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "applications") {
		t.Errorf("exit = %d, err = %v", got, err)
	}
	_, _, err = runCmd(t, f.serve(), `{"applications": [{"invoice": "invposted000001", "amount": 1, "date": "2026-11-09"}]}`,
		"books", "credit-memos", "edit", "memoposted00001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "applications are added one at a time: use tinycld books credit-memos apply <id>") {
		t.Errorf("edit: exit = %d, err = %v", got, err)
	}
	_, _, err = runCmd(t, f.serve(), `{"applications": []}`, "books", "vendor-credits", "edit", "vcposted0000001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "applications are added one at a time: use tinycld books vendor-credits apply <id>") {
		t.Errorf("vendor credit edit: exit = %d, err = %v", got, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
	for _, name := range []string{"credit-memos", "vendor-credits"} {
		for _, create := range []bool{true, false} {
			props := documentInputSchema(findDocument(name), create)["properties"].(map[string]any)
			if _, has := props["applications"]; has {
				t.Errorf("the input schema of `%s` (add = %v) has applications", name, create)
			}
		}
	}
	// A correction of a posted credit memo writes no application: the rows
	// stay with the memo it replaces, and Books decides what becomes of them.
	fixedIDs(t, "memonew00000001")
	if _, _, err := runCmd(t, f.serve(), `{"date": "2026-11-06"}`, "books", "credit-memos", "edit", "memoposted00001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	batch := sentBatch(t, f, 0)
	if !strings.Contains(batch, `"replaces":"memoposted00001"`) || strings.Contains(batch, "books_credit_memo_applications") {
		t.Errorf("the correction:\n%s", batch)
	}
}

// The two application tables have a created and no updated. A row prints the
// keys the collection has, and the schema describes only those.
func TestAnApplicationRowHasNoUpdated(t *testing.T) {
	for _, group := range []string{"credit-memos", "vendor-credits"} {
		f := credited(t)
		id := map[string]string{"credit-memos": "memoposted00001", "vendor-credits": "vcposted0000001"}[group]
		out, _, err := runCmd(t, f.serve(), "", "books", group, "show", id, "--json")
		if err != nil {
			t.Fatal(err)
		}
		var shown struct {
			Applications []map[string]any `json:"applications"`
		}
		if err := json.Unmarshal([]byte(out), &shown); err != nil || len(shown.Applications) == 0 {
			t.Fatalf("%s: not a document: %v\n%s", group, err, out)
		}
		row := shown.Applications[0]
		if _, has := row["updated"]; has {
			t.Errorf("%s: an application prints `updated`: %v", group, row)
		}
		if row["created"] == nil {
			t.Errorf("%s: an application prints no `created`: %v", group, row)
		}
		schema := recordSchema(findDocument(group).applyTable().asResource())
		if _, has := schema["properties"].(map[string]any)["updated"]; has || slices.Contains(schema["required"].([]string), "updated") {
			t.Errorf("%s: the schema of an application has `updated`", group)
		}
		if _, has := schema["properties"].(map[string]any)["created"]; !has {
			t.Errorf("%s: the schema of an application has no `created`", group)
		}
	}
}

// A 404 of the create does not say the credit is gone: a bad invoice or a
// missing credit is a 400 with a field error (server/cli_apply_credit_test.go),
// so a 404 is a server that has no such collection.
func TestApplyNotFoundNamesTheCollection(t *testing.T) {
	f := credited(t)
	f.refuse("POST", 404, `{"status":404,"message":"The requested resource wasn't found.","data":{}}`)
	_, _, err := runCmd(t, f.serve(), `{"invoice": "invposted000001", "amount": 100, "date": "2026-11-09"}`, "books", "credit-memos", "apply", "memoposted00001", "--input", "-", "--json")
	if err == nil || !strings.HasPrefix(err.Error(), "no application was added to credit memo memoposted00001: the server has no collection books_credit_memo_applications") {
		t.Fatalf("err = %v", err)
	}
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Errorf("exit = %d", got)
	}
}

// `apply` does not read the credit first: a draft or a missing credit is the
// 400 that Books answers to the create (server/cli_apply_credit_test.go sends
// these bodies), so it is exit 6 and the message names the credit, whatever the
// message of the server says.
func TestApplyOnADraftOrMissingCreditIsARefusal(t *testing.T) {
	cases := []struct{ group, id, body, want string }{
		{"credit-memos", "memoposted00001",
			`{"data":{"credit_memo":{"code":"validation_books","message":"Only a posted credit memo is applied to invoices."}},"message":"Only a posted credit memo is applied to invoices.","status":400}`,
			"Only a posted credit memo is applied to invoices."},
		{"credit-memos", "nosuchmemo00001",
			`{"data":{"credit_memo":{"code":"validation_missing_rel_records","message":"Failed to find all relation records with the provided ids."}},"message":"Failed to create record.","status":400}`,
			"credit memo nosuchmemo00001"},
		{"vendor-credits", "vcposted0000001",
			`{"data":{"vendor_credit":{"code":"validation_books","message":"Only a posted vendor credit is applied to bills."}},"message":"Only a posted vendor credit is applied to bills.","status":400}`,
			"Only a posted vendor credit is applied to bills."},
		{"vendor-credits", "nosuchcredit001",
			`{"data":{"vendor_credit":{"code":"validation_missing_rel_records","message":"Failed to find all relation records with the provided ids."}},"message":"Failed to create record.","status":400}`,
			"vendor credit nosuchcredit001"},
	}
	for _, tc := range cases {
		f := credited(t)
		f.refuse("POST", 400, tc.body)
		input := `{"invoice": "invposted000001", "amount": 100, "date": "2026-11-09"}`
		if tc.group == "vendor-credits" {
			input = `{"bill": "billposted00001", "amount": 100, "date": "2026-11-09"}`
		}
		_, _, err := runCmd(t, f.serve(), input, "books", tc.group, "apply", tc.id, "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Refused || err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s %s: exit = %d, err = %v, want %q", tc.group, tc.id, got, err, tc.want)
		}
	}
}

// The rules of a table with `apply`, checked when documents.json loads.
func TestLoadDocumentsChecksATableWithApply(t *testing.T) {
	text := string(documentsJSON)
	at := strings.Index(text, `"collection": "books_credit_memo_applications"`)
	if at < 0 {
		t.Fatal("documents.json has no applications of a credit memo")
	}
	breakIt := func(old, next string) string {
		i := strings.Index(text[at:], old)
		if i < 0 {
			t.Fatalf("the table has no %s", old)
		}
		return text[:at+i] + next + text[at+i+len(old):]
	}
	if _, err := loadDocuments([]byte(breakIt(`"readOnly": true,`, ``))); err == nil || !strings.Contains(err.Error(), "a table with apply is read-only") {
		t.Errorf("not read-only: err = %v", err)
	}
	if _, err := loadDocuments([]byte(breakIt(`"omit": ["credit_memo", `, `"omit": [`))); err == nil || !strings.Contains(err.Error(), `omit must name "credit_memo"`) {
		t.Errorf("the parent not in omit: err = %v", err)
	}
	// A second table with apply in one document.
	// The flag of a table is alone on its line; the flag of a field is not.
	const flag = "\"readOnly\": true,\n"
	tax := strings.LastIndex(text[:at], flag)
	second := text[:tax] + `"apply": true, ` + text[tax:]
	if _, err := loadDocuments([]byte(second)); err == nil || !strings.Contains(err.Error(), "at most one table with apply") {
		t.Errorf("two tables with apply: err = %v", err)
	}
}
