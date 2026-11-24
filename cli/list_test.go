package cli

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

type listOut struct {
	Items []map[string]any `json:"items"`
	Page  int              `json:"page"`
	Limit int              `json:"limit"`
	Total int              `json:"total"`
}

func listJSON(t *testing.T, f *fakeBooks, args ...string) listOut {
	t.Helper()
	out, _, err := runCmd(t, f.serve(), "", append(args, "--json")...)
	if err != nil {
		t.Fatalf("%v: %v", args, err)
	}
	var got listOut
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("%v: stdout is not one JSON document: %v\n%s", args, err, out)
	}
	return got
}

func names(l listOut) []string {
	out := make([]string, len(l.Items))
	for i, item := range l.Items {
		out[i], _ = item["name"].(string)
	}
	return out
}

func TestListTable(t *testing.T) {
	f := chart(t)
	out, _, err := runCmd(t, f.serve(), "", "books", "accounts", "list")
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 4 {
		t.Fatalf("want a header and 3 active accounts:\n%s", out)
	}
	if got := strings.Fields(lines[0]); strings.Join(got, " ") != "NUMBER NAME TYPE DETAIL_TYPE INACTIVE ID" {
		t.Errorf("header = %v", got)
	}
	if got := strings.Fields(lines[1]); strings.Join(got, " ") != "1000 Checking bank checking no acctchecking001" {
		t.Errorf("first row = %v", got)
	}
	if strings.Contains(out, "Old Card") {
		t.Errorf("an inactive account was listed:\n%s", out)
	}
}

func TestListSendsSortPageAndTheActiveFilter(t *testing.T) {
	f := chart(t)
	listJSON(t, f, "books", "accounts", "list")
	q := f.lastQuery
	if q.Get("filter") != "inactive = false" || q.Get("sort") != "full_name,id" {
		t.Errorf("filter = %q, sort = %q", q.Get("filter"), q.Get("sort"))
	}
	if q.Get("page") != "1" || q.Get("perPage") != "200" {
		t.Errorf("page = %q, perPage = %q", q.Get("page"), q.Get("perPage"))
	}
	if q.Get("skipTotal") != "" {
		t.Error("list must ask for the total: `total` in the result needs it")
	}
}

func TestListJSONIsOneEnvelope(t *testing.T) {
	got := listJSON(t, chart(t), "books", "accounts", "list")
	if got.Page != 1 || got.Limit != 200 || got.Total != 3 || len(got.Items) != 3 {
		t.Fatalf("envelope = page %d, limit %d, total %d, %d items", got.Page, got.Limit, got.Total, len(got.Items))
	}
	first := got.Items[0]
	if first["id"] != "acctchecking001" || first["full_name"] != "Checking" || first["inactive"] != false {
		t.Errorf("first item = %v", first)
	}
	if _, ok := first["future_column"]; ok {
		t.Error("a column that resources.json does not name must not be printed")
	}
}

func TestListInactiveAndAll(t *testing.T) {
	if got := names(listJSON(t, chart(t), "books", "accounts", "list", "--inactive")); fmt.Sprint(got) != "[Old Card]" {
		t.Errorf("--inactive listed %v", got)
	}
	f := chart(t)
	if got := listJSON(t, f, "books", "accounts", "list", "--all"); got.Total != 4 {
		t.Errorf("--all listed %d of 4", got.Total)
	}
	if f.lastQuery.Get("filter") != "" {
		t.Errorf("--all sent the filter %q", f.lastQuery.Get("filter"))
	}
	_, _, err := runCmd(t, chart(t).serve(), "", "books", "accounts", "list", "--all", "--inactive")
	if got := exitcode.Of(err); got != exitcode.Usage {
		t.Errorf("--all with --inactive: exit = %d, want 2; err: %v", got, err)
	}
}

func TestListFilterFlagsAndSearch(t *testing.T) {
	f := chart(t)
	if got := names(listJSON(t, f, "books", "accounts", "list", "--type", "bank")); fmt.Sprint(got) != "[Checking Savings]" {
		t.Errorf("--type bank listed %v", got)
	}
	if got := f.lastQuery.Get("filter"); got != `inactive = false && type = "bank"` {
		t.Errorf("filter = %q", got)
	}
	if got := names(listJSON(t, f, "books", "accounts", "list", "--search", "sav")); fmt.Sprint(got) != "[Savings]" {
		t.Errorf("--search sav listed %v", got)
	}
	if got := f.lastQuery.Get("filter"); got != `inactive = false && (name ~ "sav" || number ~ "sav")` {
		t.Errorf("filter = %q", got)
	}
	if got := names(listJSON(t, f, "books", "accounts", "list", "--search", "40", "--type", "income")); fmt.Sprint(got) != "[Consulting Income]" {
		t.Errorf("--search 40 --type income listed %v", got)
	}
	// An empty value is a filter too: the top-level accounts.
	listJSON(t, f, "books", "accounts", "list", "--parent", "")
	if got := f.lastQuery.Get("filter"); got != `inactive = false && parent = ""` {
		t.Errorf("filter = %q", got)
	}
}

// A quote or a backslash in --search is text to look for. It must reach the
// server inside the quoted value, never as filter syntax.
func TestListSearchTextCannotChangeTheFilter(t *testing.T) {
	f := chart(t)
	f.rawFilter = true
	listJSON(t, f, "books", "accounts", "list", "--search", `x" || id != "`, "--type", `a\"b`)
	want := `inactive = false && type = "a\\\"b" && (name ~ "x\" || id != \"" || number ~ "x\" || id != \"")`
	if got := f.lastQuery.Get("filter"); got != want {
		t.Errorf("filter =\n  %s\nwant\n  %s", got, want)
	}
}

// The accounts sort is full_name,id: page 1 holds the two names that sort first.
func TestListPages(t *testing.T) {
	f := chart(t)
	c := f.serve()
	out, errOut, err := runCmd(t, c, "", "books", "accounts", "list", "--limit", "2", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var first listOut
	if err := json.Unmarshal([]byte(out), &first); err != nil {
		t.Fatalf("stdout must stay one JSON document when there are more pages: %v\n%s", err, out)
	}
	if first.Total != 3 || first.Limit != 2 || fmt.Sprint(names(first)) != "[Checking Consulting Income]" {
		t.Errorf("page 1 = %+v", first)
	}
	if !strings.Contains(errOut, "2 of 3 accounts shown: pass --page 2 for more") {
		t.Errorf("stderr does not say that there is more:\n%s", errOut)
	}
	second := listJSON(t, f, "books", "accounts", "list", "--limit", "2", "--page", "2")
	if second.Page != 2 || fmt.Sprint(names(second)) != "[Savings]" {
		t.Errorf("page 2 = %+v", second)
	}
	past := listJSON(t, f, "books", "accounts", "list", "--limit", "2", "--page", "9")
	if past.Items == nil || len(past.Items) != 0 || past.Total != 3 {
		t.Errorf("a page past the end must be an empty items array with the total: %+v", past)
	}
}

func TestListEmptyIsAnEmptyArray(t *testing.T) {
	f := newFakeBooks(t)
	f.rows["books_accounts"] = []rawRecord{}
	out, _, err := runCmd(t, f.serve(), "", "books", "accounts", "list", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, `"items": []`) {
		t.Errorf("an empty list must print \"items\": [], not null:\n%s", out)
	}
}

func TestListRefusesABadLimitOrPage(t *testing.T) {
	for _, args := range [][]string{
		{"--limit", "0"}, {"--limit", "-1"}, {"--limit", "501"}, {"--page", "0"},
	} {
		f := chart(t)
		_, _, err := runCmd(t, f.serve(), "", append([]string{"books", "accounts", "list"}, args...)...)
		if got := exitcode.Of(err); got != exitcode.Usage {
			t.Errorf("%v: exit = %d, want 2; err: %v", args, got, err)
		}
		if len(f.requests) != 0 {
			t.Errorf("%v: a request was sent: %v", args, f.requests)
		}
	}
}

func TestListCSV(t *testing.T) {
	out, _, err := runCmd(t, chart(t).serve(), "", "books", "accounts", "list", "--output", "csv", "--type", "income")
	if err != nil {
		t.Fatal(err)
	}
	want := "NUMBER,NAME,TYPE,DETAIL_TYPE,INACTIVE,ID\n4000,Consulting Income,income,service_income,no,acctincome00001\n"
	if out != want {
		t.Errorf("csv =\n%s\nwant\n%s", out, want)
	}
}
