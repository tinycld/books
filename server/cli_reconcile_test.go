package books

import (
	"fmt"
	"net/http"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// The requests of `tinycld books reconcile` (cli/reconcile*.go), sent to the
// real PocketBase API with an access token. The CLI tests run against a fake
// that checks no rule and no hook; these tests hold what the commands rely on.
// A body here is a copy of what the CLI test of the command asserts: when one
// changes, change the other.

const (
	cliReconID       = "clirecon0000001"
	reconsCollection = "books_reconciliations"
	clearedRows      = "books_reconciliation_lines"
	reconcileView    = "books_reconcile_lines"
)

// cliReconEnv is a cliBankEnv with batch writes on and three posted lines on
// checking: money in on Sep 3, money out on Sep 10 and money out on Oct 2.
type cliReconEnv struct {
	*cliBankEnv
	admin         string
	in, out, late string
}

func newCLIReconEnv(t *testing.T) *cliReconEnv {
	t.Helper()
	env := newCLIBankEnv(t)
	enableBatch(t, env.app)
	line := func(date string, debit, credit int) string {
		return lineOn(t, env.app, env.postedEntry(t, date, env.checking, debit, credit).Id, env.checking).Id
	}
	return &cliReconEnv{
		cliBankEnv: env,
		admin:      "Bearer " + oauthToken(t, env.app, env.users.admin, cliBankScopes...),
		in:         line("2026-09-03", 50000, 0),
		out:        line("2026-09-10", 0, 8000),
		late:       line("2026-10-02", 0, 100),
	}
}

// startBody is the create of `reconcile start`: the caller's fields, the id
// and the first status.
func (env *cliReconEnv) startBody(id string) string {
	return fmt.Sprintf(`{"account":%q,"id":%q,"statement_balance":42000,"statement_date":"2026-09-30","status":"in_progress"}`, env.checking.Id, id)
}

func (env *cliReconEnv) start(t testing.TB) {
	t.Helper()
	env.call(t, env.writer, http.MethodPost, collectionURL(reconsCollection), env.startBody(cliReconID)).requireStatus(t, http.StatusOK)
}

// clearOp is one write of `reconcile clear`: a cleared row with the journal
// line and the reconciliation.
func clearOp(id, line string) string {
	return cliOp("POST", clearedRows, "", fmt.Sprintf(`{"id":%q,"line":%q,"reconciliation":%q}`, id, line, cliReconID))
}

func (env *cliReconEnv) batch(t testing.TB, auth string, ops ...string) apiAnswer {
	t.Helper()
	return env.call(t, auth, http.MethodPost, "/api/batch", batchBody(ops...))
}

// requireBatchRefusal checks a refused batch whose first write has the message
// want.
func (a apiAnswer) requireBatchRefusal(t testing.TB, want string) {
	t.Helper()
	a.requireStatus(t, http.StatusBadRequest)
	data, _ := a.json(t)["data"].(map[string]any)
	requests, _ := data["requests"].(map[string]any)
	first, _ := requests["0"].(map[string]any)
	response, _ := first["response"].(map[string]any)
	if got, _ := response["message"].(string); got != want {
		t.Errorf("the refusal of the batch = %q, want %q; body: %s", got, want, a.body)
	}
}

func TestCLIReconcile_ATokenStartsEditsAndDiscards(t *testing.T) {
	env := newCLIReconEnv(t)
	recons, one := collectionURL(reconsCollection), collectionURL(reconsCollection)+"/"+cliReconID
	env.call(t, env.reader, http.MethodPost, recons, env.startBody(cliReconID)).requireStatus(t, http.StatusForbidden)
	started := env.call(t, env.writer, http.MethodPost, recons, env.startBody(cliReconID))
	started.requireStatus(t, http.StatusOK)
	if got := started.json(t); got["status"] != "in_progress" || got["currency"] != "USD" || got["beginning_balance"] != float64(0) {
		t.Errorf("the started reconciliation = %s", started.body)
	}
	// The account has one reconciliation in progress: a send with the same id
	// and a send with a new one get the same refusal, so `start` reads the id
	// it chose before it says that a send failed.
	inProgress := "1000 Business Checking has a reconciliation in progress. Resume it or discard it."
	env.call(t, env.writer, http.MethodPost, recons, env.startBody(cliReconID)).requireRefusal(t, inProgress)
	env.call(t, env.writer, http.MethodPost, recons, env.startBody("clirecon0000002")).requireRefusal(t, inProgress)
	// `edit` changes the statement's values, and never the account.
	edited := env.call(t, env.writer, http.MethodPatch, one, `{"has_statement_totals":true,"statement_in":50000,"statement_out":8000}`)
	edited.requireStatus(t, http.StatusOK)
	if got := edited.json(t); got["has_statement_totals"] != true || got["statement_in"] != float64(50000) {
		t.Errorf("the edited reconciliation = %s", edited.body)
	}
	env.call(t, env.writer, http.MethodPatch, one, fmt.Sprintf(`{"account":%q}`, env.savings.Id)).requireStatus(t, http.StatusNotFound)
	// `list --account --status`.
	listed := env.list(t, reconsCollection, fmt.Sprintf(`account = %q && status = "in_progress"`, env.checking.Id), "-statement_date,id").items(t)
	if len(listed) != 1 || listed[0]["id"] != cliReconID {
		t.Errorf("the list = %v", listed)
	}
	// `discard`.
	env.call(t, env.reader, http.MethodDelete, one, "").requireStatus(t, http.StatusForbidden)
	env.call(t, env.writer, http.MethodDelete, one, "").requireStatus(t, http.StatusNoContent)
}

func TestCLIReconcile_ATokenClearsAndUnclears(t *testing.T) {
	env := newCLIReconEnv(t)
	env.start(t)
	// `show` reads the lines that can be cleared: not cleared, and dated on or
	// before the statement date.
	open := fmt.Sprintf(`account = %q && reconciliation = "" && date <= "2026-09-30"`, env.checking.Id)
	if rows := env.list(t, reconcileView, open, "date,id").items(t); len(rows) != 2 || rows[0]["line"] != env.in || rows[1]["line"] != env.out {
		t.Fatalf("the open lines = %v", rows)
	}
	env.batch(t, env.reader, clearOp("clicleared00001", env.in)).requireStatus(t, http.StatusForbidden)
	env.batch(t, env.writer, clearOp("clicleared00001", env.in), clearOp("clicleared00002", env.out)).requireStatus(t, http.StatusOK)
	// The cleared rows of `show`: the view names the reconciliation of a line,
	// and Books stamped the amounts on the row.
	cleared := env.list(t, reconcileView, `reconciliation = "`+cliReconID+`"`, "date,id").items(t)
	if len(cleared) != 2 || cleared[0]["line"] != env.in || cleared[0]["debit"] != float64(50000) || cleared[1]["credit"] != float64(8000) {
		t.Errorf("the cleared lines = %v", cleared)
	}
	if rows := env.list(t, reconcileView, open, "date,id").items(t); len(rows) != 0 {
		t.Errorf("the open lines after the clear = %v", rows)
	}
	// A line is cleared one time, and not after the statement date.
	env.batch(t, env.writer, clearOp("clicleared00003", env.in)).requireBatchRefusal(t, "Journal entry 1 is cleared in another reconciliation.")
	env.batch(t, env.writer, clearOp("clicleared00004", env.late)).requireBatchRefusal(t, "Journal entry 3 is dated after Sep 30, 2026.")
	// `unclear` finds the row of a line and deletes it.
	rows := env.list(t, clearedRows, `reconciliation = "`+cliReconID+`"`, "").items(t)
	if len(rows) != 2 || rows[1]["id"] != "clicleared00002" || rows[1]["line"] != env.out {
		t.Fatalf("the cleared rows = %v", rows)
	}
	env.batch(t, env.writer, cliOp("DELETE", clearedRows, "clicleared00002", "")).requireStatus(t, http.StatusOK)
	if rows := env.list(t, reconcileView, open, "date,id").items(t); len(rows) != 1 || rows[0]["line"] != env.out {
		t.Errorf("the open lines after the unclear = %v", rows)
	}
}

func TestCLIReconcile_ATokenFinishesAndAnAdminUndoes(t *testing.T) {
	env := newCLIReconEnv(t)
	env.start(t)
	one := collectionURL(reconsCollection) + "/" + cliReconID
	finish, undo := `{"status":"finished"}`, `{"status":"in_progress"}`
	// The refusal holds the difference: the CLI computes none.
	env.call(t, env.writer, http.MethodPatch, one, finish).requireRefusal(t, "The difference is $420.00. It must be $0.00 to finish.")
	env.batch(t, env.writer, clearOp("clicleared00001", env.in), clearOp("clicleared00002", env.out)).requireStatus(t, http.StatusOK)
	finished := env.call(t, env.writer, http.MethodPatch, one, finish)
	finished.requireStatus(t, http.StatusOK)
	if got := finished.json(t); got["status"] != "finished" || got["cleared_in"] != float64(50000) || got["cleared_out"] != float64(8000) || got["finished_by_name"] == "" {
		t.Errorf("the finished reconciliation = %s", finished.body)
	}
	// A finished reconciliation takes one change, the undo: every other write
	// answers 404, so the commands read the status first.
	env.call(t, env.writer, http.MethodPatch, one, finish).requireStatus(t, http.StatusNotFound)
	env.call(t, env.writer, http.MethodPatch, one, `{"statement_balance":1}`).requireStatus(t, http.StatusNotFound)
	env.call(t, env.writer, http.MethodDelete, one, "").requireStatus(t, http.StatusNotFound)
	env.batch(t, env.writer, clearOp("clicleared00005", env.late)).requireBatchRefusal(t, "This reconciliation is finished.")
	env.batch(t, env.writer, cliOp("DELETE", clearedRows, "clicleared00002", "")).requireBatchRefusal(t, "The requested resource wasn't found.")
	// `undo`: a Books admin only, and not while the account has a later
	// reconciliation in progress.
	env.call(t, env.writer, http.MethodPatch, one, undo).requireRefusal(t, "Only a Books admin can undo a reconciliation.")
	recons, next := collectionURL(reconsCollection), "clirecon0000002"
	october := fmt.Sprintf(`{"account":%q,"id":%q,"statement_balance":41900,"statement_date":"2026-10-31","status":"in_progress"}`, env.checking.Id, next)
	env.call(t, env.writer, http.MethodPost, recons, october).requireStatus(t, http.StatusOK)
	env.call(t, env.admin, http.MethodPatch, one, undo).requireRefusal(t, "1000 Business Checking has a reconciliation in progress. Resume it or discard it.")
	env.call(t, env.writer, http.MethodDelete, recons+"/"+next, "").requireStatus(t, http.StatusNoContent)
	undone := env.call(t, env.admin, http.MethodPatch, one, undo)
	undone.requireStatus(t, http.StatusOK)
	if got := undone.json(t); got["status"] != "in_progress" || got["finished_at"] != "" || got["cleared_in"] != float64(0) {
		t.Errorf("the reconciliation after the undo = %s", undone.body)
	}
	// The lines stay cleared: the bookkeeper finishes again.
	env.call(t, env.writer, http.MethodPatch, one, finish).requireStatus(t, http.StatusOK)
}

// cli/reconcile.go declares these fields in Go, so
// TestCLIResources_MatchTheCollections does not see them. When a command gains
// a field, add it here.
func TestCLIReconcile_DeclaredFieldsAreOnTheCollections(t *testing.T) {
	app := newBooksApp(t)
	for collection, fields := range map[string][]string{
		reconsCollection: {"account", "statement_date", "statement_balance", "has_statement_totals", "statement_out", "statement_in", "status", "beginning_balance", "cleared_out", "cleared_in", "cleared_out_count", "cleared_in_count", "finished_by_name", "finished_at", "currency"},
		clearedRows:      {"reconciliation", "line"},
		reconcileView:    {"line", "account", "entry", "date", "debit", "credit", "memo", "number", "doc_type", "document", "payee", "reconciliation", "bank_matched"},
	} {
		col, err := app.FindCollectionByNameOrId(collection)
		if err != nil {
			t.Errorf("%s: %v", collection, err)
			continue
		}
		for _, name := range fields {
			if f := col.Fields.GetByName(name); f == nil || f.GetHidden() {
				t.Errorf("%s has no field %q that the API sends, and the CLI reads or writes it", collection, name)
			}
		}
	}
	col, err := app.FindCollectionByNameOrId(reconsCollection)
	if err != nil {
		t.Fatal(err)
	}
	if sel, ok := col.Fields.GetByName("status").(*core.SelectField); !ok || !slices.Equal(sel.Values, []string{"in_progress", "finished"}) {
		t.Errorf("%s.status: the CLI states in_progress and finished, the collection has %v", reconsCollection, sel)
	}
}
