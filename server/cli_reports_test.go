package books

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/oauth"
	"tinycld.org/core/reports"
)

// cliReportScopes are the scopes the `tinycld books reports` commands need:
// the reports scope opens the saved reports and the run and export routes, and
// books:read the Books data a report reads.
var cliReportScopes = []string{oauth.ScopeReports, scopeRead}

// reportsEnv is a server with the shipped Books reports, a read-only Books
// user, and that user's access tokens.
type reportsEnv struct {
	app    *tests.TestApp
	reader *core.Record
	// token holds cliReportScopes; narrow holds the reports scope only.
	token, narrow string
	shipped       []*core.Record
}

func newReportsEnv(t *testing.T) *reportsEnv {
	t.Helper()
	reports.ResetForTesting()
	t.Cleanup(reports.ResetForTesting)
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	reports.Register(app)
	mkUser(t, app, "owner")
	reader := mkUser(t, app, "member")
	setPkgAccess(t, app, reader, "readonly")
	if err := reports.ReconcileShipped(app); err != nil {
		t.Fatalf("ReconcileShipped: %v", err)
	}
	if err := reconcileBooksReportShares(app); err != nil {
		t.Fatalf("reconcileBooksReportShares: %v", err)
	}
	shipped, err := app.FindRecordsByFilter("reports", "shipped_key != ''", "shipped_key", 0, 0)
	if err != nil {
		t.Fatalf("read the shipped reports: %v", err)
	}
	if len(shipped) != len(shippedNotLive) {
		t.Fatalf("%d shipped reports, want %d", len(shipped), len(shippedNotLive))
	}
	return &reportsEnv{
		app: app, reader: reader, shipped: shipped,
		token:  "Bearer " + oauthToken(t, app, reader, cliReportScopes...),
		narrow: "Bearer " + oauthToken(t, app, reader, oauth.ScopeReports),
	}
}

// serve runs fn with a function that sends one request to the server.
func (env *reportsEnv) serve(t *testing.T, fn func(send func(method, url, auth, body string) *httptest.ResponseRecorder)) {
	t.Helper()
	api, err := apis.NewRouter(env.app)
	if err != nil {
		t.Fatal(err)
	}
	err = env.app.OnServe().Trigger(&core.ServeEvent{App: env.app, Router: api}, func(e *core.ServeEvent) error {
		mux, err := e.Router.BuildMux()
		if err != nil {
			return err
		}
		fn(func(method, url, auth, body string) *httptest.ResponseRecorder {
			req := httptest.NewRequest(method, url, bytes.NewReader([]byte(body)))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", auth)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			return rec
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// Every shipped Books report runs for an access token that holds
// cliReportScopes: each collection a report reads rows from is in books:read.
// A new report over a collection outside it fails here. With the reports
// scope only, every one is refused: the scope alone reads no Books data.
func TestCLIReports_ATokenRunsEveryShippedReport(t *testing.T) {
	env := newReportsEnv(t)
	env.serve(t, func(send func(method, url, auth, body string) *httptest.ResponseRecorder) {
		for _, row := range env.shipped {
			key := row.GetString("shipped_key")
			// The body of `reports run <key>` with {"options": {"today": …}}.
			body := `{"options":{"today":"2026-11-09"},"reportId":"` + row.Id + `"}`
			if rec := send("POST", "/api/reports/run", env.token, body); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"columns":[`) {
				t.Errorf("%s: run answered %d: %s", key, rec.Code, rec.Body.String())
			}
			rec := send("POST", "/api/reports/run", env.narrow, body)
			if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "do not cover what this report reads") {
				t.Errorf("%s: run with the reports scope only answered %d: %s", key, rec.Code, rec.Body.String())
			}
		}
	})
}

// The requests of `reports list`, `reports show <key>` and `reports export`.
// The list texts are those of cli/testdata/list-filters.json; the key lookup
// and the export bodies are copies of what cli/reports_test.go and
// cli/reports_export_test.go hold the commands to.
func TestCLIReports_ListShowAndExportWithAToken(t *testing.T) {
	env := newReportsEnv(t)
	var trial *core.Record
	for _, row := range env.shipped {
		if row.GetString("shipped_key") == trialBalanceKey {
			trial = row
		}
	}
	// A report of the reader over a source of another package, whose key only
	// contains "books.": `reports list` asks for a source that starts with it.
	col, err := env.app.FindCollectionByNameOrId("reports")
	if err != nil {
		t.Fatal(err)
	}
	other := core.NewRecord(col)
	other.Set("owner", env.reader.Id)
	other.Set("title", "Trial of another package")
	other.Set("source", "ebooks.items")
	other.Set("spec", `{"version":4,"source":"ebooks.items","columns":[{"id":"name","path":[{"field":"name"}]}]}`)
	if err := env.app.Save(other); err != nil {
		t.Fatalf("save the other report: %v", err)
	}
	const list = "/api/collections/reports/records?"
	env.serve(t, func(send func(method, url, auth, body string) *httptest.ResponseRecorder) {
		rec := send("GET", list+listFilterCaseNamed(t, "reports-list").query(), env.token, "")
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), fmt.Sprintf(`"totalItems":%d`, len(env.shipped))) {
			t.Errorf("list answered %d: %.300s", rec.Code, rec.Body.String())
		}
		rec = send("GET", list+listFilterCaseNamed(t, "reports-search").query(), env.token, "")
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"totalItems":1`) || !strings.Contains(rec.Body.String(), `"title":"Trial Balance"`) {
			t.Errorf("list --search answered %d: %.300s", rec.Code, rec.Body.String())
		}
		rec = send("GET", "/api/collections/reports/records?page=1&perPage=1&filter="+url.QueryEscape(`shipped_key = "books.trial_balance"`), env.token, "")
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"id":"`+trial.Id+`"`) || !strings.Contains(rec.Body.String(), `"params":[`) {
			t.Errorf("show by key answered %d: %.300s", rec.Code, rec.Body.String())
		}
		// A token never writes a report.
		if rec := send("PATCH", "/api/collections/reports/records/"+trial.Id, env.token, `{"title":"x"}`); rec.Code != http.StatusForbidden {
			t.Errorf("a report write answered %d, want 403", rec.Code)
		}

		for _, format := range []string{"csv", "xlsx", "pdf"} {
			body := `{"format":"` + format + `","options":{"today":"2026-11-09"},"reportId":"` + trial.Id + `"}`
			rec := send("POST", "/api/reports/export", env.token, body)
			if rec.Code != http.StatusOK || rec.Body.Len() == 0 || !strings.Contains(rec.Header().Get("Content-Disposition"), "."+format) {
				t.Errorf("%s export answered %d, %d bytes, %q", format, rec.Code, rec.Body.Len(), rec.Header().Get("Content-Disposition"))
			}
			if rec := send("POST", "/api/reports/export", env.narrow, body); rec.Code != http.StatusForbidden {
				t.Errorf("%s export with the reports scope only answered %d", format, rec.Code)
			}
		}
		// A token without the reports scope reaches neither route.
		books := "Bearer " + oauthToken(t, env.app, env.reader, scopeRead)
		for _, path := range []string{"/api/reports/run", "/api/reports/export"} {
			rec := send("POST", path, books, `{"reportId":"`+trial.Id+`"}`)
			if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "Requires the") || !strings.Contains(rec.Body.String(), oauth.ScopeReports) {
				t.Errorf("%s without the reports scope answered %d: %s", path, rec.Code, rec.Body.String())
			}
		}
	})
}

// A report a person built over a Books source runs for the token by its id,
// with a param and the paging options of `reports run`.
func TestCLIReports_ATokenRunsASavedReportWithParamsAndPaging(t *testing.T) {
	env := newReportsEnv(t)
	mkAccount(t, env.app, "Cash", "bank", "cash_on_hand")
	mkAccount(t, env.app, "Bank", "bank", "checking")
	mkAccount(t, env.app, "Sales", "income", "service_income")
	col, err := env.app.FindCollectionByNameOrId("reports")
	if err != nil {
		t.Fatal(err)
	}
	saved := core.NewRecord(col)
	saved.Set("owner", env.reader.Id)
	saved.Set("title", "Account names")
	// The server sets source on a create through the API; a direct save does not.
	saved.Set("source", "books.accounts")
	saved.Set("spec", `{"version":4,"source":"books.accounts","columns":[{"id":"name","path":[{"field":"name"}]}],
		"params":[{"id":"kind","type":"choice","label":"Type","options":[{"value":"bank","label":"Bank"},{"value":"income","label":"Income"}]}],
		"filter":{"op":"eq","args":[{"path":[{"field":"type"}]},{"param":"kind"}]},
		"sort":[{"col":"name"}]}`)
	if err := env.app.Save(saved); err != nil {
		t.Fatalf("save the report: %v", err)
	}
	env.serve(t, func(send func(method, url, auth, body string) *httptest.ResponseRecorder) {
		// The body of `reports run <id> --limit 1 --input` with {"params": {"kind": "bank"}}.
		rec := send("POST", "/api/reports/run", env.token, `{"options":{"limit":1},"params":{"kind":"bank"},"reportId":"`+saved.Id+`"}`)
		var page struct {
			Rows []struct {
				Label string `json:"label"`
			} `json:"rows"`
			Page struct {
				Next string `json:"next"`
			} `json:"page"`
		}
		if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &page) != nil || len(page.Rows) == 0 || page.Page.Next == "" {
			t.Fatalf("page 1 answered %d: %s", rec.Code, rec.Body.String())
		}
		// Every page ends with the report's Total row: `--all` keeps the last one.
		if last := page.Rows[len(page.Rows)-1]; last.Label != "Total" {
			t.Errorf("page 1 does not end with the Total row: %s", rec.Body.String())
		}
		if strings.Contains(rec.Body.String(), "Sales") {
			t.Errorf("the param did not filter the rows: %s", rec.Body.String())
		}
		// --cursor: the next page.
		rec = send("POST", "/api/reports/run", env.token, `{"options":{"cursor":"`+page.Page.Next+`","limit":1},"params":{"kind":"bank"},"reportId":"`+saved.Id+`"}`)
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"kind":"detail"`) || strings.Contains(rec.Body.String(), `"label":"`+page.Rows[0].Label+`"`) {
			t.Errorf("page 2 answered %d: %s", rec.Code, rec.Body.String())
		}
		rec = send("POST", "/api/reports/run", env.token, `{"params":{"kind":"income"},"reportId":"`+saved.Id+`"}`)
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Sales") || strings.Contains(rec.Body.String(), "Cash") {
			t.Errorf("run with another param value answered %d: %s", rec.Code, rec.Body.String())
		}
		// The server names a param the report does not have: exit 6 for the CLI.
		rec = send("POST", "/api/reports/run", env.token, `{"params":{"nope":1},"reportId":"`+saved.Id+`"}`)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "nope") {
			t.Errorf("an unknown param answered %d: %s", rec.Code, rec.Body.String())
		}
	})
}
