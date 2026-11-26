package cli

import (
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// moved is the journal fixture with one posted transfer and one draft transfer.
// The fixture's other entries (two made by hand, one of an invoice) are not
// transfers.
func moved(t *testing.T) *fakeBooks {
	t.Helper()
	f := journal(t)
	transfer := func(id, status, number string) {
		f.addRow("books_journal_entries", id, map[string]any{
			"date": "2026-07-15", "memo": "To savings", "status": status, "doc_type": "transfer", "origin": "manual",
			"number": number, "total": cents(50000), "revision": cents(1), "currency": "USD",
		})
		f.addRow("books_journal_lines", id[:12]+"002", map[string]any{
			"entry": id, "position": cents(1), "account": "acctsavings0001", "debit": cents(50000), "credit": cents(0),
		})
		f.addRow("books_journal_lines", id[:12]+"001", map[string]any{
			"entry": id, "position": cents(0), "account": "acctchecking001", "debit": cents(0), "credit": cents(50000),
		})
	}
	transfer("transferposted1", "posted", "TR-1")
	transfer("transferdraft01", "draft", "")
	return f
}

const newTransfer = `{"date": "2026-07-15", "memo": "To savings", "lines": [
	{"account": "acctchecking001", "credit": 50000},
	{"account": "acctsavings0001", "debit": 50000}]}`

// The batch of `transfers add --post`: a journal entry with the fixed values of
// a transfer. server/cli_transfers_test.go sends a copy.
func TestTransferAddSendsAJournalEntryOfTheTypeTransfer(t *testing.T) {
	f := moved(t)
	fixedIDs(t, "transfernew0001")
	_, errOut, err := runCmd(t, f.serve(), newTransfer, "books", "transfers", "add", "--input", "-", "--post", "--json")
	if err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_journal_entries/records","body":{"date":"2026-07-15","doc_type":"transfer","id":"transfernew0001","memo":"To savings","origin":"manual","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctchecking001","credit":50000,"entry":"transfernew0001","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctsavings0001","debit":50000,"entry":"transfernew0001","position":1}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/transfernew0001","body":{"revision":1,"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the batch:\n%s\nwant:\n%s", got, want)
	}
	if !strings.Contains(errOut, "added and posted transfer") {
		t.Errorf("stderr = %q", errOut)
	}
}

// `list` of a scoped type filters by its fixed values, with the flags after.
func TestTransferListShowsOnlyTransfers(t *testing.T) {
	f := moved(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "transfers", "list", "--status", "posted", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := f.lastQuery.Get("filter"), `doc_type = "transfer" && origin = "manual" && status = "posted"`; got != want {
		t.Errorf("filter = %s, want %s", got, want)
	}
	if !strings.Contains(out, "transferposted1") || strings.Contains(out, "entryposted0001") || strings.Contains(out, "transferdraft01") {
		t.Errorf("the list:\n%s", out)
	}
	// `journal-entries list` is not scoped: it has every entry.
	if _, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "list", "--json"); err != nil {
		t.Fatal(err)
	}
	if got := f.lastQuery.Get("filter"); got != "" {
		t.Errorf("journal-entries list sent the filter %s", got)
	}
}

// A view of a scoped type is a list of its own: the scope of the type does not
// reach it. The copy of documents.json gives transfers a view of every journal
// entry, which a scope on the view would filter down to the transfers.
func TestScopeDoesNotReachAView(t *testing.T) {
	view := `"views": [{"word": "entries", "long": "List every journal entry.", "name": "entries", "singular": "entry", ` +
		`"summary": "List every journal entry", "collection": "books_journal_entries", "sort": "date,number,id", "label": "number", ` +
		`"columns": ["date", "number"], "search": [], "filters": [], "omit": [], "timestamps": [], ` +
		`"fields": [{"name": "date", "type": "string", "readOnly": true, "help": "the date"}, {"name": "number", "type": "string", "readOnly": true, "help": "the number"}]}],`
	text := strings.Replace(string(documentsJSON), `"scoped": true,`, `"scoped": true, `+view, 1)
	if !strings.Contains(text, `"word": "entries"`) {
		t.Fatal("documents.json has no scoped type to give a view")
	}
	docs, err := loadDocuments([]byte(text))
	if err != nil {
		t.Fatal(err)
	}
	f := moved(t)
	c := f.serve()
	root := newTestRoot(c)
	books, _, err := root.Find([]string{"books"})
	if err != nil {
		t.Fatal(err)
	}
	group, _, err := root.Find([]string{"books", "transfers"})
	if err != nil {
		t.Fatal(err)
	}
	books.RemoveCommand(group)
	books.AddCommand(newDocumentCmd(c, documentNamed(t, docs, "transfers")))
	out, _, err := runRoot(t, root, "", "books", "transfers", "entries", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got := f.lastQuery.Get("filter"); got != "" {
		t.Errorf("the view sent the filter %s, want none", got)
	}
	if !strings.Contains(out, "entryposted0001") {
		t.Errorf("the view does not list an entry that is not a transfer:\n%s", out)
	}
}

// The scope of a type is its own copy of the fixed values: a change of the scope
// does not change the values a create sends.
func TestScopeIsItsOwnCopy(t *testing.T) {
	docs, err := loadDocuments(documentsJSON)
	if err != nil {
		t.Fatal(err)
	}
	doc := documentNamed(t, docs, "transfers")
	doc.scope["doc_type"] = "invoice"
	if got := doc.Fixed["doc_type"]; got != "transfer" {
		t.Errorf("fixed doc_type = %q after a change of the scope", got)
	}
}

// documentNamed is the type of the name in docs, a copy loaded by the test.
func documentNamed(t *testing.T, docs []document, name string) *document {
	t.Helper()
	for i := range docs {
		if docs[i].Name == name {
			return &docs[i]
		}
	}
	t.Fatalf("no document %q", name)
	return nil
}

// Every command of a scoped type answers "not found" for a record of the
// collection that is not of the type, and writes nothing.
func TestTransferCommandsDoNotReachAnotherJournalEntry(t *testing.T) {
	f := moved(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "transfers", "show", "transferposted1", "--json")
	if err != nil || !strings.Contains(out, `"number": "TR-1"`) || strings.Contains(out, "auto_reverse_on") || strings.Contains(out, `"customer"`) {
		t.Errorf("show (%v):\n%s", err, out)
	}
	if first, second := strings.Index(out, "acctchecking001"), strings.Index(out, "acctsavings0001"); first < 0 || second < first {
		t.Errorf("the lines are not in order:\n%s", out)
	}
	calls := [][]string{
		{"show", "entryposted0001"},
		{"show", "entryinvoice001"},
		{"void", "entryposted0001", "--yes"},
		{"post", "entrydraft00001"},
		{"delete", "entrydraft00001", "--yes"},
		{"edit", "entryposted0001", "--input", "-"},
	}
	for _, call := range calls {
		before := len(f.requests)
		_, _, err := runCmd(t, f.serve(), `{"memo": "x"}`, append([]string{"books", "transfers"}, append(call, "--json")...)...)
		if got := exitcode.Of(err); got != exitcode.NotFound || !strings.Contains(err.Error(), "so it is not a transfer") {
			t.Errorf("transfers %v: exit = %d, err = %v", call, got, err)
		}
		for _, request := range f.requests[before:] {
			if !strings.HasPrefix(request, "GET ") {
				t.Errorf("transfers %v sent %s", call, request)
			}
		}
	}
	// The other way stays a refusal: a transfer is not changed as a journal entry.
	// It names the command of the group that owns it.
	for _, word := range []string{"void", "post", "delete", "edit"} {
		args := []string{"books", "journal-entries", word, "transferposted1", "--yes", "--json"}
		if word == "edit" {
			args = append(args, "--input", "-")
		}
		_, _, err = runCmd(t, f.serve(), `{"memo": "x"}`, args...)
		if got := exitcode.Of(err); got != exitcode.Refused || err == nil || !strings.Contains(err.Error(), "use `tinycld books transfers "+word+" transferposted1`") {
			t.Errorf("journal-entries %s of a transfer: exit = %d, err = %v", word, got, err)
		}
	}
	// A record of no scoped type has no group to name.
	_, _, err = runCmd(t, f.serve(), "", "books", "journal-entries", "void", "entryinvoice001", "--yes", "--json")
	if got := exitcode.Of(err); got != exitcode.Refused || err == nil || !strings.Contains(err.Error(), "so change that transaction") {
		t.Errorf("journal-entries void of an invoice's entry: exit = %d, err = %v", got, err)
	}
}

func TestTransferPostVoidAndCorrection(t *testing.T) {
	f := moved(t)
	if _, _, err := runCmd(t, f.serve(), "", "books", "transfers", "post", "transferdraft01", "--json"); err != nil {
		t.Fatal(err)
	}
	if got, want := mustJSON(f.lastPatch), `{"revision":2,"status":"posted"}`; got != want {
		t.Errorf("post sent %s, want %s", got, want)
	}
	fixedIDs(t, "transfernew0001")
	if _, _, err := runCmd(t, f.serve(), `{"memo": "To savings, corrected"}`, "books", "transfers", "edit", "transferposted1", "--input", "-", "--json"); err != nil {
		t.Fatal(err)
	}
	want := `[` +
		`{"method":"POST","url":"/api/collections/books_journal_entries/records","body":{"date":"2026-07-15","doc_type":"transfer","id":"transfernew0001","memo":"To savings, corrected","origin":"manual","replaces":"transferposted1","status":"draft"}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctchecking001","credit":50000,"debit":0,"entry":"transfernew0001","memo":"","position":0}},` +
		`{"method":"POST","url":"/api/collections/books_journal_lines/records","body":{"account":"acctsavings0001","credit":0,"debit":50000,"entry":"transfernew0001","memo":"","position":1}},` +
		`{"method":"PATCH","url":"/api/collections/books_journal_entries/records/transfernew0001","body":{"revision":1,"status":"posted"}}]`
	if got := sentBatch(t, f, 0); got != want {
		t.Errorf("the correction:\n%s\nwant:\n%s", got, want)
	}
}

func TestTransferInputAndCommands(t *testing.T) {
	f := moved(t)
	cases := []struct{ input, want string }{
		{`{"memo": "x"}`, `"date" is required`},
		{`{"date": "2026-07-15", "auto_reverse_on": "2026-08-01"}`, `transfers has no field "auto_reverse_on"`},
		{`{"date": "2026-07-15", "doc_type": "journal"}`, `"doc_type" is set by the server`},
		{`{"date": "2026-07-15", "lines": [{"account": "acctchecking001", "credit": 1, "customer": "custacme0000001"}]}`, `lines[0]`},
		{`{"date": "2026-07-15", "lines": [{"account": "acctchecking001", "credit": 2}, {"account": "acctsavings0001", "debit": 1}, {"account": "acctsavings0001", "debit": 1}]}`,
			`"lines" has 3 rows: the most is 2`},
	}
	for _, tc := range cases {
		_, _, err := runCmd(t, f.serve(), tc.input, "books", "transfers", "add", "--input", "-", "--json")
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%.80s: exit = %d, err = %v, want %q", tc.input, got, err, tc.want)
		}
	}
	if len(f.requests) != 0 {
		t.Errorf("a refused input sent %v", f.requests)
	}
	group, _, err := newTestRoot(nil).Find([]string{"books", "transfers"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(subcommandNames(group), ","); got != "add,delete,edit,list,post,show,void" {
		t.Errorf("commands = %s", got)
	}
}

// scoped is checked when documents.json loads, and only a scoped type filters.
func TestLoadDocumentsChecksScoped(t *testing.T) {
	if !findDocument("transfers").Scoped || findDocument("journal-entries").Scoped || findDocument("journal-entries").scope != nil {
		t.Fatal("transfers is not scoped, or journal-entries is")
	}
	broken := strings.Replace(string(documentsJSON), `"lifecycle": "posted",`, `"lifecycle": "posted", "scoped": true,`, 1)
	if _, err := loadDocuments([]byte(broken)); err == nil || !strings.Contains(err.Error(), "scoped needs fixed") {
		t.Errorf("scoped with no fixed values: err = %v", err)
	}
}
