package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"tinycld.org/core/changesignal"
)

// The business and the private estimate data of the public link tests. The
// private values are distinct words, so a body that holds one is a leak.
const (
	publicBusinessName  = "Harborview Bookkeeping LLC"
	publicBusinessEmail = "billing@harborview-books.test"
	publicBusinessPhone = "(303) 555-0142"
	publicCustomerEmail = "frontdesk@harborview-dental.test"
	publicMemoA         = "Privatememo thin margin on the annex job"
	publicLineA         = "Quarrystone ceiling access point install"
	publicBillToStreet  = "88 Quarrybend Road"
	publicMessageA      = "Thank you for the chance to quote."
	// A well-formed token no estimate has.
	publicUnknownToken = "nosuchlink0000000000000000000000000000000_-"
)

// The columns of books_estimate_public (spec §4.2), and the record keys
// PocketBase adds. Nothing else may reach a signed-out reader.
var publicViewKeys = []string{
	"accepted_by", "accepted_date", "business_email", "business_name", "business_phone",
	"collectionId", "collectionName", "currency", "customer_name", "date", "expiration_date",
	"id", "message", "number", "status", "token", "total",
}

const (
	publicViewURL      = "/api/collections/books_estimate_public/records"
	publicResponsesURL = "/api/collections/books_estimate_responses/records"
)

// publicEnv is the estimate env (the e2e chart, Harborview Dental) with the
// response guard bound, the settings row filled with the business name, email
// and phone, and two estimates: A (1001) with a memo, a bill-to address, an
// email and one line, and B (1002).
type publicEnv struct {
	*estimateEnv
	a, b  *core.Record
	lineA *core.Record
}

func newPublicEnv(t *testing.T) *publicEnv {
	t.Helper()
	ee := newEstimateEnv(t)
	registerEstimateResponses(ee.app)
	if err := setFields(t, ee.app, "books_settings", settingsID, map[string]any{
		"business_name": publicBusinessName, "email": publicBusinessEmail, "phone": publicBusinessPhone,
	}); err != nil {
		t.Fatalf("fill the settings row: %v", err)
	}
	if err := setCustomer(t, ee.app, ee.customer.Id, map[string]any{"email": publicCustomerEmail}); err != nil {
		t.Fatalf("give Harborview Dental an email: %v", err)
	}
	a := ee.mkEstimate(t, map[string]any{
		"memo": publicMemoA, "message": publicMessageA, "email": publicCustomerEmail,
		"bill_to": map[string]any{
			"line1": publicBillToStreet, "line2": "", "city": "Lakewood",
			"region": "CO", "postal_code": "80226", "country": "USA",
		},
	})
	lineItem := item(ee.service, 1, 45000, false)
	lineItem["description"] = publicLineA
	lineA := mkEstimateLine(t, ee.app, a, 0, lineItem)
	b := ee.mkEstimate(t, map[string]any{"memo": "Second estimate memo"})
	return &publicEnv{
		estimateEnv: ee,
		a:           reload(t, ee.app, "books_estimates", a.Id),
		b:           reload(t, ee.app, "books_estimates", b.Id),
		lineA:       lineA,
	}
}

func tokenOf(t testing.TB, app core.App, estimateID string) string {
	t.Helper()
	return reload(t, app, "books_estimates", estimateID).GetString("public_token")
}

// callResult is one response of serveCalls.
type callResult struct {
	status int
	body   string
}

type listBody struct {
	TotalItems int                          `json:"totalItems"`
	Items      []map[string]json.RawMessage `json:"items"`
}

func (c callResult) list(t testing.TB) listBody {
	t.Helper()
	if c.status != http.StatusOK {
		t.Fatalf("list status = %d, want 200; body: %s", c.status, c.body)
	}
	var out listBody
	if err := json.Unmarshal([]byte(c.body), &out); err != nil {
		t.Fatalf("list body is not JSON: %v (%s)", err, c.body)
	}
	return out
}

// requireNoSecret fails when the body holds any private value of estimate A.
func (c callResult) requireNoSecret(t testing.TB, what string) {
	t.Helper()
	for _, secret := range []string{publicMemoA, publicLineA, publicBillToStreet, publicCustomerEmail} {
		if strings.Contains(c.body, secret) {
			t.Errorf("%s: the body holds %q: %s", what, secret, c.body)
		}
	}
}

// serveCalls sends any number of requests through one router (OnServe runs one
// time, as for apiSeq) and gives each response to the test, so one app takes a
// whole read or probe sequence. It reads method, url, token, shareToken and
// body of each apiReq.
func serveCalls(t *testing.T, app *tests.TestApp, fn func(do func(apiReq) callResult)) {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	serve := &core.ServeEvent{App: app, Router: router}
	err = app.OnServe().Trigger(serve, func(e *core.ServeEvent) error {
		mux, err := e.Router.BuildMux()
		if err != nil {
			return err
		}
		fn(func(call apiReq) callResult {
			req := httptest.NewRequest(call.method, call.url, strings.NewReader(call.body))
			req.Header.Set("Content-Type", "application/json")
			if call.token != "" {
				req.Header.Set("Authorization", call.token)
			}
			if call.shareToken != "" {
				req.Header.Set("X-Share-Token", call.shareToken)
			}
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			return callResult{status: rec.Code, body: rec.Body.String()}
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func get(u, shareToken, token string) apiReq {
	return apiReq{method: http.MethodGet, url: u, shareToken: shareToken, token: token}
}

func withQuery(base string, params map[string]string) string {
	q := url.Values{}
	for k, v := range params {
		q.Set(k, v)
	}
	return base + "?" + q.Encode()
}

func keysOf(item map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(item))
	for k := range item {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func stringOf(t testing.TB, item map[string]json.RawMessage, key string) string {
	t.Helper()
	var s string
	if err := json.Unmarshal(item[key], &s); err != nil {
		t.Fatalf("%s is not a string: %s", key, item[key])
	}
	return s
}

// requireOnePublicRow asserts the list holds exactly estimate's row with only
// the view's columns.
func requireOnePublicRow(t testing.TB, got listBody, estimate *core.Record) map[string]json.RawMessage {
	t.Helper()
	if got.TotalItems != 1 || len(got.Items) != 1 {
		t.Fatalf("totalItems %d, %d items, want exactly one", got.TotalItems, len(got.Items))
	}
	row := got.Items[0]
	if keys := keysOf(row); !reflect.DeepEqual(keys, publicViewKeys) {
		t.Errorf("row keys = %v, want exactly %v", keys, publicViewKeys)
	}
	if id := stringOf(t, row, "id"); id != estimate.Id {
		t.Errorf("row id = %q, want the estimate's %q", id, estimate.Id)
	}
	return row
}

// Spec §4.1: the server gives every new estimate its token in the create.
func TestEstimatePublic_EveryEstimateGetsAToken(t *testing.T) {
	pe := newPublicEnv(t)
	tokenA := tokenOf(t, pe.app, pe.a.Id)
	tokenB := tokenOf(t, pe.app, pe.b.Id)
	for name, token := range map[string]string{"A": tokenA, "B": tokenB} {
		if !publicTokenPattern.MatchString(token) {
			t.Errorf("estimate %s public_token = %q, want 43 URL-safe characters", name, token)
		}
	}
	if tokenA == tokenB {
		t.Errorf("two estimates share the token %q", tokenA)
	}
}

// A writer's REST create takes a token from the server and may not send one.
func TestEstimatePublic_ACreateCannotSetTheToken(t *testing.T) {
	body := func(ee *estimateEnv, extra string) string {
		return fmt.Sprintf(`{"customer":%q,"status":"pending","date":%q%s}`, ee.customer.Id, estimateTestDay, extra)
	}
	t.Run("a create with no token gets one", func(t *testing.T) {
		ee := newEstimateEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_estimates/records",
			token: tokenFor(t, ee.users.bookkeeper), body: body(ee, ""), want: http.StatusOK,
			content: []string{`"number":"1001"`},
			after: func(t testing.TB, app *tests.TestApp) {
				stored, err := app.FindFirstRecordByData("books_estimates", "number", "1001")
				if err != nil {
					t.Fatalf("find the created estimate: %v", err)
				}
				if token := stored.GetString("public_token"); !publicTokenPattern.MatchString(token) {
					t.Errorf("public_token = %q after a REST create, want 43 URL-safe characters", token)
				}
			},
		}.run(t, ee.app)
	})
	t.Run("a create that sends a token is refused", func(t *testing.T) {
		ee := newEstimateEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_estimates/records",
			token: tokenFor(t, ee.users.bookkeeper),
			body:  body(ee, fmt.Sprintf(`,"public_token":%q`, publicUnknownToken)),
			want:  http.StatusBadRequest,
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_estimates"); n != 0 {
					t.Errorf("%d estimates after a create that set public_token, want 0", n)
				}
			},
		}.run(t, ee.app)
	})
}

// A writer's REST update may not send a token; the same update without it saves.
func TestEstimatePublic_AnUpdateCannotSetTheToken(t *testing.T) {
	pe := newPublicEnv(t)
	stored := tokenOf(t, pe.app, pe.a.Id)
	writer := tokenFor(t, pe.users.bookkeeper)
	patch := func(extra string) apiReq {
		revision := docRevision(t, pe.app, "books_estimates", pe.a.Id) + 1
		return apiReq{
			method: http.MethodPatch, url: "/api/collections/books_estimates/records/" + pe.a.Id, token: writer,
			body: fmt.Sprintf(`{"memo":"Edited memo","revision":%d%s}`, revision, extra),
		}
	}
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		refused := do(patch(fmt.Sprintf(`,"public_token":%q`, publicUnknownToken)))
		if refused.status == http.StatusOK {
			t.Errorf("an update that sets public_token answered 200: %s", refused.body)
		}
		after := reload(t, pe.app, "books_estimates", pe.a.Id)
		if after.GetString("public_token") != stored || after.GetString("memo") != publicMemoA {
			t.Errorf("after the refused update: public_token %q memo %q, want %q and the old memo",
				after.GetString("public_token"), after.GetString("memo"), stored)
		}
		if ok := do(patch("")); ok.status != http.StatusOK {
			t.Fatalf("the same update without public_token: status %d, want 200; body: %s", ok.status, ok.body)
		}
	})
	if got := tokenOf(t, pe.app, pe.a.Id); got != stored {
		t.Errorf("public_token = %q after a saved edit, want the stored %q", got, stored)
	}
}

// Spec §3.1: the token never changes, whatever Books writes.
func TestEstimatePublic_WritesKeepTheToken(t *testing.T) {
	pe := newPublicEnv(t)
	stored := tokenOf(t, pe.app, pe.a.Id)
	if !publicTokenPattern.MatchString(stored) {
		t.Fatalf("the estimate's public_token = %q, want 43 URL-safe characters", stored)
	}
	requireKept := func(t *testing.T, after string) {
		t.Helper()
		if got := tokenOf(t, pe.app, pe.a.Id); got != stored {
			t.Errorf("public_token = %q after %s, want the stored %q", got, after, stored)
		}
	}

	// The save must succeed: a refused save would leave the token as it was
	// and prove nothing about the guard that keeps it.
	if err := setFields(t, pe.app, "books_estimates", pe.a.Id, map[string]any{"public_token": publicUnknownToken}); err != nil {
		t.Fatalf("an app save that set another token: %v, want it saved with the stored token kept", err)
	}
	requireKept(t, "an app save that set another token")

	if err := setFields(t, pe.app, "books_estimates", pe.a.Id, map[string]any{
		"status": statusAccepted, "accepted_by": "Dana Whitfield", "accepted_date": "2026-11-05",
	}); err != nil {
		t.Fatalf("set the estimate to accepted: %v", err)
	}
	requireKept(t, "a status change to accepted")

	mkEstimateLine(t, pe.app, pe.a, 1, item(pe.accessPoint, 2, 18900, false))
	requireKept(t, "a line write")
}

// Spec §4.2: the view lists a row only to the holder of its token, and only
// the view's columns.
func TestEstimatePublic_ViewListsOnlyTheTokensRow(t *testing.T) {
	pe := newPublicEnv(t)
	tokenA := tokenOf(t, pe.app, pe.a.Id)
	settings := reload(t, pe.app, "books_settings", settingsID)
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		if got := do(get(publicViewURL, "", "")).list(t); got.TotalItems != 0 || len(got.Items) != 0 {
			t.Errorf("no header: totalItems %d, %d items, want 0", got.TotalItems, len(got.Items))
		}
		if got := do(get(publicViewURL, publicUnknownToken, "")).list(t); got.TotalItems != 0 {
			t.Errorf("a token no estimate has: totalItems %d, want 0", got.TotalItems)
		}

		res := do(get(publicViewURL, tokenA, ""))
		row := requireOnePublicRow(t, res.list(t), pe.a)
		res.requireNoSecret(t, "A's row")
		for key, want := range map[string]string{
			"token":          tokenA,
			"number":         "1001",
			"customer_name":  "Harborview Dental",
			"message":        publicMessageA,
			"business_name":  settings.GetString("business_name"),
			"business_email": settings.GetString("email"),
			"business_phone": settings.GetString("phone"),
		} {
			if got := stringOf(t, row, key); got != want {
				t.Errorf("%s = %q, want %q", key, got, want)
			}
		}
		if settings.GetString("business_name") != publicBusinessName {
			t.Fatalf("the settings row was not filled: %q", settings.GetString("business_name"))
		}

		if got := do(get(publicViewURL+"/"+pe.b.Id, tokenA, "")); got.status != http.StatusNotFound {
			t.Errorf("A's token viewing B: status %d, want 404; body: %s", got.status, got.body)
		}
		filtered := withQuery(publicViewURL, map[string]string{"filter": fmt.Sprintf("id=%q", pe.b.Id)})
		if got := do(get(filtered, tokenA, "")).list(t); got.TotalItems != 0 {
			t.Errorf("A's token filtering for B: totalItems %d, want 0", got.TotalItems)
		}

		admin := tokenFor(t, pe.users.admin)
		if got := do(get(publicViewURL, "", admin)).list(t); got.TotalItems != 0 {
			t.Errorf("a Books admin with no header: totalItems %d, want 0", got.TotalItems)
		}
	})
}

// A token is no credential for any other collection.
func TestEstimatePublic_TokenOpensNoOtherCollection(t *testing.T) {
	pe := newPublicEnv(t)
	tokenA := tokenOf(t, pe.app, pe.a.Id)
	records := map[string]string{
		"books_estimates":      pe.a.Id,
		"books_estimate_lines": pe.lineA.Id,
		"books_customers":      pe.customer.Id,
		"books_settings":       settingsID,
	}
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		// The control: the token is live and opens A's row of the view.
		requireOnePublicRow(t, do(get(publicViewURL, tokenA, "")).list(t), pe.a)
		for collection, id := range records {
			list := "/api/collections/" + collection + "/records"
			res := do(get(list, tokenA, ""))
			if got := res.list(t); got.TotalItems != 0 || len(got.Items) != 0 {
				t.Errorf("%s with A's token: totalItems %d, %d items, want 0", collection, got.TotalItems, len(got.Items))
			}
			res.requireNoSecret(t, collection+" list")
			if got := do(get(list+"/"+id, tokenA, "")); got.status != http.StatusNotFound {
				t.Errorf("%s/%s with A's token: status %d, want 404; body: %s", collection, id, got.status, got.body)
			}
		}
	})
}

// Register declares the view's sources for change signals, and the view's SQL
// reads no table the declaration leaves out.
func TestEstimatePublic_ViewIsRegisteredForChangeSignals(t *testing.T) {
	t.Cleanup(changesignal.ResetForTesting)
	app, _ := newRegisteredApp(t)
	want := []string{"books_customers", "books_estimates", "books_settings"}
	if got := changesignal.RegisteredViews()["books_estimate_public"]; !reflect.DeepEqual(got, want) {
		t.Errorf("books_estimate_public sources = %v, want %v", got, want)
	}
	if err := changesignal.CheckViews(app); err != nil {
		t.Errorf("CheckViews: %v", err)
	}
}
