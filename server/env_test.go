package books

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"

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
