package books

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/rlstest"
)

// ledgerRows seeds one of everything with no hooks bound: an account, a
// posted and a draft entry with a line each, and a balance row.
type ledgerRows struct {
	account, posted, draft, postedLine, draftLine, balance *core.Record
}

func seedLedgerRows(t testing.TB, app core.App) ledgerRows {
	t.Helper()
	account := mkAccount(t, app, "Checking", "bank", "checking")
	posted := mkDraft(t, app, "2026-05-01", ln{account, 100, 0})
	posted.Set("status", "posted")
	posted.Set("number", "1")
	posted.Set("sequence", 1)
	if err := app.Save(posted); err != nil {
		t.Fatalf("post fixture: %v", err)
	}
	draft := mkDraft(t, app, "2026-05-02", ln{account, 0, 100})
	postedLine, _ := app.FindFirstRecordByFilter("books_journal_lines", "entry = {:e}", map[string]any{"e": posted.Id})
	draftLine, _ := app.FindFirstRecordByFilter("books_journal_lines", "entry = {:e}", map[string]any{"e": draft.Id})
	balance := saveRecord(t, app, "books_account_balances", map[string]any{
		"account": account.Id, "period": "2026-05", "debit_total": 100, "currency": "USD",
	})
	return ledgerRows{account, posted, draft, postedLine, draftLine, balance}
}

func TestLedgerRules_EveryPathRequiresLogin(t *testing.T) {
	rlstest.RequireAuthGuardOnAccessRules(t, newBooksApp(t), rlstest.CorePublicPaths()...)
}

func TestLedgerRules_ReadByLevel(t *testing.T) {
	counts := map[string]int{
		"books_accounts": 1, "books_journal_entries": 2, "books_journal_lines": 2, "books_account_balances": 1,
	}
	for collection, n := range counts {
		for _, level := range allLevels {
			t.Run(collection+"/"+string(level), func(t *testing.T) {
				app := newBooksApp(t)
				users := newLevelUsers(t, app)
				seedLedgerRows(t, app)
				want := fmt.Sprintf(`"totalItems":%d`, n)
				if level == LevelNone {
					want = `"totalItems":0`
				}
				apiReq{
					method:  http.MethodGet,
					url:     "/api/collections/" + collection + "/records",
					token:   tokenFor(t, users.byLevel(level)),
					want:    http.StatusOK,
					content: []string{want},
				}.run(t, app)
			})
		}
	}
}

func TestLedgerRules_CreateAccountByLevel(t *testing.T) {
	want := map[Level]int{
		LevelNone: http.StatusBadRequest, LevelReadOnly: http.StatusBadRequest,
		LevelBookkeeper: http.StatusOK, LevelAdmin: http.StatusOK,
	}
	for _, level := range allLevels {
		t.Run(string(level), func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method: http.MethodPost,
				url:    "/api/collections/books_accounts/records",
				token:  tokenFor(t, users.byLevel(level)),
				body:   `{"name":"Petty Cash","type":"bank","detail_type":"cash_on_hand"}`,
				want:   want[level],
			}.run(t, app)
		})
	}
}

// A client creates only drafts, of the three origins a person starts, and never
// sets a field Books owns.
func TestLedgerRules_EntryCreatePins(t *testing.T) {
	const base = `"date":"2026-05-01","doc_type":"journal"`
	cases := []struct {
		name string
		body string
		want int
		// after checks the stored row of a created entry.
		after func(t testing.TB, app *tests.TestApp)
	}{
		{"a manual draft", `{` + base + `,"status":"draft","origin":"manual"}`, http.StatusOK, nil},
		{"created posted", `{` + base + `,"status":"posted","origin":"manual"}`, http.StatusBadRequest, nil},
		{"with a number", `{` + base + `,"status":"draft","origin":"manual","number":"7"}`, http.StatusBadRequest, nil},
		{"with a sequence", `{` + base + `,"status":"draft","origin":"manual","sequence":7}`, http.StatusBadRequest, nil},
		{"with posted_at", `{` + base + `,"status":"draft","origin":"manual","posted_at":"2026-05-01 00:00:00.000Z"}`, http.StatusBadRequest, nil},
		{"an opening balance draft", `{` + base + `,"status":"draft","origin":"opening_balance"}`, http.StatusOK, requireStoredOpeningDraft},
		{"an opening balance draft with a number", `{` + base + `,"status":"draft","origin":"opening_balance","number":"7"}`, http.StatusBadRequest, nil},
		{"as a void reversal", `{` + base + `,"status":"draft","origin":"void_reversal"}`, http.StatusBadRequest, nil},
		{"as an auto reversal", `{` + base + `,"status":"draft","origin":"auto_reversal"}`, http.StatusBadRequest, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			apiReq{
				method: http.MethodPost,
				url:    "/api/collections/books_journal_entries/records",
				token:  tokenFor(t, users.bookkeeper),
				body:   tc.body,
				want:   tc.want,
				after:  tc.after,
			}.run(t, app)
		})
	}
}

func requireStoredOpeningDraft(t testing.TB, app *tests.TestApp) {
	t.Helper()
	rows, err := app.FindAllRecords("books_journal_entries", dbx.NewExp("origin = 'opening_balance'"))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].GetString("status") != "draft" {
		t.Errorf("stored opening entries: %d, want one draft", len(rows))
	}
}

func TestLedgerRules_PostedEntryWrites(t *testing.T) {
	cases := []struct {
		name   string
		method string
		pick   func(r ledgerRows) string
		body   string
		want   int
	}{
		{"edit a posted entry", http.MethodPatch, func(r ledgerRows) string { return r.posted.Id }, `{"memo":"x"}`, http.StatusNotFound},
		{"void a posted entry", http.MethodPatch, func(r ledgerRows) string { return r.posted.Id }, `{"status":"void"}`, http.StatusOK},
		{"renumber a draft", http.MethodPatch, func(r ledgerRows) string { return r.draft.Id }, `{"number":"9"}`, http.StatusNotFound},
		{"delete a posted entry", http.MethodDelete, func(r ledgerRows) string { return r.posted.Id }, "", http.StatusNotFound},
		{"delete a draft", http.MethodDelete, func(r ledgerRows) string { return r.draft.Id }, "", http.StatusNoContent},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			rows := seedLedgerRows(t, app)
			apiReq{
				method: tc.method,
				url:    "/api/collections/books_journal_entries/records/" + tc.pick(rows),
				token:  tokenFor(t, users.bookkeeper),
				body:   tc.body,
				want:   tc.want,
			}.run(t, app)
		})
	}
}

func TestLedgerRules_LinePins(t *testing.T) {
	cases := []struct {
		name   string
		method string
		url    func(r ledgerRows) string
		body   func(r ledgerRows) string
		want   int
	}{
		{"create a line marked posted", http.MethodPost,
			func(ledgerRows) string { return "/api/collections/books_journal_lines/records" },
			func(r ledgerRows) string {
				return fmt.Sprintf(`{"entry":%q,"account":%q,"debit":5,"posted":true}`, r.draft.Id, r.account.Id)
			}, http.StatusBadRequest},
		{"create a dated line", http.MethodPost,
			func(ledgerRows) string { return "/api/collections/books_journal_lines/records" },
			func(r ledgerRows) string {
				return fmt.Sprintf(`{"entry":%q,"account":%q,"debit":5,"date":"2026-05-01"}`, r.draft.Id, r.account.Id)
			}, http.StatusBadRequest},
		{"move a line to another entry", http.MethodPatch,
			func(r ledgerRows) string { return "/api/collections/books_journal_lines/records/" + r.draftLine.Id },
			func(r ledgerRows) string { return fmt.Sprintf(`{"entry":%q}`, r.posted.Id) }, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			rows := seedLedgerRows(t, app)
			apiReq{method: tc.method, url: tc.url(rows), token: tokenFor(t, users.bookkeeper), body: tc.body(rows), want: tc.want}.run(t, app)
		})
	}
}

func TestLedgerRules_BalancesAreServerOnly(t *testing.T) {
	cases := []struct {
		name, method string
		url          func(r ledgerRows) string
	}{
		{"create", http.MethodPost, func(ledgerRows) string { return "/api/collections/books_account_balances/records" }},
		{"update", http.MethodPatch, func(r ledgerRows) string { return "/api/collections/books_account_balances/records/" + r.balance.Id }},
		{"delete", http.MethodDelete, func(r ledgerRows) string { return "/api/collections/books_account_balances/records/" + r.balance.Id }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newBooksApp(t)
			users := newLevelUsers(t, app)
			rows := seedLedgerRows(t, app)
			apiReq{
				method: tc.method, url: tc.url(rows), token: tokenFor(t, users.admin),
				body: `{"debit_total":1}`, want: http.StatusForbidden,
			}.run(t, app)
		})
	}
}

func TestLedgerSchema_AccountNamesAreUniqueAmongSiblings(t *testing.T) {
	app := newBooksApp(t)
	parent := mkAccount(t, app, "Utilities", "expense", "utilities")
	saveRecord(t, app, "books_accounts", map[string]any{
		"name": "Power", "type": "expense", "detail_type": "utilities", "parent": parent.Id, "currency": "USD",
	})
	col, _ := app.FindCollectionByNameOrId("books_accounts")
	dup := core.NewRecord(col)
	dup.Load(map[string]any{"name": "power", "type": "expense", "detail_type": "utilities", "parent": parent.Id, "currency": "USD"})
	if err := app.Save(dup); err == nil {
		t.Fatal("a second sub-account named power under Utilities was accepted")
	}
	mkAccount(t, app, "Power", "expense", "utilities") // a top-level Power is a different sibling set
}

// Read-only and none users are refused every write on entries and lines. A
// create that fails a rule is a 400; an update or delete of a row the rule
// hides is a 404.
func TestLedgerRules_WritesRefusedBelowBookkeeper(t *testing.T) {
	cases := []struct {
		name   string
		method string
		url    func(r ledgerRows) string
		body   func(r ledgerRows) string
		want   int
	}{
		{"create an entry", http.MethodPost,
			func(ledgerRows) string { return "/api/collections/books_journal_entries/records" },
			func(ledgerRows) string {
				return `{"date":"2026-05-03","doc_type":"journal","status":"draft","origin":"manual"}`
			}, http.StatusBadRequest},
		{"update a draft entry", http.MethodPatch,
			func(r ledgerRows) string { return "/api/collections/books_journal_entries/records/" + r.draft.Id },
			func(ledgerRows) string { return `{"memo":"x"}` }, http.StatusNotFound},
		{"void a posted entry", http.MethodPatch,
			func(r ledgerRows) string { return "/api/collections/books_journal_entries/records/" + r.posted.Id },
			func(ledgerRows) string { return `{"status":"void"}` }, http.StatusNotFound},
		{"delete a draft entry", http.MethodDelete,
			func(r ledgerRows) string { return "/api/collections/books_journal_entries/records/" + r.draft.Id },
			func(ledgerRows) string { return "" }, http.StatusNotFound},
		{"create a line", http.MethodPost,
			func(ledgerRows) string { return "/api/collections/books_journal_lines/records" },
			func(r ledgerRows) string {
				return fmt.Sprintf(`{"entry":%q,"account":%q,"debit":5}`, r.draft.Id, r.account.Id)
			}, http.StatusBadRequest},
		{"update a line", http.MethodPatch,
			func(r ledgerRows) string { return "/api/collections/books_journal_lines/records/" + r.draftLine.Id },
			func(ledgerRows) string { return `{"memo":"x"}` }, http.StatusNotFound},
		{"delete a line", http.MethodDelete,
			func(r ledgerRows) string { return "/api/collections/books_journal_lines/records/" + r.draftLine.Id },
			func(ledgerRows) string { return "" }, http.StatusNotFound},
	}
	for _, level := range []Level{LevelNone, LevelReadOnly} {
		for _, tc := range cases {
			t.Run(string(level)+"/"+tc.name, func(t *testing.T) {
				app := newBooksApp(t)
				users := newLevelUsers(t, app)
				rows := seedLedgerRows(t, app)
				apiReq{
					method: tc.method, url: tc.url(rows), token: tokenFor(t, users.byLevel(level)),
					body: tc.body(rows), want: tc.want,
				}.run(t, app)
			})
		}
	}
}
