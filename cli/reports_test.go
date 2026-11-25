package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// reportsFake holds two Books reports (one shipped, one a person built) and a
// report of another package, which the group never shows.
func reportsFake(t *testing.T) *fakeBooks {
	f := newFakeBooks(t)
	f.add(reportsCollection, "rep000000000001", map[string]any{
		"title": "Trial Balance", "description": "Each account's balance on one day.",
		"source": "books.account_balances", "shipped_key": "books.trial_balance", "published": false, "broken": false,
		"spec": map[string]any{"version": 4, "params": []any{
			map[string]any{"id": "asOf", "type": "asOf", "label": "As of"},
		}},
	})
	f.add(reportsCollection, "rep000000000002", map[string]any{
		"title": "My Sales", "description": "", "source": "books.sales_lines", "shipped_key": "",
		"published": true, "broken": false, "spec": map[string]any{"version": 4},
	})
	f.add(reportsCollection, "rep000000000003", map[string]any{
		"title": "Open Cards", "description": "", "source": "boards.cards", "shipped_key": "boards.open_cards",
		"published": true, "broken": false, "spec": map[string]any{"version": 4},
	})
	return f
}

// The server filters the list (the fixture of cli/testdata/list-filters.json
// holds the text, and server/cli_reports_test.go what it finds). The fake
// does not read a "starts with" value, so it gives every row here.
func TestReportsListAsksForTheBooksReports(t *testing.T) {
	f := reportsFake(t)
	f.rawFilter = true
	out, _, err := runCmd(t, f.serve(), "", "books", "reports", "list", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Items []map[string]any `json:"items"`
		Total int              `json:"total"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	if got.Total != 3 || got.Items[0]["title"] != "My Sales" || got.Items[2]["shipped_key"] != "books.trial_balance" {
		t.Fatalf("list:\n%s", out)
	}
	if _, has := got.Items[0]["spec"]; has {
		t.Errorf("list prints the spec:\n%s", out)
	}
	if filter := f.lastQuery.Get("filter"); filter != `(source ~ "books.%")` {
		t.Errorf("filter = %q", filter)
	}
	if sort := f.lastQuery.Get("sort"); sort != "title,id" {
		t.Errorf("sort = %q", sort)
	}
}

func TestReportsListSearch(t *testing.T) {
	f := reportsFake(t)
	f.rawFilter = true
	out, _, err := runCmd(t, f.serve(), "", "books", "reports", "list", "--search", "trial")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "Trial Balance") || !strings.Contains(out, "books.trial_balance") {
		t.Errorf("table:\n%s", out)
	}
	if filter := f.lastQuery.Get("filter"); filter != `(source ~ "books.%") && (title ~ "trial" || description ~ "trial")` {
		t.Errorf("filter = %q", filter)
	}
}

func TestReportsShowByKeyAndByID(t *testing.T) {
	f := reportsFake(t)
	for _, ref := range []string{"books.trial_balance", "rep000000000001"} {
		out, _, err := runCmd(t, f.serve(), "", "books", "reports", "show", ref, "--json")
		if err != nil {
			t.Fatalf("%s: %v", ref, err)
		}
		var got struct {
			ID     string `json:"id"`
			Title  string `json:"title"`
			Params []struct {
				ID   string `json:"id"`
				Type string `json:"type"`
			} `json:"params"`
		}
		if err := json.Unmarshal([]byte(out), &got); err != nil {
			t.Fatalf("%v\n%s", err, out)
		}
		if got.ID != "rep000000000001" || got.Title != "Trial Balance" || len(got.Params) != 1 || got.Params[0].ID != "asOf" || got.Params[0].Type != "asOf" {
			t.Errorf("%s:\n%s", ref, out)
		}
	}
	if filter := f.listed[reportsCollection][0].Get("filter"); filter != `shipped_key = "books.trial_balance"` {
		t.Errorf("the key lookup sent filter %q", filter)
	}
}

func TestReportsShowOfAReportWithNoParamsHasAnEmptyList(t *testing.T) {
	out, _, err := runCmd(t, reportsFake(t).serve(), "", "books", "reports", "show", "rep000000000002", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, `"params": []`) {
		t.Errorf("show:\n%s", out)
	}
}

// A report of another package, an unknown key and an unknown id are all "no
// such Books report": exit 5.
func TestReportsShowRefusesWhatIsNotABooksReport(t *testing.T) {
	for _, ref := range []string{"rep000000000003", "boards.open_cards", "books.nope", "nope"} {
		out, _, err := runCmd(t, reportsFake(t).serve(), "", "books", "reports", "show", ref, "--json")
		if got := exitcode.Of(err); got != exitcode.NotFound {
			t.Errorf("%s: exit = %d, want 5; err: %v", ref, got, err)
			continue
		}
		if !strings.Contains(out, `"code": "not_found"`) || !strings.Contains(err.Error(), ref) {
			t.Errorf("%s: %v\n%s", ref, err, out)
		}
	}
}
