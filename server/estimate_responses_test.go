package books

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// The refusal texts of the response guard, as the client gets them. Written
// out here, not read from the consts, so a change of wording fails this file.
const (
	wantResponseNotPending     = "This estimate is no longer waiting for an answer."
	wantResponseReasonOnAccept = "A reason is only for a decline."
	wantResponseNameRequired   = "Enter your name."
)

func responseBody(estimateID, decision, name, reason string) string {
	raw, err := json.Marshal(map[string]string{
		"estimate": estimateID, "decision": decision, "name": name, "reason": reason,
	})
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func postResponse(shareToken, body string) apiReq {
	return apiReq{method: http.MethodPost, url: publicResponsesURL, shareToken: shareToken, body: body}
}

func responsesOf(t testing.TB, app core.App, estimateID string) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter("books_estimate_responses", "estimate = {:e}", "created", 0, 0,
		dbx.Params{"e": estimateID})
	if err != nil {
		t.Fatalf("read the responses: %v", err)
	}
	return rows
}

// quoteState is what a response may change on its estimate.
type quoteState struct {
	status, acceptedBy, acceptedDate string
	revision                         int
}

func quoteStateOf(t testing.TB, app core.App, id string) quoteState {
	t.Helper()
	r := reload(t, app, "books_estimates", id)
	return quoteState{
		status: r.GetString("status"), acceptedBy: r.GetString("accepted_by"),
		acceptedDate: r.GetString("accepted_date"), revision: r.GetInt("revision"),
	}
}

// saveResponse saves a response as the app (the seed's path): the guard runs.
func saveResponse(app core.App, estimateID, decision, name, reason string) (*core.Record, error) {
	return saveNew(app, "books_estimate_responses", map[string]any{
		"estimate": estimateID, "decision": decision, "name": name, "reason": reason,
	})
}

func mustSaveResponse(t testing.TB, app core.App, estimateID, decision, name, reason string) *core.Record {
	t.Helper()
	r, err := saveResponse(app, estimateID, decision, name, reason)
	if err != nil {
		t.Fatalf("save a %s response: %v", decision, err)
	}
	return r
}

type refusalBody struct {
	Status  int                       `json:"status"`
	Message string                    `json:"message"`
	Data    map[string]map[string]any `json:"data"`
}

func refusalOf(t testing.TB, res callResult) refusalBody {
	t.Helper()
	var out refusalBody
	if err := json.Unmarshal([]byte(res.body), &out); err != nil {
		t.Fatalf("refusal body is not JSON: %v (%s)", err, res.body)
	}
	return out
}

// The guard's consts say the decisions' words (PocketBase adds a final period
// to a text without one).
func TestEstimateResponse_MessagesAreTheDecisionsTexts(t *testing.T) {
	for _, tc := range []struct{ got, want string }{
		{msgResponseNotPending, wantResponseNotPending},
		{msgResponseReasonOnAccept, wantResponseReasonOnAccept},
		{msgResponseNameRequired, wantResponseNameRequired},
		{fmt.Sprintf(msgResponseExpired, "Oct 31, 2026"), "This estimate expired on Oct 31, 2026."},
	} {
		if strings.TrimSuffix(tc.got, ".") != strings.TrimSuffix(tc.want, ".") {
			t.Errorf("message %q, want %q", tc.got, tc.want)
		}
	}
}

// Spec §3.5: a customer's Accept sets the estimate Accepted with the typed
// name and the server's today, in the one create of the response.
func TestEstimateResponse_AcceptSetsTheEstimateAccepted(t *testing.T) {
	pe := newPublicEnv(t)
	before := quoteStateOf(t, pe.app, pe.a.Id)
	dayBefore := todayUTC(time.Now())
	req := postResponse(tokenOf(t, pe.app, pe.a.Id), responseBody(pe.a.Id, "accepted", "  Dana Whitfield  ", ""))
	req.want = http.StatusOK
	// PocketBase returns the created record to its creator with no view rule.
	req.content = []string{`"estimate":"` + pe.a.Id + `"`, `"decision":"accepted"`, `"name":"Dana Whitfield"`}
	req.after = func(t testing.TB, app *tests.TestApp) {
		dayAfter := todayUTC(time.Now())
		got := quoteStateOf(t, app, pe.a.Id)
		if got.status != statusAccepted || got.acceptedBy != "Dana Whitfield" {
			t.Errorf("estimate status %q accepted_by %q, want accepted and Dana Whitfield", got.status, got.acceptedBy)
		}
		if got.acceptedDate != dayBefore && got.acceptedDate != dayAfter {
			t.Errorf("accepted_date = %q, want today (UTC) %q", got.acceptedDate, dayAfter)
		}
		if got.revision != before.revision+1 {
			t.Errorf("revision = %d, want %d (one more than before)", got.revision, before.revision+1)
		}
		rows := responsesOf(t, app, pe.a.Id)
		if len(rows) != 1 {
			t.Fatalf("%d stored responses, want 1", len(rows))
		}
		if rows[0].GetString("name") != "Dana Whitfield" || rows[0].GetString("decision") != "accepted" {
			t.Errorf("stored response name %q decision %q, want the trimmed name and accepted",
				rows[0].GetString("name"), rows[0].GetString("decision"))
		}
	}
	req.run(t, pe.app)
}

// Spec §3.4: Expired is an expiration date before today, so an estimate that
// expires today or later still takes an accept.
func TestEstimateResponse_AcceptBeforeTheEstimateExpires(t *testing.T) {
	today := todayUTC(time.Now())
	day, err := parseDay(today)
	if err != nil {
		t.Fatalf("parse today %q: %v", today, err)
	}
	tomorrow := day.AddDate(0, 0, 1).Format(dayLayout)
	for name, expiration := range map[string]string{"expires today": today, "expires tomorrow": tomorrow} {
		t.Run(name, func(t *testing.T) {
			pe := newPublicEnv(t)
			if err := setFields(t, pe.app, "books_estimates", pe.a.Id, map[string]any{
				"date": today, "expiration_date": expiration,
			}); err != nil {
				t.Fatalf("set the expiration date %s: %v", expiration, err)
			}
			req := postResponse(tokenOf(t, pe.app, pe.a.Id), responseBody(pe.a.Id, "accepted", "Dana Whitfield", ""))
			req.want = http.StatusOK
			req.content = []string{`"decision":"accepted"`}
			req.after = func(t testing.TB, app *tests.TestApp) {
				if got := quoteStateOf(t, app, pe.a.Id); got.status != statusAccepted || got.acceptedBy != "Dana Whitfield" {
					t.Errorf("estimate expiring %s: status %q accepted_by %q, want accepted by Dana Whitfield",
						expiration, got.status, got.acceptedBy)
				}
				if rows := responsesOf(t, app, pe.a.Id); len(rows) != 1 {
					t.Errorf("%d stored responses, want 1", len(rows))
				}
			}
			req.run(t, pe.app)
		})
	}
}

// Spec §3.5: Decline sets Rejected and clears the acceptance; the reason is
// stored trimmed, and a reason of spaces as "".
func TestEstimateResponse_DeclineSetsTheEstimateRejected(t *testing.T) {
	for name, tc := range map[string]struct{ reason, stored string }{
		"with a reason":                {"  Too early  ", "Too early"},
		"with a reason of only spaces": {"    ", ""},
	} {
		t.Run(name, func(t *testing.T) {
			pe := newPublicEnv(t)
			before := quoteStateOf(t, pe.app, pe.a.Id)
			req := postResponse(tokenOf(t, pe.app, pe.a.Id), responseBody(pe.a.Id, "declined", "", tc.reason))
			req.want = http.StatusOK
			req.content = []string{`"decision":"declined"`}
			req.after = func(t testing.TB, app *tests.TestApp) {
				got := quoteStateOf(t, app, pe.a.Id)
				if got.status != statusRejected || got.acceptedBy != "" || got.acceptedDate != "" {
					t.Errorf("estimate status %q accepted_by %q accepted_date %q, want rejected with no acceptance",
						got.status, got.acceptedBy, got.acceptedDate)
				}
				if got.revision != before.revision+1 {
					t.Errorf("revision = %d, want %d", got.revision, before.revision+1)
				}
				rows := responsesOf(t, app, pe.a.Id)
				if len(rows) != 1 {
					t.Fatalf("%d stored responses, want 1", len(rows))
				}
				if got := rows[0].GetString("reason"); got != tc.stored {
					t.Errorf("stored reason = %q, want %q", got, tc.stored)
				}
			}
			req.run(t, pe.app)
		})
	}
}

// Each refusal stores no response and leaves the estimate as it was.
func TestEstimateResponse_Refusals(t *testing.T) {
	cases := []struct {
		name    string
		setup   func(t *testing.T, pe *publicEnv)
		token   func(t *testing.T, pe *publicEnv) string
		body    func(pe *publicEnv) string
		message string // the exact refusal text, when the guard refuses
		field   string // the field the refusal names, if any
	}{
		{
			name:  "no header",
			token: func(*testing.T, *publicEnv) string { return "" },
			body:  func(pe *publicEnv) string { return responseBody(pe.a.Id, "accepted", "Dana Whitfield", "") },
		},
		{
			name:  "B's token on estimate A",
			token: func(t *testing.T, pe *publicEnv) string { return tokenOf(t, pe.app, pe.b.Id) },
			body:  func(pe *publicEnv) string { return responseBody(pe.a.Id, "accepted", "Dana Whitfield", "") },
		},
		{
			name:    "an accept with a reason",
			body:    func(pe *publicEnv) string { return responseBody(pe.a.Id, "accepted", "Dana Whitfield", "Fine by us") },
			message: wantResponseReasonOnAccept,
		},
		{
			name:    "an accept with a blank name",
			body:    func(pe *publicEnv) string { return responseBody(pe.a.Id, "accepted", "   ", "") },
			message: wantResponseNameRequired,
			field:   "name",
		},
		{
			name: "an accepted estimate",
			setup: func(t *testing.T, pe *publicEnv) {
				if err := setFields(t, pe.app, "books_estimates", pe.a.Id, map[string]any{
					"status": statusAccepted, "accepted_by": "Lena Ortiz", "accepted_date": "2026-11-05",
				}); err != nil {
					t.Fatalf("accept the estimate: %v", err)
				}
			},
			body:    func(pe *publicEnv) string { return responseBody(pe.a.Id, "declined", "", "") },
			message: wantResponseNotPending,
		},
		{
			name: "a rejected estimate",
			setup: func(t *testing.T, pe *publicEnv) {
				if err := setFields(t, pe.app, "books_estimates", pe.a.Id, map[string]any{"status": statusRejected}); err != nil {
					t.Fatalf("reject the estimate: %v", err)
				}
			},
			body:    func(pe *publicEnv) string { return responseBody(pe.a.Id, "accepted", "Dana Whitfield", "") },
			message: wantResponseNotPending,
		},
		{
			name:    "a closed estimate",
			setup:   func(t *testing.T, pe *publicEnv) { closeEstimate(t, pe.app, pe.a.Id) },
			body:    func(pe *publicEnv) string { return responseBody(pe.a.Id, "accepted", "Dana Whitfield", "") },
			message: wantResponseNotPending,
		},
		{
			name: "an expired estimate",
			setup: func(t *testing.T, pe *publicEnv) {
				if err := setFields(t, pe.app, "books_estimates", pe.a.Id, map[string]any{
					"date": "2026-10-01", "expiration_date": "2026-10-31",
				}); err != nil {
					t.Fatalf("make the estimate expired: %v", err)
				}
			},
			body:    func(pe *publicEnv) string { return responseBody(pe.a.Id, "accepted", "Dana Whitfield", "") },
			message: "This estimate expired on Oct 31, 2026.",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pe := newPublicEnv(t)
			if tc.setup != nil {
				tc.setup(t, pe)
			}
			token := tokenOf(t, pe.app, pe.a.Id)
			if tc.token != nil {
				token = tc.token(t, pe)
			}
			before := quoteStateOf(t, pe.app, pe.a.Id)
			serveCalls(t, pe.app, func(do func(apiReq) callResult) {
				res := do(postResponse(token, tc.body(pe)))
				if res.status != http.StatusBadRequest {
					t.Fatalf("status %d, want 400; body: %s", res.status, res.body)
				}
				if tc.message == "" {
					return
				}
				refusal := refusalOf(t, res)
				if refusal.Message != tc.message {
					t.Errorf("message = %q, want %q", refusal.Message, tc.message)
				}
				if tc.field == "" {
					return
				}
				if msg, _ := refusal.Data[tc.field]["message"].(string); msg != tc.message {
					t.Errorf("field %q message = %q, want %q (data %v)", tc.field, msg, tc.message, refusal.Data)
				}
			})
			if rows := responsesOf(t, pe.app, pe.a.Id); len(rows) != 0 {
				t.Errorf("%d stored responses after the refusal, want 0", len(rows))
			}
			if got := quoteStateOf(t, pe.app, pe.a.Id); got != before {
				t.Errorf("estimate after the refusal = %+v, want unchanged %+v", got, before)
			}
		})
	}
}

// The schema bounds the name at 200 and the reason at 1000 characters.
func TestEstimateResponse_SchemaRefusesLongText(t *testing.T) {
	pe := newPublicEnv(t)
	before := quoteStateOf(t, pe.app, pe.a.Id)
	_, err := saveResponse(pe.app, pe.a.Id, "accepted", strings.Repeat("x", 201), "")
	requireSchemaRefusal(t, err, "name")
	_, err = saveResponse(pe.app, pe.a.Id, "declined", "", strings.Repeat("y", 1001))
	requireSchemaRefusal(t, err, "reason")
	if rows := responsesOf(t, pe.app, pe.a.Id); len(rows) != 0 {
		t.Errorf("%d stored responses after the schema refusals, want 0", len(rows))
	}
	if got := quoteStateOf(t, pe.app, pe.a.Id); got != before {
		t.Errorf("estimate after the refusals = %+v, want unchanged %+v", got, before)
	}
}

// One stored response per pending period: a second answer is refused.
func TestEstimateResponse_SecondResponseIsRefused(t *testing.T) {
	pe := newPublicEnv(t)
	tokenA := tokenOf(t, pe.app, pe.a.Id)
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		if first := do(postResponse(tokenA, responseBody(pe.a.Id, "accepted", "Dana Whitfield", ""))); first.status != http.StatusOK {
			t.Fatalf("the first response: status %d, want 200; body: %s", first.status, first.body)
		}
		second := do(postResponse(tokenA, responseBody(pe.a.Id, "declined", "", "Changed our mind")))
		if second.status != http.StatusBadRequest {
			t.Fatalf("the second response: status %d, want 400; body: %s", second.status, second.body)
		}
		if msg := refusalOf(t, second).Message; msg != wantResponseNotPending {
			t.Errorf("message = %q, want %q", msg, wantResponseNotPending)
		}
	})
	if rows := responsesOf(t, pe.app, pe.a.Id); len(rows) != 1 {
		t.Errorf("%d stored responses, want 1", len(rows))
	}
	if got := quoteStateOf(t, pe.app, pe.a.Id).status; got != statusAccepted {
		t.Errorf("status = %q after the refused second response, want accepted", got)
	}
}

// Spec §4.3: only Books readers read responses; a token reads none.
func TestEstimateResponse_OnlyBooksReadersRead(t *testing.T) {
	pe := newPublicEnv(t)
	respA := mustSaveResponse(t, pe.app, pe.a.Id, "declined", "", "Too early")
	respB := mustSaveResponse(t, pe.app, pe.b.Id, "accepted", "Dana Whitfield", "")
	tokenA := tokenOf(t, pe.app, pe.a.Id)
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		if got := do(get(publicResponsesURL, tokenA, "")).list(t); got.TotalItems != 0 || len(got.Items) != 0 {
			t.Errorf("A's token lists %d responses, want 0", got.TotalItems)
		}
		if got := do(get(publicResponsesURL+"/"+respA.Id, tokenA, "")); got.status != http.StatusNotFound {
			t.Errorf("A's token viewing A's response: status %d, want 404; body: %s", got.status, got.body)
		}
		if got := do(get(publicResponsesURL, "", "")).list(t); got.TotalItems != 0 {
			t.Errorf("no header lists %d responses, want 0", got.TotalItems)
		}
		reader := do(get(publicResponsesURL, "", tokenFor(t, pe.users.readOnly))).list(t)
		ids := map[string]bool{}
		for _, item := range reader.Items {
			ids[stringOf(t, item, "id")] = true
		}
		if reader.TotalItems != 2 || !ids[respA.Id] || !ids[respB.Id] {
			t.Errorf("a Books reader lists %d responses %v, want A's and B's", reader.TotalItems, ids)
		}
	})
}

// Plan review blocker 1: a token holder cannot learn A's private fields
// through a relation filter or an expand, on the responses or on the view.
func TestEstimateResponse_NoRelationProbe(t *testing.T) {
	pe := newPublicEnv(t)
	mustSaveResponse(t, pe.app, pe.a.Id, "declined", "", "Too early")
	tokenA := tokenOf(t, pe.app, pe.a.Id)
	responseProbes := []map[string]string{
		{"filter": fmt.Sprintf("estimate.memo~%q", publicMemoA)},
		{"filter": `estimate.customer.email~"@"`},
		{"filter": `estimate.bill_to~"a"`},
		{"filter": fmt.Sprintf("estimate.books_estimate_lines_via_estimate.description~%q", publicLineA)},
		{"expand": "estimate,estimate.customer"},
	}
	viewProbes := []map[string]string{
		{"filter": `memo~"x"`},
		{"filter": fmt.Sprintf("memo~%q", publicMemoA)},
		{"expand": "estimate,customer"},
	}
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		for _, probe := range responseProbes {
			res := do(get(withQuery(publicResponsesURL, probe), tokenA, ""))
			res.requireNoSecret(t, fmt.Sprintf("responses %v", probe))
			if res.status == http.StatusBadRequest {
				continue
			}
			if got := res.list(t); got.TotalItems != 0 || len(got.Items) != 0 {
				t.Errorf("responses %v with A's token: totalItems %d, want 0 as with no filter", probe, got.TotalItems)
			}
		}
		for _, probe := range viewProbes {
			res := do(get(withQuery(publicViewURL, probe), tokenA, ""))
			res.requireNoSecret(t, fmt.Sprintf("view %v", probe))
			if res.status == http.StatusBadRequest {
				continue
			}
			requireOnePublicRow(t, res.list(t), pe.a)
		}
	})
}

// Plan review blocker 1: the create's 200 body is the one record a token
// holder gets back; an expand on it must not carry A's private fields.
func TestEstimateResponse_CreateExpandProbe(t *testing.T) {
	pe := newPublicEnv(t)
	tokenA := tokenOf(t, pe.app, pe.a.Id)
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		probe := postResponse(tokenA, responseBody(pe.a.Id, "declined", "", "Too early"))
		probe.url = withQuery(publicResponsesURL, map[string]string{"expand": "estimate,estimate.customer"})
		res := do(probe)
		if res.status != http.StatusOK {
			t.Fatalf("the create with an expand: status %d, want 200; body: %s", res.status, res.body)
		}
		res.requireNoSecret(t, "the create's body with expand=estimate,estimate.customer")
	})
	if got := quoteStateOf(t, pe.app, pe.a.Id).status; got != statusRejected {
		t.Errorf("status = %q after the decline, want rejected", got)
	}
}

// No rule updates or deletes a response: not the token holder, not an admin.
func TestEstimateResponse_NobodyUpdatesOrDeletes(t *testing.T) {
	pe := newPublicEnv(t)
	resp := mustSaveResponse(t, pe.app, pe.a.Id, "declined", "", "Too early")
	tokenA := tokenOf(t, pe.app, pe.a.Id)
	admin := tokenFor(t, pe.users.admin)
	record := publicResponsesURL + "/" + resp.Id
	serveCalls(t, pe.app, func(do func(apiReq) callResult) {
		for name, call := range map[string]apiReq{
			"the token holder's update": {method: http.MethodPatch, url: record, shareToken: tokenA, body: `{"reason":"Changed"}`},
			"the token holder's delete": {method: http.MethodDelete, url: record, shareToken: tokenA},
			"a Books admin's update":    {method: http.MethodPatch, url: record, token: admin, body: `{"reason":"Changed"}`},
			"a Books admin's delete":    {method: http.MethodDelete, url: record, token: admin},
		} {
			if res := do(call); res.status < 400 {
				t.Errorf("%s: status %d, want a refusal; body: %s", name, res.status, res.body)
			}
		}
	})
	stored, err := pe.app.FindRecordById("books_estimate_responses", resp.Id)
	if err != nil {
		t.Fatalf("the response is gone: %v", err)
	}
	if got := stored.GetString("reason"); got != "Too early" {
		t.Errorf("reason = %q after the refused writes, want Too early", got)
	}
}

// Spec §4.4: the seed saves a decline as the app; the same guard runs and sets
// the estimate Rejected.
func TestEstimateResponse_AppSaveRunsTheGuard(t *testing.T) {
	pe := newPublicEnv(t)
	before := quoteStateOf(t, pe.app, pe.a.Id)
	resp := mustSaveResponse(t, pe.app, pe.a.Id, "declined", "  ", "  Budget moved to next year  ")
	got := quoteStateOf(t, pe.app, pe.a.Id)
	if got.status != statusRejected || got.revision != before.revision+1 {
		t.Errorf("estimate after an app-saved decline = %+v, want rejected at revision %d", got, before.revision+1)
	}
	if reason := reload(t, pe.app, "books_estimate_responses", resp.Id).GetString("reason"); reason != "Budget moved to next year" {
		t.Errorf("stored reason = %q, want it trimmed", reason)
	}
	_, err := saveResponse(pe.app, pe.a.Id, "accepted", "Dana Whitfield", "")
	requireRefusalText(t, err, wantResponseNotPending)
}

// Deleting an estimate deletes its responses.
func TestEstimateResponse_DeletedWithItsEstimate(t *testing.T) {
	pe := newPublicEnv(t)
	mustSaveResponse(t, pe.app, pe.a.Id, "declined", "", "Too early")
	mustSaveResponse(t, pe.app, pe.b.Id, "declined", "", "")
	if err := pe.app.Delete(reload(t, pe.app, "books_estimates", pe.a.Id)); err != nil {
		t.Fatalf("delete estimate A: %v", err)
	}
	if rows := responsesOf(t, pe.app, pe.a.Id); len(rows) != 0 {
		t.Errorf("%d responses of the deleted estimate remain, want 0", len(rows))
	}
	if rows := responsesOf(t, pe.app, pe.b.Id); len(rows) != 1 {
		t.Errorf("%d responses of estimate B, want 1 (only A's go)", len(rows))
	}
}
