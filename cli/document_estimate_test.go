package cli

import (
	"slices"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// quotes is the sales book with estimates: one pending with two lines, one
// accepted, and one closed by its invoice.
func quotes(t *testing.T) *fakeBooks {
	t.Helper()
	f := sales(t)
	f.addRow("books_estimates", "estpending00001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-02", "expiration_date": "2026-12-02", "email": "",
		"tax_rate": "taxdenver000001", "message": "Thank you", "memo": "Estimate memo", "status": "pending", "number": "1001",
		"subtotal": cents(34020), "total": cents(36983), "revision": cents(2),
	})
	f.addRow("books_estimate_lines", "estline00000001", map[string]any{
		"estimate": "estpending00001", "position": cents(0), "kind": "item", "product": "prodservice0001",
		"quantity": cents(3), "rate": cents(12600), "taxable": true, "amount": cents(37800),
	})
	f.addRow("books_estimate_lines", "estline00000002", map[string]any{
		"estimate": "estpending00001", "position": cents(1), "kind": "percent", "product": "proddiscount001",
		"percent_ppm": cents(-100000), "amount": cents(-3780),
	})
	f.addRow("books_estimates", "estaccepted0001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-02", "status": "accepted", "number": "1002",
		"accepted_by": "Dana Lee", "accepted_date": "2026-11-03", "revision": cents(4),
	})
	f.addRow("books_estimates", "estclosed000001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-02", "status": "closed", "number": "1003",
		"invoice": "invdraft0000001", "revision": cents(5),
	})
	f.addRow("books_estimates", "estrejected0001", map[string]any{
		"customer": "custacme0000001", "date": "2026-11-02", "status": "rejected", "number": "1004",
		"revision": cents(7),
	})
	return f
}

func TestEstimateHasItsOwnCommands(t *testing.T) {
	root := newTestRoot(nil)
	group, _, err := root.Find([]string{"books", "estimates"})
	if err != nil {
		t.Fatal(err)
	}
	names := subcommandNames(group)
	for _, want := range []string{"accept", "add", "delete", "edit", "list", "reject", "reopen", "show"} {
		if !slices.Contains(names, want) {
			t.Errorf("estimates has no %s; commands = %v", want, names)
		}
	}
	// An estimate posts nothing.
	for _, never := range []string{"post", "void", "entry"} {
		if slices.Contains(names, never) {
			t.Errorf("estimates has %s; commands = %v", never, names)
		}
	}
	add, _, _ := root.Find([]string{"books", "estimates", "add"})
	if add.Flags().Lookup("post") != nil {
		t.Error("estimates add has --post: an estimate posts nothing")
	}
	if invoiceAdd, _, _ := root.Find([]string{"books", "invoices", "add"}); invoiceAdd.Flags().Lookup("post") == nil {
		t.Error("invoices add lost --post")
	}
}

func TestEstimateAddIsPendingAtOnce(t *testing.T) {
	f := quotes(t)
	fixedIDs(t, "estnew000000001")
	input := `{"customer": "custacme0000001", "date": "2026-11-04", "lines": [{"kind": "item", "product": "prodservice0001", "quantity": 2, "rate": 5000}]}`
	out, errOut, err := runCmd(t, f.serve(), input, "books", "estimates", "add", "--input", "-", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_estimates/records","body":{"customer":"custacme0000001","date":"2026-11-04","id":"estnew000000001","status":"pending"}},` +
		`{"method":"POST","url":"/api/collections/books_estimate_lines/records","body":{"estimate":"estnew000000001","kind":"item","position":0,"product":"prodservice0001","quantity":2,"rate":5000}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(out, `"status": "pending"`) || strings.Contains(out, "tax_lines") || !strings.Contains(errOut, "added estimate") {
		t.Errorf("out:\n%s\nstderr: %s", out, errOut)
	}
	// What only `accept` and Books set is not an input.
	for _, name := range []string{"status", "accepted_date", "accepted_by", "invoice", "number", "total"} {
		_, _, err := runCmd(t, f.serve(), `{"customer": "custacme0000001", "date": "2026-11-04", "`+name+`": "x"}`, "books", "estimates", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), `"`+name+`" is set by the server`) {
			t.Errorf("%s in the input: exit = %d, err = %v", name, got, err)
		}
	}
}

// An estimate is changed in place whatever its status, until it is closed.
func TestEstimateEditChangesItInPlace(t *testing.T) {
	f := quotes(t)
	fixedIDs(t)
	input := `{"memo": "Changed", "lines": [{"kind": "item", "product": "prodservice0001", "quantity": 1, "rate": 900}]}`
	if _, _, err := runCmd(t, f.serve(), input, "books", "estimates", "edit", "estpending00001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"DELETE","url":"/api/collections/books_estimate_lines/records/estline00000002"},` +
		`{"method":"PATCH","url":"/api/collections/books_estimate_lines/records/estline00000001","body":{"description":null,"kind":"item","percent_ppm":null,"position":0,"product":"prodservice0001","quantity":1,"rate":900,"taxable":null}},` +
		`{"method":"PATCH","url":"/api/collections/books_estimates/records/estpending00001","body":{"memo":"Changed","revision":3}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Changed"}`, "books", "estimates", "edit", "estaccepted0001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := sentBatch(t, f, 1), `[{"method":"PATCH","url":"/api/collections/books_estimates/records/estaccepted0001","body":{"memo":"Changed","revision":5}}]`; got != want {
		t.Errorf("the batch of an accepted estimate:\n%s\nwant:\n%s", got, want)
	}
	// A rejected estimate is changed in place too, with no status change.
	if _, _, err := runCmd(t, f.serve(), `{"memo": "Changed"}`, "books", "estimates", "edit", "estrejected0001", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := sentBatch(t, f, 2), `[{"method":"PATCH","url":"/api/collections/books_estimates/records/estrejected0001","body":{"memo":"Changed","revision":8}}]`; got != want {
		t.Errorf("the batch of a rejected estimate:\n%s\nwant:\n%s", got, want)
	}
	_, _, err := runCmd(t, f.serve(), `{"memo": "Changed"}`, "books", "estimates", "edit", "estclosed000001", "--input", "-", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "estimate estclosed000001 is closed: it cannot be changed") {
		t.Errorf("edit of a closed estimate: exit = %d, err = %v", got, err)
	}
	if len(f.batches) != 3 {
		t.Errorf("a closed estimate was written: %d batches", len(f.batches))
	}
}

func TestEstimateAcceptRejectReopen(t *testing.T) {
	f := quotes(t)
	out, errOut, err := runCmd(t, f.serve(), "", "books", "estimates", "accept", "estpending00001", "--date", "2026-11-05", "--by", "Dana Lee", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := mustJSON(f.lastPatch), `{"accepted_by":"Dana Lee","accepted_date":"2026-11-05","revision":3,"status":"accepted"}`; got != want {
		t.Errorf("accept sent %s, want %s", got, want)
	}
	if !strings.Contains(out, `"status": "accepted"`) || !strings.Contains(out, `"lines": [`) || !strings.Contains(errOut, "accepted estimate 1001") {
		t.Errorf("out:\n%s\nstderr: %s", out, errOut)
	}
	if _, _, err := runCmd(t, f.serve(), "", "books", "estimates", "reject", "estaccepted0001", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := mustJSON(f.lastPatch), `{"revision":5,"status":"rejected"}`; got != want {
		t.Errorf("reject sent %s, want %s", got, want)
	}
	if _, errOut, err = runCmd(t, f.serve(), "", "books", "estimates", "reopen", "estaccepted0001", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := mustJSON(f.lastPatch), `{"revision":6,"status":"pending"}`; got != want || !strings.Contains(errOut, "reopened estimate 1002") {
		t.Errorf("reopen sent %s, want %s; stderr %s", got, want, errOut)
	}
}

func TestEstimateStatusCommandsRefuseBeforeTheySend(t *testing.T) {
	f := quotes(t)
	for _, args := range [][]string{{"accept", "estpending00001"}, {"accept", "estpending00001", "--date", "5 Nov"}, {"accept", "estpending00001", "--date", "2026-02-30"}} {
		_, _, err := runCmd(t, f.serve(), "", append([]string{"books", "estimates"}, append(args, "--json")...)...)
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), "--date is required, as YYYY-MM-DD") {
			t.Errorf("%v: exit = %d, err = %v", args, got, err)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a wrong date sent %v", f.requests)
	}
	for _, args := range [][]string{{"accept", "estclosed000001", "--date", "2026-11-05"}, {"reject", "estclosed000001"}, {"reopen", "estclosed000001"}} {
		_, _, err := runCmd(t, f.serve(), "", append([]string{"books", "estimates"}, append(args, "--json")...)...)
		const want = "estimate estclosed000001 is closed: an invoice was made from it, so it cannot change; add a new estimate with `tinycld books estimates add`"
		if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), want) {
			t.Errorf("%v: exit = %d, err = %v", args, got, err)
		}
	}
	_, _, err := runCmd(t, f.serve(), "", "books", "estimates", "delete", "estclosed000001", "--yes", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || !strings.Contains(err.Error(), "estimate estclosed000001 is closed: it cannot be deleted") || strings.Contains(err.Error(), "estimates add") {
		t.Errorf("delete of a closed estimate: exit = %d, err = %v", got, err)
	}
	if f.lastPatch != nil || len(f.deleted) != 0 {
		t.Errorf("a closed estimate was written: patch %v, deleted %v", f.lastPatch, f.deleted)
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "estimates", "reject", "nosuchestimate1", "--json")
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Errorf("a missing estimate: exit = %d, err = %v", got, err)
	}
	// A pending or accepted estimate can be deleted.
	if _, _, err := runCmd(t, f.serve(), "", "books", "estimates", "delete", "estaccepted0001", "--yes", "--json"); err != nil {
		t.Fatal(err)
	}
}

func TestLoadDocumentsChecksAQuote(t *testing.T) {
	cases := []struct{ name, old, new, want string }{
		{"a quote with a draft status", `"enum": ["pending", "accepted", "rejected", "closed"]`, `"enum": ["draft", "posted", "void"]`, "a quote has a read-only status"},
		{"a quote with no accepted date", `"name": "accepted_date"`, `"name": "accepted_on"`, "a quote has a read-only string accepted_date"},
		{"a quote with an entry", `"lifecycle": "quote",`, `"lifecycle": "quote", "entry": "invoice",`, "a quote posts nothing"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !strings.Contains(string(documentsJSON), tc.old) {
				t.Fatalf("documents.json has no %s", tc.old)
			}
			_, err := loadDocuments([]byte(strings.Replace(string(documentsJSON), tc.old, tc.new, 1)))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want one that says %q", err, tc.want)
			}
		})
	}
}
