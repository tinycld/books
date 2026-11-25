package cli

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// journal is the chart with three journal entries:
//
//	entrydraft00001  2026-07-15  draft   journal  two lines, 1200.00, revision 1
//	entryposted0001  2026-07-10  posted  journal  number 7, two lines, 500.00
//	entryinvoice001  2026-07-12  posted  invoice  the entry Books wrote for an invoice
func journal(t *testing.T) *fakeBooks {
	t.Helper()
	f := chart(t)
	entry := func(id, date, status, docType, origin, number string, total int) {
		f.add("books_journal_entries", id, map[string]any{
			"date": date, "memo": "", "auto_reverse_on": "", "status": status, "doc_type": docType, "origin": origin,
			"document": "", "number": number, "total": json.Number(strconv.Itoa(total)),
			"revision": json.Number("1"), "currency": "USD", "reverses": "", "replaces": "",
			// A column the CLI leaves out.
			"sequence": json.Number("7"),
		})
	}
	line := func(id, entryID, account string, debit, credit, position int, memo string) {
		f.add("books_journal_lines", id, map[string]any{
			"entry": entryID, "account": account, "debit": json.Number(strconv.Itoa(debit)), "credit": json.Number(strconv.Itoa(credit)),
			"memo": memo, "customer": "", "vendor": "", "position": json.Number(strconv.Itoa(position)), "posted": false,
		})
	}
	entry("entrydraft00001", "2026-07-15", "draft", "journal", "manual", "", 120000)
	entry("entryposted0001", "2026-07-10", "posted", "journal", "manual", "7", 50000)
	entry("entryinvoice001", "2026-07-12", "posted", "invoice", "document", "8", 9900)
	// Stored out of order: the command sorts by position.
	line("linedraft000002", "entrydraft00001", "acctincome00001", 0, 120000, 1, "July")
	line("linedraft000001", "entrydraft00001", "acctchecking001", 120000, 0, 0, "")
	line("lineposted00001", "entryposted0001", "acctchecking001", 50000, 0, 0, "")
	line("lineposted00002", "entryposted0001", "acctsavings0001", 0, 50000, 1, "")
	return f
}

func TestDocumentShowPrintsTheHeaderThenTheLines(t *testing.T) {
	f := journal(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "show", "entrydraft00001", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		ID     string      `json:"id"`
		Status string      `json:"status"`
		Total  json.Number `json:"total"`
		Lines  []struct {
			ID      string      `json:"id"`
			Account string      `json:"account"`
			Debit   json.Number `json:"debit"`
			Credit  json.Number `json:"credit"`
		} `json:"lines"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("stdout is not one JSON document: %v\n%s", err, out)
	}
	if got.ID != "entrydraft00001" || got.Status != "draft" || got.Total != "120000" {
		t.Errorf("header = %+v", got)
	}
	if len(got.Lines) != 2 || got.Lines[0].ID != "linedraft000001" || got.Lines[0].Debit != "120000" || got.Lines[1].Credit != "120000" {
		t.Errorf("lines = %+v", got.Lines)
	}
	// One shape whatever the server sends: a column the CLI leaves out is not
	// printed, and the keys the CLI sets are not part of a line.
	for _, absent := range []string{`"sequence"`, `"position"`, `"entry"`} {
		if strings.Contains(out, absent) {
			t.Errorf("the document has %s:\n%s", absent, out)
		}
	}
	if !strings.HasPrefix(out, "{\n    \"id\": \"entrydraft00001\",\n    \"date\": \"2026-07-15\"") || strings.Index(out, `"lines"`) < strings.Index(out, `"updated"`) {
		t.Errorf("the keys are not in the declared order:\n%s", out)
	}
	if got := f.lastQuery.Get("filter"); got != `entry = "entrydraft00001"` || f.lastQuery.Get("sort") != "position,id" {
		t.Errorf("the lines were asked for with filter %q, sort %q", got, f.lastQuery.Get("sort"))
	}
}

func TestDocumentShowAsATable(t *testing.T) {
	out, _, err := runCmd(t, journal(t).serve(), "", "books", "journal-entries", "show", "entryposted0001")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"FIELD", "number", "LINES", "ACCOUNT", "DEBIT", "acctsavings0001", "lineposted00002"} {
		if !strings.Contains(out, want) {
			t.Errorf("the table has no %q:\n%s", want, out)
		}
	}
	assertLinesAfterHeader(t, out)
}

// assertLinesAfterHeader fails when a header key is missing or comes after the
// line table.
func assertLinesAfterHeader(t *testing.T, out string) {
	t.Helper()
	lines := strings.Index(out, "\nLINES\n")
	if lines < 0 {
		t.Fatalf("no line table:\n%s", out)
	}
	for _, key := range []string{"id", "date", "status", "number", "total", "updated"} {
		at := strings.Index(out, "\n"+key+",")
		if at < 0 {
			at = strings.Index(out, "\n"+key+" ")
		}
		if at < 0 || at > lines {
			t.Errorf("header key %q is missing or after the line table:\n%s", key, out)
		}
	}
}

func TestDocumentShowAsCSVKeepsTheLines(t *testing.T) {
	out, _, err := runCmd(t, journal(t).serve(), "", "books", "journal-entries", "show", "entryposted0001", "--output", "csv")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"FIELD,VALUE", "ACCOUNT", "acctsavings0001", "lineposted00001", "lineposted00002"} {
		if !strings.Contains(out, want) {
			t.Errorf("the csv has no %q:\n%s", want, out)
		}
	}
	assertLinesAfterHeader(t, out)
}

func TestDocumentShowOfAMissingDocumentIsExit5(t *testing.T) {
	_, _, err := runCmd(t, journal(t).serve(), "", "books", "journal-entries", "show", "nosuchentry0001", "--json")
	if got := exitcode.Of(err); got != exitcode.NotFound {
		t.Errorf("exit = %d, want %d (%v)", got, exitcode.NotFound, err)
	}
	if err == nil || !strings.Contains(err.Error(), "journal entry nosuchentry0001") {
		t.Errorf("the error does not name the record: %v", err)
	}
}

func TestDocumentListFiltersByStatusAndType(t *testing.T) {
	f := journal(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "journal-entries", "list", "--type", "invoice", "--status", "posted", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if got := f.lastQuery.Get("filter"); got != `status = "posted" && doc_type = "invoice"` {
		t.Errorf("filter = %q", got)
	}
	if got := f.lastQuery.Get("sort"); got != "-date,-created,id" {
		t.Errorf("sort = %q", got)
	}
	var list struct {
		Total int              `json:"total"`
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal([]byte(out), &list); err != nil {
		t.Fatal(err)
	}
	if list.Total != 1 || list.Items[0]["id"] != "entryinvoice001" {
		t.Errorf("list = %+v", list)
	}
	// A list row is the header only.
	if _, has := list.Items[0]["lines"]; has {
		t.Error("a list row has lines")
	}
	_, _, err = runCmd(t, f.serve(), "", "books", "journal-entries", "list", "--status", "open")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("a status the field does not have: exit = %d, want %d", got, exitcode.Usage)
	}
}

func TestDocumentGroupHasAnAliasAndASchema(t *testing.T) {
	out, _, err := runCmd(t, journal(t).serve(), "", "books", "journal-entry", "show", "entrydraft00001", "--json")
	if err != nil || !strings.Contains(out, `"id": "entrydraft00001"`) {
		t.Errorf("the alias journal-entry: %v\n%s", err, out)
	}
	out, _, err = runCmd(t, nil, "", "books", "schema", "journal-entries", "show", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, `"command": "tinycld books journal-entries show"`) || !strings.Contains(out, `"lines"`) {
		t.Errorf("schema of journal-entries show:\n%s", out)
	}
}
