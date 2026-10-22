package books

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/oauth"
	"tinycld.org/core/offboard"
	"tinycld.org/core/quota"
	"tinycld.org/core/rlstest"
	"tinycld.org/core/search"
)

// serverOnly are Books collections no person writes, so nothing to audit.
var serverOnly = map[string]bool{"books_account_balances": true}

func booksCollections(t testing.TB, app core.App, kinds ...string) []*core.Collection {
	t.Helper()
	cols, err := app.FindAllCollections(kinds...)
	if err != nil {
		t.Fatal(err)
	}
	var out []*core.Collection
	for _, c := range cols {
		if strings.HasPrefix(c.Name, "books_") {
			out = append(out, c)
		}
	}
	return out
}

// resetRegistries clears what Register adds to core's process-wide
// registries, so one test's registration does not leak into the next.
func resetRegistries(t testing.TB) {
	t.Helper()
	t.Cleanup(oauth.ResetRegistry)
	t.Cleanup(search.ResetSources)
	t.Cleanup(offboard.ResetHandlersForTesting)
	t.Cleanup(quota.ResetSourcesForTesting)
}

// newRegisteredApp is a migrated app wired by Register, as production wires
// it, instead of by the parts a unit test binds one by one.
func newRegisteredApp(t testing.TB) (*tests.TestApp, *pocketbase.PocketBase) {
	t.Helper()
	resetRegistries(t)
	app := newBooksApp(t)
	pb := &pocketbase.PocketBase{App: app}
	Register(pb)
	return app, pb
}

func TestAudit_CoversEveryCollectionPeopleWrite(t *testing.T) {
	app := newBooksApp(t)
	for _, c := range booksCollections(t, app, core.CollectionTypeBase) {
		if _, ok := auditedCollections[c.Name]; !ok && !serverOnly[c.Name] {
			t.Errorf("%s is neither audited nor listed as server-only", c.Name)
		}
	}
	for name := range auditedCollections {
		if _, err := app.FindCollectionByNameOrId(name); err != nil {
			t.Errorf("audited collection %s does not exist", name)
		}
	}
}

// waitFor polls an asynchronous write: core writes audit rows off the request
// goroutine, so a row lands just after the response.
func waitFor(t testing.TB, done func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met within 5s")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestAudit_LogsAnAccountCreate(t *testing.T) {
	app := newBooksApp(t)
	registerLedger(app)
	registerAudit(&pocketbase.PocketBase{App: app})
	users := newLevelUsers(t, app)
	apiReq{
		method: http.MethodPost,
		url:    "/api/collections/books_accounts/records",
		token:  tokenFor(t, users.bookkeeper),
		body:   `{"name":"Petty Cash","number":"1010","type":"bank","detail_type":"cash_on_hand"}`,
		want:   http.StatusOK,
		after: func(t testing.TB, app *tests.TestApp) {
			waitFor(t, func() bool {
				row, err := app.FindFirstRecordByFilter("audit_logs",
					"resource_type = 'books_accounts' && action = 'created'", dbx.Params{})
				return err == nil && row.GetString("resource_label") == "1010:Petty Cash" && row.GetString("actor") == users.bookkeeper.Id
			})
		},
	}.run(t, app)
}

func TestOAuth_LedgerIsReadWrite(t *testing.T) {
	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	for _, c := range []string{"books_accounts", "books_journal_entries", "books_journal_lines"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		if !oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeWrite}) {
			t.Errorf("POST %s: books:write must write", path)
		}
		if oauth.ScopeForRoute(http.MethodPost, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("POST %s: books:read alone must not write", path)
		}
	}
}

// Settings, numbering, overrides and admin grants change who may do what in
// the books. A token consented as "record transactions" must not reach them.
func TestOAuth_ConfigurationIsReadOnly(t *testing.T) {
	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	both := []string{scopeRead, scopeWrite}
	for _, c := range []string{"books_account_balances", "books_settings", "books_doc_sequences", "books_close_overrides", "books_admins", "books_access"} {
		path := "/api/collections/" + c + "/records"
		if !oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy([]string{scopeRead}) {
			t.Errorf("GET %s: books:read must read", path)
		}
		for _, method := range []string{http.MethodPost, http.MethodPatch, http.MethodDelete} {
			p := path
			if method != http.MethodPost {
				p += "/abc123"
			}
			if oauth.ScopeForRoute(method, p).SatisfiedBy(both) {
				t.Errorf("%s %s: no Books scope may write", method, p)
			}
		}
	}
	if oauth.ScopeForRoute(http.MethodPost, "/api/books/balances/rebuild").SatisfiedBy(both) {
		t.Error("the rebuild route must stay session-only")
	}
}

func TestOAuth_CoversEveryBooksCollection(t *testing.T) {
	t.Cleanup(oauth.ResetRegistry)
	oauth.RegisterPackage(oauthPackage())
	app := newBooksApp(t)
	for _, c := range booksCollections(t, app) {
		if !oauth.ScopeForRoute(http.MethodGet, "/api/collections/"+c.Name+"/records").SatisfiedBy([]string{scopeRead}) {
			t.Errorf("%s has no OAuth entry and is default-denied to tokens", c.Name)
		}
	}
}

// oauthToken mints an access token for user through core's real grant path,
// on the first-party CLI client the core migrations seed.
func oauthToken(t testing.TB, app core.App, user *core.Record, scopes ...string) string {
	t.Helper()
	client, err := app.FindFirstRecordByData("oauth_clients", "client_id", "tinycld-cli")
	if err != nil {
		t.Fatalf("find the seeded CLI client: %v", err)
	}
	grant, err := oauth.NewGrant(app, user.Id, client.Id, scopes, "active")
	if err != nil {
		t.Fatalf("grant: %v", err)
	}
	token, err := oauth.MintAccessToken(app, user, grant, oauth.AccessTokenTTL)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	return token
}

// A token with every Books scope, held by a Books admin, still cannot rebuild
// balances: core's grant middleware default-denies a route no package
// classified, and Books classifies none.
func TestOAuth_TokenCannotRebuildBalances(t *testing.T) {
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	admin := mkUser(t, app, "member")
	makeBooksAdmin(t, app, admin)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/books/balances/rebuild",
		token:   oauthToken(t, app, admin, scopeRead, scopeWrite),
		want:    http.StatusForbidden,
		content: []string{"not available to API tokens"},
	}.run(t, app)
}

// The positive control for the test above: the same kind of token reaches the
// ledger, so the 403 there is the route's classification, not a broken token.
func TestOAuth_TokenReadsTheLedger(t *testing.T) {
	app, pb := newRegisteredApp(t)
	oauth.Register(pb)
	admin := mkUser(t, app, "member")
	makeBooksAdmin(t, app, admin)
	mkAccount(t, app, "Checking", "bank", "checking")
	apiReq{
		method:  http.MethodGet,
		url:     "/api/collections/books_accounts/records",
		token:   oauthToken(t, app, admin, scopeRead),
		want:    http.StatusOK,
		content: []string{`"totalItems":1`, `"name":"Checking"`},
	}.run(t, app)
}

// Quota counts stored bytes. No Books collection stores files yet, so the
// source list is empty; this fails the day one does without a registration.
func TestQuota_EveryFileCollectionIsASource(t *testing.T) {
	app := newBooksApp(t)
	sources := map[string]bool{}
	for _, s := range quotaSources() {
		if err := quota.ValidateSource(s); err != nil {
			t.Errorf("invalid quota source %+v: %v", s, err)
		}
		sources[s.Collection] = true
	}
	for _, c := range booksCollections(t, app) {
		for _, f := range c.Fields {
			if f.Type() == core.FieldTypeFile && !sources[c.Name] {
				t.Errorf("%s stores files in %s but is not a quota source", c.Name, f.GetName())
			}
		}
	}
}

func TestOffboard_KeepsTheLedgerAndDropsGrants(t *testing.T) {
	t.Cleanup(offboard.ResetHandlersForTesting)
	env := newLedgerEnv(t)
	registerOffboard()
	leaver := env.users.admin
	ov := grantOverride(t, env.app, leaver, time.Now().Add(24*time.Hour))
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, leaver.Id)

	if _, err := offboard.OffboardUser(env.app, leaver.Id, offboard.Plan{Mode: offboard.ModeDeleteMyData}, ""); err != nil {
		t.Fatalf("offboard: %v", err)
	}
	after := reload(t, env.app, "books_journal_entries", posted.Id)
	if after.GetString("status") != statusPosted || after.GetString("posted_by") != leaver.Id {
		t.Fatalf("ledger changed on offboard: %v", after.PublicExport())
	}
	if n, _ := env.app.CountRecords("books_admins", dbx.HashExp{"user": leaver.Id}); n != 0 {
		t.Error("the leaver is still a Books admin")
	}
	if exp := reload(t, env.app, "books_close_overrides", ov.Id).GetDateTime("expires_at").Time(); exp.After(time.Now().Add(time.Second)) {
		t.Errorf("the leaver's override still expires at %v", exp)
	}
}

func TestRegister_WiresEverything(t *testing.T) {
	resetRegistries(t)
	app := newBooksApp(t)
	pb := &pocketbase.PocketBase{App: app}
	before := rlstest.HookHandlerCounts(t, pb)
	Register(pb)
	after := rlstest.HookHandlerCounts(t, pb)
	if after["OnServe"] <= before["OnServe"] || after["OnRecordUpdate"] <= before["OnRecordUpdate"] {
		t.Fatal("Register bound no serve or record hooks")
	}
	if got := after["OnRecordCreateRequest"] - before["OnRecordCreateRequest"]; got < len(auditedCollections) {
		t.Fatalf("Register bound %d create-request hooks, want at least %d for audit", got, len(auditedCollections))
	}
	if len(oauth.PackageScopes("books")) != 2 {
		t.Fatalf("OAuth scopes = %v", oauth.PackageScopes("books"))
	}
	for _, s := range quota.RegisteredSources() {
		if strings.HasPrefix(s.Collection, "books_") {
			t.Errorf("Register added quota source %+v, but quotaSources is empty", s)
		}
	}
	found := false
	for _, j := range app.Cron().Jobs() {
		found = found || j.Id() == autoReverseJobID
	}
	if !found {
		t.Error("Register did not schedule the auto-reverse sweep")
	}
}

// Register binds each part exactly once: its hook counts equal those of an
// app wired by binding every part a single time by hand. A part bound twice
// (or left out) shows up as the hook whose count differs.
func TestRegister_BindsEachPartOnce(t *testing.T) {
	_, registered := newRegisteredApp(t)

	parts := newBooksApp(t)
	registerLedger(parts)
	registerAudit(&pocketbase.PocketBase{App: parts})
	registerAutoReverseSweep(parts)
	parts.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindBalanceRoutes(e)
		return e.Next()
	})

	rlstest.AssertCompositionDiff(t,
		rlstest.HookHandlerCounts(t, registered),
		rlstest.HookHandlerCounts(t, &pocketbase.PocketBase{App: parts}),
		nil)
}

// A post on an app wired by Register takes one number and adds to its balance
// rows once, and the rebuild route answers (a route mounted twice would panic
// when the router starts) and finds nothing to fix.
func TestRegister_PostsOnceAndServesTheRebuild(t *testing.T) {
	app, _ := newRegisteredApp(t)
	users := newLevelUsers(t, app)
	checking := mkAccount(t, app, "Checking", "bank", "checking")
	revenue := mkAccount(t, app, "Consulting Income", "income", "service_income")

	draft := mkDraft(t, app, "2026-05-10", ln{checking, 2500, 0}, ln{revenue, 0, 2500})
	posted := mustPost(t, app, draft.Id, users.bookkeeper.Id)
	if posted.GetString("number") != "1" || posted.GetInt("sequence") != 1 {
		t.Fatalf("posted = %v", posted.PublicExport())
	}
	if next := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); next != 2 {
		t.Fatalf("next_number = %d after one post, want 2", next)
	}
	if d, c := balanceOf(t, app, checking, "2026-05"); d != 2500 || c != 0 {
		t.Errorf("checking %d/%d, want 2500/0", d, c)
	}
	if d, c := balanceOf(t, app, revenue, "2026-05"); d != 0 || c != 2500 {
		t.Errorf("revenue %d/%d, want 0/2500", d, c)
	}
	requireNoDrift(t, app)

	apiReq{
		method:  http.MethodPost,
		url:     "/api/books/balances/rebuild",
		token:   tokenFor(t, users.admin),
		want:    http.StatusOK,
		content: []string{`"fixed":0`},
	}.run(t, app)
}

// Register puts the offboard handler in core's registry: offboarding through
// core alone removes the leaver's Books admin grant.
func TestRegister_OffboardsThroughCore(t *testing.T) {
	app, _ := newRegisteredApp(t)
	leaver := mkUser(t, app, "member")
	makeBooksAdmin(t, app, leaver)
	if _, err := offboard.OffboardUser(app, leaver.Id, offboard.Plan{Mode: offboard.ModeKeep}, ""); err != nil {
		t.Fatalf("offboard: %v", err)
	}
	if n, _ := app.CountRecords("books_admins", dbx.HashExp{"user": leaver.Id}); n != 0 {
		t.Error("the leaver is still a Books admin")
	}
}
