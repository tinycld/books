package books

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/rlstest"
)

// newBooksApp returns a database migrated with core's and Books' shipped
// migrations and no hooks bound, so a rule test measures the rules alone.
// Tests that need the ledger hooks call registerLedger on it. The migrated
// template is built once per test binary; each test gets a private copy.
func newBooksApp(t testing.TB) *tests.TestApp {
	t.Helper()
	return rlstest.NewAssembledApp(t, rlstest.MigrationsDir(t, "../pb-migrations"))
}

var userSeq atomic.Uint64

func mkUser(t testing.TB, app core.App, role string) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("find users: %v", err)
	}
	n := userSeq.Add(1)
	u := core.NewRecord(col)
	u.SetEmail(fmt.Sprintf("%s%d@books.test", role, n))
	u.Set("username", fmt.Sprintf("%s_%d", role, n))
	u.Set("name", "Books "+role)
	u.Set("role", role)
	u.SetVerified(true)
	rlstest.SetPassword(u, "Password123!")
	if err := app.Save(u); err != nil {
		t.Fatalf("save user: %v", err)
	}
	return u
}

func saveRecord(t testing.TB, app core.App, collection string, fields map[string]any) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatalf("find %s: %v", collection, err)
	}
	r := core.NewRecord(col)
	for k, v := range fields {
		r.Set(k, v)
	}
	if err := app.Save(r); err != nil {
		t.Fatalf("save %s: %v", collection, err)
	}
	return r
}

func setPkgAccess(t testing.TB, app core.App, user *core.Record, access string) {
	t.Helper()
	saveRecord(t, app, "org_pkg_access", map[string]any{"user": user.Id, "pkg": "books", "access": access})
}

func makeBooksAdmin(t testing.TB, app core.App, user *core.Record) {
	t.Helper()
	saveRecord(t, app, "books_admins", map[string]any{"user": user.Id})
}

func tokenFor(t testing.TB, u *core.Record) string {
	t.Helper()
	token, err := u.NewAuthToken()
	if err != nil {
		t.Fatalf("mint token: %v", err)
	}
	return token
}

// levelUsers holds one user per Books level.
type levelUsers struct {
	none, readOnly, bookkeeper, admin *core.Record
}

func newLevelUsers(t testing.TB, app core.App) levelUsers {
	t.Helper()
	none := mkUser(t, app, "member")
	setPkgAccess(t, app, none, "none")
	readOnly := mkUser(t, app, "member")
	setPkgAccess(t, app, readOnly, "readonly")
	// The spec's bookkeeper: an outside guest given Books only.
	bookkeeper := mkUser(t, app, "guest")
	setPkgAccess(t, app, bookkeeper, "full")
	admin := mkUser(t, app, "member")
	makeBooksAdmin(t, app, admin)
	return levelUsers{none: none, readOnly: readOnly, bookkeeper: bookkeeper, admin: admin}
}

func (u levelUsers) byLevel(l Level) *core.Record {
	switch l {
	case LevelNone:
		return u.none
	case LevelReadOnly:
		return u.readOnly
	case LevelBookkeeper:
		return u.bookkeeper
	default:
		return u.admin
	}
}

var allLevels = []Level{LevelNone, LevelReadOnly, LevelBookkeeper, LevelAdmin}

// apiReq is one REST call through PocketBase's real router, so the rules and
// request hooks run as they do in production. One call per app:
// ApiScenario re-triggers OnServe, and a second one on the same app panics on
// duplicate route registration.
type apiReq struct {
	method  string
	url     string
	token   string
	body    string
	want    int
	content []string
	before  func(e *core.ServeEvent)
	after   func(t testing.TB, app *tests.TestApp)
}

func (r apiReq) run(t *testing.T, app *tests.TestApp) {
	t.Helper()
	headers := map[string]string{}
	if r.token != "" {
		headers["Authorization"] = r.token
	}
	var body io.Reader
	if r.body != "" {
		headers["Content-Type"] = "application/json"
		body = strings.NewReader(r.body)
	}
	scenario := &tests.ApiScenario{
		Name:                  r.method + " " + r.url,
		Method:                r.method,
		URL:                   r.url,
		Body:                  body,
		Headers:               headers,
		ExpectedStatus:        r.want,
		ExpectedContent:       r.content,
		TestAppFactory:        func(testing.TB) *tests.TestApp { return app },
		DisableTestAppCleanup: true,
	}
	if len(r.content) == 0 {
		// ApiScenario demands an empty body unless it has a content check; a
		// status-only request has a body of any shape, so assert on a NUL byte.
		scenario.NotExpectedContent = []string{"\x00"}
	}
	if r.before != nil {
		before := r.before
		scenario.BeforeTestFunc = func(_ testing.TB, _ *tests.TestApp, e *core.ServeEvent) { before(e) }
	}
	if r.after != nil {
		after := r.after
		scenario.AfterTestFunc = func(t testing.TB, app *tests.TestApp, _ *http.Response) { after(t, app) }
	}
	scenario.Test(t)
}

// mkAccount saves an account directly. It sets currency itself so it also
// works on an app with no hooks bound.
func mkAccount(t testing.TB, app core.App, name, accountType, detailType string) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_accounts", map[string]any{
		"name": name, "type": accountType, "detail_type": detailType, "currency": "USD",
	})
}

// ln is one journal line of a fixture entry, in minor units.
type ln struct {
	account       *core.Record
	debit, credit int
}

// mkDraft saves a manual draft entry and its lines directly.
func mkDraft(t testing.TB, app core.App, date string, lines ...ln) *core.Record {
	t.Helper()
	entry := saveRecord(t, app, "books_journal_entries", map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "manual", "currency": "USD",
	})
	for i, l := range lines {
		saveRecord(t, app, "books_journal_lines", map[string]any{
			"entry": entry.Id, "account": l.account.Id, "debit": l.debit, "credit": l.credit,
			"position": i, "currency": "USD",
		})
	}
	return entry
}

func requireRefused(t testing.TB, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected a refusal containing %q, got none", want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("expected a refusal containing %q, got: %v", want, err)
	}
}

func reload(t testing.TB, app core.App, collection, id string) *core.Record {
	t.Helper()
	r, err := app.FindRecordById(collection, id)
	if err != nil {
		t.Fatalf("reload %s/%s: %v", collection, id, err)
	}
	return r
}

// ledgerEnv is a migrated app with every ledger hook bound, one user per
// level and three accounts.
type ledgerEnv struct {
	app                     *tests.TestApp
	users                   levelUsers
	checking, revenue, rent *core.Record
}

func newLedgerEnv(t *testing.T) *ledgerEnv {
	t.Helper()
	app := newBooksApp(t)
	registerLedger(app)
	return ledgerEnvOn(t, app)
}

// ledgerEnvOn adds one user per level and three accounts to an app whose hooks
// are already bound, so the accounts pass through them.
func ledgerEnvOn(t *testing.T, app *tests.TestApp) *ledgerEnv {
	t.Helper()
	return &ledgerEnv{
		app:      app,
		users:    newLevelUsers(t, app),
		checking: mkAccount(t, app, "Checking", "bank", "checking"),
		revenue:  mkAccount(t, app, "Consulting Income", "income", "service_income"),
		rent:     mkAccount(t, app, "Rent", "expense", "rent_lease"),
	}
}

// sale is a balanced draft: cash in, income out.
func (env *ledgerEnv) sale(t testing.TB, date string, amount int) *core.Record {
	t.Helper()
	return mkDraft(t, env.app, date, ln{env.checking, amount, 0}, ln{env.revenue, 0, amount})
}

// setStatus reloads an entry and saves it with a new status, the way an
// internal caller would, and returns what the hooks said.
func setStatus(app core.App, entryID, status, actorID string) error {
	fresh, err := app.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return err
	}
	fresh.Set("status", status)
	switch status {
	case statusPosted:
		fresh.Set("posted_by", actorID)
	case statusVoid:
		fresh.Set("voided_by", actorID)
	}
	return app.Save(fresh)
}

func mustPost(t testing.TB, app core.App, entryID, actorID string) *core.Record {
	t.Helper()
	if err := setStatus(app, entryID, statusPosted, actorID); err != nil {
		t.Fatalf("post %s: %v", entryID, err)
	}
	return reload(t, app, "books_journal_entries", entryID)
}

func balanceOf(t testing.TB, app core.App, account *core.Record, period string) (int, int) {
	t.Helper()
	row, err := app.FindFirstRecordByFilter("books_account_balances",
		"account = {:a} && period = {:p}", dbx.Params{"a": account.Id, "p": period})
	if errors.Is(err, sql.ErrNoRows) {
		return 0, 0
	}
	if err != nil {
		t.Fatalf("balance row: %v", err)
	}
	return row.GetInt("debit_total"), row.GetInt("credit_total")
}

func setCloseDate(t testing.TB, app core.App, day string) {
	t.Helper()
	s := reload(t, app, "books_settings", settingsID)
	s.Set("close_date", day)
	if err := app.Save(s); err != nil {
		t.Fatalf("set close date %s: %v", day, err)
	}
}

func grantOverride(t testing.TB, app core.App, user *core.Record, expires time.Time) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_close_overrides", map[string]any{
		"user": user.Id, "reason": "Year-end adjustment", "expires_at": expires,
	})
}

func requireNoDrift(t testing.TB, app core.App) {
	t.Helper()
	drifts, err := verifyBalances(app)
	if err != nil {
		t.Fatalf("verify balances: %v", err)
	}
	if len(drifts) > 0 {
		t.Fatalf("balance rows drifted from the ledger: %+v", drifts)
	}
}
