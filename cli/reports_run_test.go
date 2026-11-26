package cli

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"tinycld.org/cli/exitcode"
)

// The pages of a two-page report, as core's run route answers them.
const (
	reportPageOne = `{"columns":[{"id":"debit","label":"Debit","type":"money","currency":"USD"},{"id":"credit","label":"Credit","type":"money","currency":"USD"}],
		"rows":[{"id":"g1","kind":"group","depth":0,"label":"Assets","cells":{"debit":150000,"credit":null}},
			{"id":"d1","kind":"detail","depth":1,"label":"1000 Checking","cells":{"debit":150000,"credit":null}},
			{"id":"t","kind":"total","depth":0,"label":"Total","cells":{"debit":150000,"credit":150000}}],
		"notices":[{"code":"rowCap","message":"Only the first rows are shown."}],
		"topics":[],"heading":"","page":{"next":"cur2","size":2},
		"params":[{"id":"asOf","type":"asOf","value":"2026-07-15"}],"headerLines":["Accrual basis"]}`
	reportPageTwo = `{"columns":[{"id":"debit","label":"Debit","type":"money","currency":"USD"},{"id":"credit","label":"Credit","type":"money","currency":"USD"}],
		"rows":[{"id":"g1","kind":"group","depth":0,"label":"Assets","cells":{"debit":150000,"credit":null}},
			{"id":"d2","kind":"detail","depth":1,"label":"3000 Equity","cells":{"debit":null,"credit":150000}},
			{"id":"t","kind":"total","depth":0,"label":"Total","cells":{"debit":150000,"credit":150000}}],
		"notices":[{"code":"rowCap","message":"Only the first rows are shown."}],"topics":[],"heading":"","page":{"size":2},
		"params":[{"id":"asOf","type":"asOf","value":"2026-07-15"}],"headerLines":["Accrual basis"]}`
)

type runOut struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	HeaderLines []string         `json:"headerLines"`
	Params      []map[string]any `json:"params"`
	Columns     []map[string]any `json:"columns"`
	Rows        []struct {
		ID    string         `json:"id"`
		Kind  string         `json:"kind"`
		Cells map[string]any `json:"cells"`
	} `json:"rows"`
	Notices []map[string]any `json:"notices"`
	Next    *string          `json:"next"`
}

func runJSON(t *testing.T, f *fakeBooks, stdin string, args ...string) runOut {
	t.Helper()
	out, _, err := runCmd(t, f.serve(), stdin, append([]string{"books", "reports", "run"}, append(args, "--json")...)...)
	if err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	var got runOut
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	return got
}

func TestReportsRunSendsTheReportAndPrintsThePage(t *testing.T) {
	f := reportsFake(t)
	f.reports.pages = []string{reportPageOne}
	got := runJSON(t, f, "", "books.trial_balance")
	if sent := sentJSON(f.reports.runs[0]); sent != `{"reportId":"rep000000000001"}` {
		t.Errorf("sent %s", sent)
	}
	if got.ID != "rep000000000001" || got.Title != "Trial Balance" || got.Next == nil || *got.Next != "cur2" {
		t.Errorf("result: %+v", got)
	}
	if len(got.Rows) != 3 || got.Rows[1].Kind != "detail" || got.Rows[1].Cells["debit"] != float64(150000) || got.Rows[1].Cells["credit"] != nil {
		t.Errorf("rows: %+v", got.Rows)
	}
	if len(got.Columns) != 2 || got.Columns[0]["currency"] != "USD" || got.HeaderLines[0] != "Accrual basis" || got.Params[0]["value"] != "2026-07-15" || got.Notices[0]["code"] != "rowCap" {
		t.Errorf("result: %+v", got)
	}
}

func TestReportsRunSendsParamsOptionsAndFlags(t *testing.T) {
	f := reportsFake(t)
	f.reports.pages = []string{reportPageTwo}
	input := `{"params": {"asOf": "2026-07-15"}, "options": {"today": "2026-07-20", "limit": 5}}`
	got := runJSON(t, f, input, "rep000000000001", "--input", "-", "--limit", "2", "--cursor", "cur2", "--expand-all")
	want := `{"options":{"cursor":"cur2","expandAll":true,"limit":2,"today":"2026-07-20"},"params":{"asOf":"2026-07-15"},"reportId":"rep000000000001"}`
	if sent := sentJSON(f.reports.runs[0]); sent != want {
		t.Errorf("sent %s\nwant %s", sent, want)
	}
	if got.Next == nil || *got.Next != "" {
		t.Errorf("the last page must print next \"\": %+v", got.Next)
	}
}

func TestReportsRunAllReadsEveryPage(t *testing.T) {
	f := reportsFake(t)
	f.reports.pages = []string{reportPageOne, reportPageTwo}
	got := runJSON(t, f, "", "books.trial_balance", "--all")
	if len(f.reports.runs) != 2 || sentJSON(f.reports.runs[1]) != `{"options":{"cursor":"cur2"},"reportId":"rep000000000001"}` {
		t.Errorf("runs: %v", f.reports.runs)
	}
	// The server puts the whole-report rows (the Total) at the end of every
	// page, and a group row again on the page that continues the group. The
	// result holds each row one time, and a notice one time.
	ids := []string{}
	for _, row := range got.Rows {
		ids = append(ids, row.ID)
	}
	if strings.Join(ids, " ") != "g1 d1 d2 t" || *got.Next != "" || len(got.Notices) != 1 {
		t.Errorf("rows %v, result: %+v", ids, got)
	}
}

// A page names only what its own rows show, so notices of one code join as
// core's joinNotices does: the sentences (parts) and the columns and conditions
// of every page once, in first-seen order; the other keys are the first page's.
func TestReportsRunAllJoinsNoticesOfOneCode(t *testing.T) {
	page := func(next, notices string) string {
		return `{"columns":[],"rows":[],"notices":` + notices + `,"topics":[],"heading":"","page":{"next":"` + next + `"},"params":[],"headerLines":[]}`
	}
	f := reportsFake(t)
	f.reports.pages = []string{
		page("cur2", `[{"code":"mixedCurrency","message":"Credit mixes currencies.","columns":["credit"],"conditions":["c1"],"severity":"warn"},{"code":"rowCap","message":"Capped."}]`),
		page("cur3", `[{"code":"mixedCurrency","message":"Debit mixes currencies. Credit mixes currencies.","parts":["Debit mixes currencies.","Credit mixes currencies."],"columns":["debit","credit"],"conditions":["c1","c2"],"severity":"error"}]`),
		page("", `[{"code":"mixedCurrency","message":"Debit mixes currencies.","columns":["debit"]},{"code":"rowCap","message":"Capped."}]`),
	}
	got := runJSON(t, f, "", "books.trial_balance", "--all")
	if len(got.Notices) != 2 {
		t.Fatalf("notices: %+v", got.Notices)
	}
	mixed, capped := got.Notices[0], got.Notices[1]
	if mixed["code"] != "mixedCurrency" || mixed["message"] != "Credit mixes currencies. Debit mixes currencies." || mixed["severity"] != "warn" {
		t.Errorf("joined notice: %+v", mixed)
	}
	if want := `["Credit mixes currencies.","Debit mixes currencies."]`; jsonText(mixed["parts"]) != want {
		t.Errorf("parts %s, want %s", jsonText(mixed["parts"]), want)
	}
	if want := `["credit","debit"]`; jsonText(mixed["columns"]) != want {
		t.Errorf("columns %s, want %s", jsonText(mixed["columns"]), want)
	}
	if want := `["c1","c2"]`; jsonText(mixed["conditions"]) != want {
		t.Errorf("conditions %s, want %s", jsonText(mixed["conditions"]), want)
	}
	if capped["code"] != "rowCap" || capped["message"] != "Capped." || capped["parts"] != nil || capped["columns"] != nil {
		t.Errorf("single notice: %+v", capped)
	}
}

func jsonText(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestReportsRunTable(t *testing.T) {
	f := reportsFake(t)
	f.reports.pages = []string{reportPageOne}
	out, errOut, err := runCmd(t, f.serve(), "", "books", "reports", "run", "books.trial_balance")
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 4 || strings.Join(strings.Fields(lines[0]), " ") != "ROW DEBIT CREDIT" ||
		strings.Join(strings.Fields(lines[1]), " ") != "Assets 150000" || !strings.HasPrefix(lines[2], "  1000 Checking") {
		t.Errorf("table:\n%s", out)
	}
	if !strings.Contains(errOut, "Notice: Only the first rows are shown.") || !strings.Contains(errOut, "--cursor cur2") {
		t.Errorf("stderr:\n%s", errOut)
	}
}

func TestReportsRunUsageErrorsSendNothing(t *testing.T) {
	cases := []struct {
		name, stdin, want string
		args              []string
	}{
		{"all with cursor", "", "--all and --cursor", []string{"--all", "--cursor", "x"}},
		{"negative limit", "", "--limit", []string{"--limit", "-1"}},
		{"unknown key", `{"param": {}}`, `unknown key "param"`, []string{"--input", "-"}},
		{"params not an object", `{"params": []}`, `"params" must be an object`, []string{"--input", "-"}},
		{"cursor in options", `{"options": {"cursor": "x"}}`, "--cursor", []string{"--input", "-"}},
	}
	for _, c := range cases {
		f := reportsFake(t)
		_, _, err := runCmd(t, f.serve(), c.stdin, append([]string{"books", "reports", "run", "books.trial_balance"}, c.args...)...)
		if got := exitcode.Of(err); got != exitcode.Usage || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: exit %d, err %v", c.name, got, err)
		}
		if len(f.reports.runs) != 0 {
			t.Errorf("%s: a run was sent", c.name)
		}
	}
}

// The server's refusals keep their codes: a token without the scope is exit 4,
// a refused param exit 6, each with the server's message.
func TestReportsRunReportsTheServersRefusal(t *testing.T) {
	cases := []struct {
		status int
		body   string
		exit   int
	}{
		{http.StatusForbidden, `{"data":{},"message":"Requires the \"reports\" scope.","status":403}`, exitcode.Forbidden},
		{http.StatusBadRequest, `{"data":{},"message":"params.asOf: not a day","status":400}`, exitcode.Refused},
	}
	for _, c := range cases {
		f := reportsFake(t)
		f.reports.pages = []string{reportPageOne}
		f.refuse(http.MethodPost, c.status, c.body)
		out, _, err := runCmd(t, f.serve(), "", "books", "reports", "run", "books.trial_balance", "--json")
		if got := exitcode.Of(err); got != c.exit {
			t.Errorf("status %d: exit %d, want %d; err %v", c.status, got, c.exit, err)
		}
		var doc errorDoc
		if json.Unmarshal([]byte(out), &doc) != nil || doc.Error.Status != c.status || doc.Error.Message == "" {
			t.Errorf("status %d: error document:\n%s", c.status, out)
		}
	}
}

func TestReportsRunOfAnUnknownReportSendsNoRun(t *testing.T) {
	f := reportsFake(t)
	_, _, err := runCmd(t, f.serve(), "", "books", "reports", "run", "books.nope")
	if got := exitcode.Of(err); got != exitcode.NotFound || len(f.reports.runs) != 0 {
		t.Errorf("exit %d, runs %d", got, len(f.reports.runs))
	}
}
