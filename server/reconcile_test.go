package books

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// Reconcile (reconcile spec §3 "Words", §3 "Which accounts", §3 "When a cleared
// or reconciled transaction changes", §4 Schema and Server): a writer starts a
// books_reconciliations row on a bank or credit card account, clears posted
// lines by creating books_reconciliation_lines rows, and finishes it at a
// difference of $0.00. The Go hooks (server/reconcile.go) stamp what the server
// owns and refuse what a rule cannot see.

const (
	rtRecons  = "books_reconciliations"
	rtCleared = "books_reconciliation_lines"
	rtView    = "books_reconcile_lines"
)

// rtEnv is the bank match env (1000 Business Checking connected, 1010 Business
// Savings and 2100 Company Card, Rent as the other side of each entry) with the
// reconcile hooks bound, as Register binds them.
type rtEnv struct {
	*bankMatchEnv
}

func newRtEnv(t *testing.T) *rtEnv {
	t.Helper()
	m := newBankMatchEnv(t)
	registerReconcile(m.app)
	return &rtEnv{bankMatchEnv: m}
}

func rtJSON(t testing.TB, body map[string]any) string {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func rtWith(base map[string]any, extra map[string]any) map[string]any {
	for k, v := range extra {
		base[k] = v
	}
	return base
}

// start creates a reconciliation in progress as user, as the client's insert
// does; extra adds or replaces fields of the body.
func (r *rtEnv) start(t testing.TB, user, account *core.Record, date string, balance int64, extra map[string]any) apiAnswer {
	t.Helper()
	body := rtWith(map[string]any{
		"account": account.Id, "statement_date": date, "statement_balance": balance,
		"has_statement_totals": false, "status": "in_progress",
	}, extra)
	return r.send(t, user, http.MethodPost, collectionURL(rtRecons), rtJSON(t, body))
}

func (r *rtEnv) mustStart(t testing.TB, account *core.Record, date string, balance int64) string {
	t.Helper()
	a := r.start(t, r.users.bookkeeper, account, date, balance, nil)
	a.requireStatus(t, http.StatusOK)
	return a.id(t)
}

func (r *rtEnv) update(t testing.TB, user *core.Record, id string, body map[string]any) apiAnswer {
	t.Helper()
	return r.send(t, user, http.MethodPatch, collectionURL(rtRecons)+"/"+id, rtJSON(t, body))
}

// finish finishes the reconciliation as user. When the finish passes, it checks
// that the server stamped the user's name in finished_by_name (a superuser's
// request keeps what it sends, so it is not checked).
func (r *rtEnv) finish(t testing.TB, user *core.Record, id string) apiAnswer {
	t.Helper()
	a := r.update(t, user, id, map[string]any{"status": "finished"})
	if a.status != http.StatusOK || user.IsSuperuser() {
		return a
	}
	want := rtStampedName(user.GetString("name"))
	if got := reload(t, r.app, rtRecons, id).GetString("finished_by_name"); got != want {
		t.Errorf("finished_by_name = %q after the finish of %s, want the finisher's name %q", got, id, want)
	}
	return a
}

// rtStampedName is the name the finish stamps: the user's name cut to its
// first 200 runes (finished_by_name is text max 200; users.name allows 255).
func rtStampedName(name string) string {
	runes := []rune(name)
	if len(runes) > 200 {
		return string(runes[:200])
	}
	return name
}

func (r *rtEnv) mustFinish(t testing.TB, id string) {
	t.Helper()
	r.finish(t, r.users.bookkeeper, id).requireStatus(t, http.StatusOK)
}

func (r *rtEnv) discard(t testing.TB, user *core.Record, id string) apiAnswer {
	t.Helper()
	return r.send(t, user, http.MethodDelete, collectionURL(rtRecons)+"/"+id, "")
}

// clear creates the cleared row of line in the reconciliation, as a press does.
func (r *rtEnv) clear(t testing.TB, user *core.Record, recon string, line *core.Record, extra map[string]any) apiAnswer {
	t.Helper()
	body := rtWith(map[string]any{"reconciliation": recon, "line": line.Id}, extra)
	return r.send(t, user, http.MethodPost, collectionURL(rtCleared), rtJSON(t, body))
}

func (r *rtEnv) mustClear(t testing.TB, recon string, line *core.Record) string {
	t.Helper()
	a := r.clear(t, r.users.bookkeeper, recon, line, nil)
	a.requireStatus(t, http.StatusOK)
	return a.id(t)
}

func (r *rtEnv) unclear(t testing.TB, user *core.Record, id string) apiAnswer {
	t.Helper()
	return r.send(t, user, http.MethodDelete, collectionURL(rtCleared)+"/"+id, "")
}

// deposit posts money in on account (a debit) and returns the entry and its
// line on account; payment posts money out (a credit).
func (r *rtEnv) deposit(t testing.TB, date string, account *core.Record, amount int) (*core.Record, *core.Record) {
	t.Helper()
	e := r.postedEntry(t, date, account, amount, 0)
	return e, lineOn(t, r.app, e.Id, account)
}

func (r *rtEnv) payment(t testing.TB, date string, account *core.Record, amount int) (*core.Record, *core.Record) {
	t.Helper()
	e := r.postedEntry(t, date, account, 0, amount)
	return e, lineOn(t, r.app, e.Id, account)
}

// finished is a finished reconciliation on account at date that clears line,
// whose amount is its statement balance (the first reconciliation of the
// account, so the beginning balance is 0). The bookkeeper finishes it, and the
// stored row carries the bookkeeper's id and name.
func (r *rtEnv) finished(t testing.TB, account *core.Record, date string, balance int64, lines ...*core.Record) string {
	t.Helper()
	id := r.mustStart(t, account, date, balance)
	for _, l := range lines {
		r.mustClear(t, id, l)
	}
	r.mustFinish(t, id)
	stored := reload(t, r.app, rtRecons, id)
	if stored.GetString("finished_by") != r.users.bookkeeper.Id ||
		stored.GetString("finished_by_name") != r.users.bookkeeper.GetString("name") {
		t.Errorf("finished %s: finished_by %q, finished_by_name %q; want the bookkeeper %q, %q", id,
			stored.GetString("finished_by"), stored.GetString("finished_by_name"),
			r.users.bookkeeper.Id, r.users.bookkeeper.GetString("name"))
	}
	return id
}

// requireRefusedWrite checks that a REST write was refused, by a rule (400,
// 403 or 404 as PocketBase answers each) or by a hook.
func requireRefusedWrite(t testing.TB, a apiAnswer) {
	t.Helper()
	if a.status < 400 || a.status >= 500 {
		t.Fatalf("status = %d, want a refusal (4xx); body: %s", a.status, a.body)
	}
}

// requireKeyedRefusal checks a 400 whose data names field, as refuseField
// gives it.
func requireKeyedRefusal(t testing.TB, a apiAnswer, field string) {
	t.Helper()
	a.requireStatus(t, http.StatusBadRequest)
	data, _ := a.json(t)["data"].(map[string]any)
	if _, ok := data[field]; !ok {
		t.Errorf("refusal %s names fields %v, want %q", a.body, data, field)
	}
}

func rtReconCount(t testing.TB, app core.App, account *core.Record) int64 {
	t.Helper()
	return countOf(t, app, rtRecons, dbx.HashExp{"account": account.Id})
}

func rtClearedCount(t testing.TB, app core.App, recon string) int64 {
	t.Helper()
	return countOf(t, app, rtCleared, dbx.HashExp{"reconciliation": recon})
}

// The fields of a reconciliation that only the server writes.
var rtStampedFields = []string{
	"beginning_balance", "cleared_out", "cleared_in", "cleared_out_count", "cleared_in_count",
	"created_by", "finished_by", "finished_at", "currency",
}

// rtStampedValue is a value a client could send for a stamped field.
func rtStampedValue(r *rtEnv, field string) any {
	switch field {
	case "created_by", "finished_by":
		return r.users.bookkeeper.Id
	case "finished_at":
		return "2026-09-30 12:00:00.000Z"
	case "currency":
		return "EUR"
	case "beginning_balance":
		return 100
	default:
		return 1
	}
}

func TestReconcile_RulesOfReconciliations(t *testing.T) {
	t.Run("a writer creates, updates and deletes a reconciliation in progress", func(t *testing.T) {
		r := newRtEnv(t)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		r.update(t, r.users.bookkeeper, id, map[string]any{"statement_balance": 2000}).requireStatus(t, http.StatusOK)
		if got := reload(t, r.app, rtRecons, id).GetInt("statement_balance"); got != 2000 {
			t.Errorf("statement_balance = %d after the update, want 2000", got)
		}
		r.discard(t, r.users.bookkeeper, id).requireStatus(t, http.StatusNoContent)
		if n := rtReconCount(t, r.app, r.savings); n != 0 {
			t.Errorf("%d reconciliations after the delete, want 0", n)
		}
	})

	t.Run("a reader lists and views and is refused each write", func(t *testing.T) {
		r := newRtEnv(t)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		for _, url := range []string{collectionURL(rtRecons), collectionURL(rtRecons) + "/" + id} {
			a := r.send(t, r.users.readOnly, http.MethodGet, url, "")
			a.requireStatus(t, http.StatusOK)
			if !strings.Contains(a.body, `"`+id+`"`) {
				t.Errorf("GET %s as a reader has no %s: %s", url, id, a.body)
			}
		}
		requireRefusedWrite(t, r.start(t, r.users.readOnly, r.card, "2026-09-30", 0, nil))
		if n := rtReconCount(t, r.app, r.card); n != 0 {
			t.Errorf("%d reconciliations after a reader's create, want 0", n)
		}
		requireRefusedWrite(t, r.update(t, r.users.readOnly, id, map[string]any{"statement_balance": 5}))
		if got := reload(t, r.app, rtRecons, id).GetInt("statement_balance"); got != 1000 {
			t.Errorf("statement_balance = %d after a reader's update, want 1000", got)
		}
		requireRefusedWrite(t, r.discard(t, r.users.readOnly, id))
		reload(t, r.app, rtRecons, id)
	})

	t.Run("a create with status finished is refused", func(t *testing.T) {
		r := newRtEnv(t)
		requireRefusedWrite(t, r.start(t, r.users.bookkeeper, r.savings, "2026-09-30", 0,
			map[string]any{"status": "finished"}))
		if n := rtReconCount(t, r.app, r.savings); n != 0 {
			t.Errorf("%d reconciliations after a finished create, want 0", n)
		}
	})

	for _, field := range rtStampedFields {
		t.Run("a create that sends "+field+" is refused", func(t *testing.T) {
			r := newRtEnv(t)
			requireRefusedWrite(t, r.start(t, r.users.bookkeeper, r.savings, "2026-09-30", 0,
				map[string]any{field: rtStampedValue(r, field)}))
			if n := rtReconCount(t, r.app, r.savings); n != 0 {
				t.Errorf("%d reconciliations after a create that sent %s, want 0", n, field)
			}
		})
		t.Run("an update that sends "+field+" is refused", func(t *testing.T) {
			r := newRtEnv(t)
			id := r.mustStart(t, r.savings, "2026-09-30", 0)
			before := reload(t, r.app, rtRecons, id).GetString(field)
			requireRefusedWrite(t, r.update(t, r.users.bookkeeper, id, map[string]any{field: rtStampedValue(r, field)}))
			if got := reload(t, r.app, rtRecons, id).GetString(field); got != before {
				t.Errorf("%s = %q after a refused update, want %q", field, got, before)
			}
		})
	}

	t.Run("an update that sends account is refused", func(t *testing.T) {
		r := newRtEnv(t)
		id := r.mustStart(t, r.savings, "2026-09-30", 0)
		requireRefusedWrite(t, r.update(t, r.users.bookkeeper, id, map[string]any{"account": r.card.Id}))
		if got := reload(t, r.app, rtRecons, id).GetString("account"); got != r.savings.Id {
			t.Errorf("account = %q after a refused update, want the savings account", got)
		}
	})

	t.Run("an update and a delete of a finished reconciliation are refused", func(t *testing.T) {
		r := newRtEnv(t)
		id := r.finished(t, r.savings, "2026-08-31", 0)
		requireRefusedWrite(t, r.update(t, r.users.bookkeeper, id, map[string]any{"statement_balance": 5}))
		// An admin's undo ({status: "in_progress"} alone) passes: TestReconcileUndo_Rule.
		requireRefusedWrite(t, r.update(t, r.users.admin, id, map[string]any{"statement_balance": 5}))
		stored := reload(t, r.app, rtRecons, id)
		if stored.GetString("status") != "finished" || stored.GetInt("statement_balance") != 0 {
			t.Errorf("finished row = status %q, balance %d after refused updates, want finished, 0",
				stored.GetString("status"), stored.GetInt("statement_balance"))
		}
		requireRefusedWrite(t, r.discard(t, r.users.bookkeeper, id))
		requireRefusedWrite(t, r.discard(t, r.users.admin, id))
		reload(t, r.app, rtRecons, id)
	})
}

// A delete of a record loaded while the reconciliation was in progress, sent
// after another request finished it, reads the stored status, not the stale
// one (spec §4: a delete of a finished row is refused).
func TestReconcile_StaleDeleteOfFinishedIsRefused(t *testing.T) {
	r := newRtEnv(t)
	id := r.mustStart(t, r.savings, "2026-09-30", 0)
	stale := reload(t, r.app, rtRecons, id)
	r.mustFinish(t, id)

	err := r.app.Delete(stale)

	if got := apiErrorOf(t, err).Message; got != msgReconcileFinished {
		t.Errorf("refusal = %q, want %q", got, msgReconcileFinished)
	}
	if got := reload(t, r.app, rtRecons, id).GetString("status"); got != reconcileFinished {
		t.Errorf("status = %q after the stale delete, want %q", got, reconcileFinished)
	}
}

// An update of a record loaded while the reconciliation was in progress, saved
// after another request finished it, is checked against the stored row (spec
// §4: an update of a finished row is refused), so it cannot turn the
// reconciliation back to in progress.
func TestReconcile_StaleUpdateOfFinishedIsRefused(t *testing.T) {
	r := newRtEnv(t)
	_, line := r.deposit(t, "2026-09-10", r.savings, 1000)
	id := r.mustStart(t, r.savings, "2026-09-30", 1000)
	cleared := r.mustClear(t, id, line)
	stale := reload(t, r.app, rtRecons, id)
	r.mustFinish(t, id)

	stale.Set("statement_balance", 1500)
	err := r.app.Save(stale)

	if got := apiErrorOf(t, err).Message; got != msgReconcileFinished {
		t.Errorf("refusal = %q, want %q", got, msgReconcileFinished)
	}
	stored := reload(t, r.app, rtRecons, id)
	if stored.GetString("status") != reconcileFinished || stored.GetInt("statement_balance") != 1000 {
		t.Errorf("stored row = status %q, balance %d after the stale update, want %q, 1000",
			stored.GetString("status"), stored.GetInt("statement_balance"), reconcileFinished)
	}
	if !reload(t, r.app, rtCleared, cleared).GetBool("finished") {
		t.Error("the cleared row is no longer finished after the stale update")
	}
}

func TestReconcile_RulesOfClearedRows(t *testing.T) {
	type pinned struct {
		field string
		value func(r *rtEnv, line *core.Record) any
	}
	fields := []pinned{
		{"account", func(r *rtEnv, _ *core.Record) any { return r.savings.Id }},
		{"entry", func(_ *rtEnv, line *core.Record) any { return line.GetString("entry") }},
		{"date", func(_ *rtEnv, _ *core.Record) any { return "2026-09-01" }},
		{"debit", func(_ *rtEnv, _ *core.Record) any { return 1 }},
		{"credit", func(_ *rtEnv, _ *core.Record) any { return 1 }},
		{"finished", func(_ *rtEnv, _ *core.Record) any { return false }},
	}
	for _, f := range fields {
		t.Run("a create that sends "+f.field+" is refused", func(t *testing.T) {
			r := newRtEnv(t)
			_, line := r.deposit(t, "2026-09-05", r.savings, 5000)
			id := r.mustStart(t, r.savings, "2026-09-30", 5000)
			requireRefusedWrite(t, r.clear(t, r.users.bookkeeper, id, line, map[string]any{f.field: f.value(r, line)}))
			if n := rtClearedCount(t, r.app, id); n != 0 {
				t.Errorf("%d cleared rows after a create that sent %s, want 0", n, f.field)
			}
		})
	}

	t.Run("any update of a cleared row is refused", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-05", r.savings, 5000)
		_, other := r.deposit(t, "2026-09-06", r.savings, 7000)
		id := r.mustStart(t, r.savings, "2026-09-30", 5000)
		cleared := r.mustClear(t, id, line)
		for _, user := range []*core.Record{r.users.bookkeeper, r.users.admin} {
			requireRefusedWrite(t, r.send(t, user, http.MethodPatch, collectionURL(rtCleared)+"/"+cleared,
				rtJSON(t, map[string]any{"line": other.Id})))
		}
		if got := reload(t, r.app, rtCleared, cleared).GetString("line"); got != line.Id {
			t.Errorf("cleared row line = %q after refused updates, want %q", got, line.Id)
		}
	})

	t.Run("a delete of a row with finished = true is refused", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-05", r.savings, 5000)
		id := r.mustStart(t, r.savings, "2026-09-30", 5000)
		cleared := r.mustClear(t, id, line)
		// The flag alone, on a reconciliation still in progress: only the rule
		// can refuse this delete.
		row := reload(t, r.app, rtCleared, cleared)
		row.Set("finished", true)
		if err := r.app.UnsafeWithoutHooks().Save(row); err != nil {
			t.Fatal(err)
		}
		requireRefusedWrite(t, r.unclear(t, r.users.bookkeeper, cleared))
		reload(t, r.app, rtCleared, cleared)
	})

	t.Run("a reader is refused a clear and an unclear", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-05", r.savings, 5000)
		_, other := r.deposit(t, "2026-09-06", r.savings, 7000)
		id := r.mustStart(t, r.savings, "2026-09-30", 5000)
		cleared := r.mustClear(t, id, line)
		requireRefusedWrite(t, r.clear(t, r.users.readOnly, id, other, nil))
		requireRefusedWrite(t, r.unclear(t, r.users.readOnly, cleared))
		if n := rtClearedCount(t, r.app, id); n != 1 {
			t.Errorf("%d cleared rows after a reader's writes, want 1", n)
		}
	})
}

func TestReconcile_Create(t *testing.T) {
	t.Run("stamps created_by, currency and a beginning balance of 0 for a first one", func(t *testing.T) {
		r := newRtEnv(t)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		stored := reload(t, r.app, rtRecons, id)
		if stored.GetString("created_by") != r.users.bookkeeper.Id {
			t.Errorf("created_by = %q, want the writer %q", stored.GetString("created_by"), r.users.bookkeeper.Id)
		}
		if stored.GetString("currency") != "USD" {
			t.Errorf("currency = %q, want the account's USD", stored.GetString("currency"))
		}
		if stored.GetInt("beginning_balance") != 0 {
			t.Errorf("beginning_balance = %d, want 0", stored.GetInt("beginning_balance"))
		}
		if stored.GetString("status") != "in_progress" {
			t.Errorf("status = %q, want in_progress", stored.GetString("status"))
		}
	})

	t.Run("refuses an expense account", func(t *testing.T) {
		r := newRtEnv(t)
		r.start(t, r.users.bookkeeper, r.rent, "2026-09-30", 0, nil).
			requireRefusal(t, "Only a bank or credit card account can be reconciled.")
		if n := rtReconCount(t, r.app, r.rent); n != 0 {
			t.Errorf("%d reconciliations of an expense account, want 0", n)
		}
	})

	t.Run("refuses an inactive account", func(t *testing.T) {
		r := newRtEnv(t)
		old := mkNumberedAccount(t, r.app, "Old Savings", "1020", "bank", "savings")
		if err := setFields(t, r.app, "books_accounts", old.Id, map[string]any{"inactive": true}); err != nil {
			t.Fatalf("make Old Savings inactive: %v", err)
		}
		r.start(t, r.users.bookkeeper, old, "2026-09-30", 0, nil).requireStatus(t, http.StatusBadRequest)
		if n := rtReconCount(t, r.app, old); n != 0 {
			t.Errorf("%d reconciliations of an inactive account, want 0", n)
		}
	})

	t.Run("refuses a second one in progress", func(t *testing.T) {
		r := newRtEnv(t)
		r.mustStart(t, r.savings, "2026-09-30", 0)
		r.start(t, r.users.bookkeeper, r.savings, "2026-10-31", 0, nil).
			requireRefusal(t, "1010 Business Savings has a reconciliation in progress. Resume it or discard it.")
		if n := rtReconCount(t, r.app, r.savings); n != 1 {
			t.Errorf("%d reconciliations of savings, want 1", n)
		}
	})

	t.Run("refuses a statement date on or before the last finished one, keyed on statement_date", func(t *testing.T) {
		r := newRtEnv(t)
		r.finished(t, r.savings, "2026-08-31", 0)
		for _, day := range []string{"2026-08-31", "2026-08-15"} {
			requireKeyedRefusal(t, r.start(t, r.users.bookkeeper, r.savings, day, 0, nil), "statement_date")
		}
		if n := rtReconCount(t, r.app, r.savings); n != 1 {
			t.Errorf("%d reconciliations of savings, want the 1 finished", n)
		}
	})

	t.Run("accepts a bank account of detail type cash_on_hand and a credit card account", func(t *testing.T) {
		r := newRtEnv(t)
		petty := mkNumberedAccount(t, r.app, "Petty Cash", "1050", "bank", "cash_on_hand")
		r.mustStart(t, petty, "2026-09-30", 0)
		r.mustStart(t, r.card, "2026-09-30", 0)
	})
}

func TestReconcile_BeginningBalanceIsTheLastStatementBalance(t *testing.T) {
	r := newRtEnv(t)
	_, line := r.deposit(t, "2026-08-05", r.savings, 250000)
	r.finished(t, r.savings, "2026-08-31", 250000, line)
	second := r.mustStart(t, r.savings, "2026-09-30", 250000)
	if got := reload(t, r.app, rtRecons, second).GetInt("beginning_balance"); got != 250000 {
		t.Errorf("beginning_balance of the second = %d, want the first's statement_balance 250000", got)
	}
}

func TestReconcile_Update(t *testing.T) {
	t.Run("refuses a statement date on or before the last finished one", func(t *testing.T) {
		r := newRtEnv(t)
		r.finished(t, r.savings, "2026-08-31", 0)
		id := r.mustStart(t, r.savings, "2026-09-30", 0)
		requireKeyedRefusal(t, r.update(t, r.users.bookkeeper, id, map[string]any{"statement_date": "2026-08-31"}),
			"statement_date")
		if got := reload(t, r.app, rtRecons, id).GetString("statement_date"); got != "2026-09-30" {
			t.Errorf("statement_date = %q after a refused update, want 2026-09-30", got)
		}
	})

	t.Run("an earlier statement date deletes exactly the cleared rows dated after it", func(t *testing.T) {
		r := newRtEnv(t)
		_, early := r.deposit(t, "2026-09-05", r.savings, 1000)
		_, onDay := r.deposit(t, "2026-09-20", r.savings, 2000)
		_, late := r.payment(t, "2026-09-25", r.savings, 300)
		_, later := r.deposit(t, "2026-09-28", r.savings, 400)
		id := r.mustStart(t, r.savings, "2026-09-30", 3100)
		keep := []string{r.mustClear(t, id, early), r.mustClear(t, id, onDay)}
		gone := []string{r.mustClear(t, id, late), r.mustClear(t, id, later)}
		// Another account's cleared row after the new date stays.
		_, cardLine := r.payment(t, "2026-09-26", r.card, 900)
		cardRecon := r.mustStart(t, r.card, "2026-09-30", 900)
		cardCleared := r.mustClear(t, cardRecon, cardLine)

		r.update(t, r.users.bookkeeper, id, map[string]any{"statement_date": "2026-09-20"}).requireStatus(t, http.StatusOK)

		for _, c := range keep {
			reload(t, r.app, rtCleared, c)
		}
		for _, c := range gone {
			if _, err := r.app.FindRecordById(rtCleared, c); err == nil {
				t.Errorf("cleared row %s dated after 2026-09-20 is still there", c)
			}
		}
		if n := rtClearedCount(t, r.app, id); n != 2 {
			t.Errorf("%d cleared rows after the earlier date, want 2", n)
		}
		reload(t, r.app, rtCleared, cardCleared)
	})
}

func TestReconcile_Finish(t *testing.T) {
	t.Run("with a difference, refused and nothing stamped", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		id := r.mustStart(t, r.savings, "2026-09-30", 3700)
		cleared := r.mustClear(t, id, line)
		r.finish(t, r.users.bookkeeper, id).requireRefusal(t, "The difference is $27.00. It must be $0.00 to finish.")
		stored := reload(t, r.app, rtRecons, id)
		if stored.GetString("status") != "in_progress" {
			t.Errorf("status = %q after a refused finish, want in_progress", stored.GetString("status"))
		}
		for _, f := range []string{"cleared_out", "cleared_in", "cleared_out_count", "cleared_in_count"} {
			if stored.GetInt(f) != 0 {
				t.Errorf("%s = %d after a refused finish, want 0", f, stored.GetInt(f))
			}
		}
		if stored.GetString("finished_by") != "" || !stored.GetDateTime("finished_at").IsZero() {
			t.Errorf("finished_by %q, finished_at %v after a refused finish, want both empty",
				stored.GetString("finished_by"), stored.GetDateTime("finished_at"))
		}
		if reload(t, r.app, rtCleared, cleared).GetBool("finished") {
			t.Error("the cleared row is finished after a refused finish")
		}
	})

	t.Run("at zero, stamps the sums, the counts, who and when, and finishes each cleared row", func(t *testing.T) {
		r := newRtEnv(t)
		_, in1 := r.deposit(t, "2026-09-03", r.savings, 50000)
		_, in2 := r.deposit(t, "2026-09-10", r.savings, 1250)
		_, out := r.payment(t, "2026-09-15", r.savings, 3000)
		_, open := r.deposit(t, "2026-09-20", r.savings, 999)
		id := r.mustStart(t, r.savings, "2026-09-30", 48250)
		cleared := []string{r.mustClear(t, id, in1), r.mustClear(t, id, in2), r.mustClear(t, id, out)}

		r.mustFinish(t, id)

		stored := reload(t, r.app, rtRecons, id)
		want := map[string]int{"cleared_out": 3000, "cleared_in": 51250, "cleared_out_count": 1, "cleared_in_count": 2}
		for f, v := range want {
			if got := stored.GetInt(f); got != v {
				t.Errorf("%s = %d, want %d", f, got, v)
			}
		}
		if stored.GetString("status") != "finished" {
			t.Errorf("status = %q, want finished", stored.GetString("status"))
		}
		if stored.GetString("finished_by") != r.users.bookkeeper.Id {
			t.Errorf("finished_by = %q, want the writer", stored.GetString("finished_by"))
		}
		if stored.GetDateTime("finished_at").IsZero() {
			t.Error("finished_at is empty after the finish")
		}
		for _, c := range cleared {
			if !reload(t, r.app, rtCleared, c).GetBool("finished") {
				t.Errorf("cleared row %s is not finished", c)
			}
		}
		if n := countOf(t, r.app, rtCleared, dbx.HashExp{"line": open.Id}); n != 0 {
			t.Errorf("%d cleared rows of the line that was not cleared, want 0", n)
		}
	})

	t.Run("an empty reconciliation finishes when the statement balance equals the beginning balance", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-08-05", r.savings, 418000)
		r.finished(t, r.savings, "2026-08-31", 418000, line)
		empty := r.mustStart(t, r.savings, "2026-09-30", 418000)
		r.mustFinish(t, empty)
		if got := reload(t, r.app, rtRecons, empty).GetString("status"); got != "finished" {
			t.Errorf("status = %q, want finished", got)
		}
	})

	t.Run("a credit card account uses the card signs", func(t *testing.T) {
		r := newRtEnv(t)
		_, charge := r.payment(t, "2026-09-04", r.card, 4000)
		_, paid := r.deposit(t, "2026-09-12", r.card, 1500)
		// Owed: beginning 0 + charges 4000 − payments 1500 = 2500. The bank
		// sense would give −2500 and a difference of $50.00.
		id := r.mustStart(t, r.card, "2026-09-30", 2500)
		r.mustClear(t, id, charge)
		r.mustClear(t, id, paid)
		r.mustFinish(t, id)
		stored := reload(t, r.app, rtRecons, id)
		if stored.GetInt("cleared_out") != 4000 || stored.GetInt("cleared_in") != 1500 {
			t.Errorf("cleared_out %d, cleared_in %d, want 4000 and 1500", stored.GetInt("cleared_out"), stored.GetInt("cleared_in"))
		}
	})
}

func TestReconcile_Clear(t *testing.T) {
	t.Run("stamps account, entry, date, debit and credit from the line", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.payment(t, "2026-09-07", r.savings, 2575)
		id := r.mustStart(t, r.savings, "2026-09-30", -2575)
		stored := reload(t, r.app, rtCleared, r.mustClear(t, id, line))
		got := map[string]any{
			"account": stored.GetString("account"), "entry": stored.GetString("entry"),
			"date": stored.GetString("date"), "debit": stored.GetInt("debit"), "credit": stored.GetInt("credit"),
			"finished": stored.GetBool("finished"),
		}
		want := map[string]any{
			"account": r.savings.Id, "entry": line.GetString("entry"), "date": "2026-09-07",
			"debit": 0, "credit": 2575, "finished": false,
		}
		for k, v := range want {
			if got[k] != v {
				t.Errorf("%s = %v, want %v", k, got[k], v)
			}
		}
	})

	t.Run("refuses a finished reconciliation", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-08-20", r.savings, 1000)
		id := r.finished(t, r.savings, "2026-08-31", 0)
		r.clear(t, r.users.bookkeeper, id, line, nil).requireRefusal(t, "This reconciliation is finished.")
		if n := rtClearedCount(t, r.app, id); n != 0 {
			t.Errorf("%d cleared rows of a finished reconciliation, want 0", n)
		}
	})

	t.Run("refuses a line of another account", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-05", r.checking, 1000)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		r.clear(t, r.users.bookkeeper, id, line, nil).requireStatus(t, http.StatusBadRequest)
		if n := rtClearedCount(t, r.app, id); n != 0 {
			t.Errorf("%d cleared rows of another account's line, want 0", n)
		}
	})

	t.Run("refuses a line that is not posted", func(t *testing.T) {
		r := newRtEnv(t)
		draft := mkDraft(t, r.app, "2026-09-05", ln{r.savings, 1000, 0}, ln{r.rent, 0, 1000})
		line := lineOn(t, r.app, draft.Id, r.savings)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		r.clear(t, r.users.bookkeeper, id, line, nil).requireStatus(t, http.StatusBadRequest)
		if n := rtClearedCount(t, r.app, id); n != 0 {
			t.Errorf("%d cleared rows of a draft line, want 0", n)
		}
	})

	t.Run("refuses a line of a void entry and of a void reversal", func(t *testing.T) {
		r := newRtEnv(t)
		entry, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		voidEntryAs(t, r.app, entry.Id, r.users.bookkeeper.Id)
		rev := findReversal(t, r.app, entry.Id)
		revLine := lineOn(t, r.app, rev.Id, r.savings)
		id := r.mustStart(t, r.savings, "2026-09-30", 0)
		r.clear(t, r.users.bookkeeper, id, line, nil).requireRefusal(t, nameOf(t, r.app, entry.Id)+" is void.")
		r.clear(t, r.users.bookkeeper, id, revLine, nil).requireRefusal(t, nameOf(t, r.app, rev.Id)+" is void.")
		if n := rtClearedCount(t, r.app, id); n != 0 {
			t.Errorf("%d cleared rows of void lines, want 0", n)
		}
	})

	t.Run("refuses a line dated after the statement date", func(t *testing.T) {
		r := newRtEnv(t)
		entry, line := r.deposit(t, "2026-10-01", r.savings, 1000)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		r.clear(t, r.users.bookkeeper, id, line, nil).
			requireRefusal(t, nameOf(t, r.app, entry.Id)+" is dated after Sep 30, 2026.")
		if n := rtClearedCount(t, r.app, id); n != 0 {
			t.Errorf("%d cleared rows of a later line, want 0", n)
		}
	})

	t.Run("refuses a line cleared already", func(t *testing.T) {
		r := newRtEnv(t)
		entry, line := r.deposit(t, "2026-08-20", r.savings, 1000)
		r.finished(t, r.savings, "2026-08-31", 1000, line)
		second := r.mustStart(t, r.savings, "2026-09-30", 1000)
		r.clear(t, r.users.bookkeeper, second, line, nil).
			requireRefusal(t, nameOf(t, r.app, entry.Id)+" is cleared in another reconciliation.")
		if n := rtClearedCount(t, r.app, second); n != 0 {
			t.Errorf("%d cleared rows of a reconciled line in the second, want 0", n)
		}
		// Twice in the one in progress: the unique index on line holds.
		_, open := r.deposit(t, "2026-09-10", r.savings, 500)
		r.mustClear(t, second, open)
		r.clear(t, r.users.bookkeeper, second, open, nil).requireStatus(t, http.StatusBadRequest)
		if n := countOf(t, r.app, rtCleared, dbx.HashExp{"line": open.Id}); n != 1 {
			t.Errorf("%d cleared rows of one line, want 1", n)
		}
	})
}

// The line field is text, not a relation (a relation adds a cascade lookup to
// every journal line delete), so the clear hook refuses an id of no line.
func TestReconcile_ClearRefusesAMissingLine(t *testing.T) {
	r := newRtEnv(t)
	id := r.mustStart(t, r.savings, "2026-09-30", 1000)
	body := rtJSON(t, map[string]any{"reconciliation": id, "line": "zzzzzzzzzzzzzzz"})
	r.send(t, r.users.bookkeeper, http.MethodPost, collectionURL(rtCleared), body).
		requireRefusal(t, "This transaction no longer exists.")
	if n := rtClearedCount(t, r.app, id); n != 0 {
		t.Errorf("%d cleared rows of a missing line, want 0", n)
	}
}

func TestReconcile_Unclear(t *testing.T) {
	t.Run("under a finished reconciliation, refused", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-08-20", r.savings, 1000)
		id := r.mustStart(t, r.savings, "2026-08-31", 1000)
		cleared := r.mustClear(t, id, line)
		r.mustFinish(t, id)
		for _, user := range []*core.Record{r.users.bookkeeper, r.users.admin} {
			requireRefusedWrite(t, r.unclear(t, user, cleared))
		}
		reload(t, r.app, rtCleared, cleared)
	})

	t.Run("under one in progress, deleted", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-20", r.savings, 1000)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		cleared := r.mustClear(t, id, line)
		r.unclear(t, r.users.bookkeeper, cleared).requireStatus(t, http.StatusNoContent)
		if n := rtClearedCount(t, r.app, id); n != 0 {
			t.Errorf("%d cleared rows after the unclear, want 0", n)
		}
	})
}

func TestReconcile_UnreconcileEntry(t *testing.T) {
	t.Run("a void of a journal entry cleared in progress deletes the cleared row", func(t *testing.T) {
		r := newRtEnv(t)
		entry, line := r.deposit(t, "2026-09-20", r.savings, 1000)
		_, other := r.deposit(t, "2026-09-21", r.savings, 2000)
		id := r.mustStart(t, r.savings, "2026-09-30", 3000)
		cleared := r.mustClear(t, id, line)
		kept := r.mustClear(t, id, other)

		voidEntryAs(t, r.app, entry.Id, r.users.bookkeeper.Id)

		if _, err := r.app.FindRecordById(rtCleared, cleared); err == nil {
			t.Error("the void entry's cleared row is still there")
		}
		reload(t, r.app, rtCleared, kept)
		if got := reload(t, r.app, "books_journal_entries", entry.Id).GetString("status"); got != statusVoid {
			t.Errorf("entry status = %q, want void", got)
		}
	})

	t.Run("a void of a reconciled journal entry is refused and the entry stays posted", func(t *testing.T) {
		r := newRtEnv(t)
		entry, line := r.deposit(t, "2026-08-20", r.savings, 1000)
		r.finished(t, r.savings, "2026-08-31", 1000, line)

		err := setStatus(r.app, entry.Id, statusVoid, r.users.bookkeeper.Id)

		want := nameOf(t, r.app, entry.Id) +
			" is reconciled on 1010 Business Savings (statement of Aug 31, 2026). It cannot be voided or changed."
		if got := apiErrorOf(t, err).Message; got != want {
			t.Errorf("refusal = %q, want %q", got, want)
		}
		if got := reload(t, r.app, "books_journal_entries", entry.Id).GetString("status"); got != statusPosted {
			t.Errorf("entry status = %q after a refused void, want posted", got)
		}
		if n := countOf(t, r.app, "books_journal_entries", dbx.HashExp{"reverses": entry.Id}); n != 0 {
			t.Errorf("%d reversals of a refused void, want 0", n)
		}
	})

	t.Run("a void of a reconciled expense through its document is refused the same way", func(t *testing.T) {
		m, bp := newBankMatchDocsEnv(t)
		registerReconcile(m.app)
		r := &rtEnv{bankMatchEnv: m}
		exp := bp.mkExpense(t, map[string]any{"vendor": bp.summit.Id})
		mkExpenseLine(t, m.app, exp, 0, accountLine(bp.software, 13837))
		posted := mustPostExpense(t, m.app, exp.Id, m.users.bookkeeper.Id)
		entryID := posted.GetString("entry")
		line := lineOn(t, m.app, entryID, m.checking)
		r.finished(t, m.checking, "2026-11-30", -13837, line)

		err := voidExpenseAs(m.app, exp.Id, m.users.bookkeeper.Id)

		want := nameOf(t, m.app, entryID) +
			" is reconciled on 1000 Business Checking (statement of Nov 30, 2026). It cannot be voided or changed."
		if got := apiErrorOf(t, err).Message; got != want {
			t.Errorf("refusal = %q, want %q", got, want)
		}
		if got := reload(t, m.app, "books_expenses", exp.Id).GetString("status"); got != statusPosted {
			t.Errorf("expense status = %q after a refused void, want posted", got)
		}
		if got := reload(t, m.app, "books_journal_entries", entryID).GetString("status"); got != statusPosted {
			t.Errorf("entry status = %q after a refused void, want posted", got)
		}
	})

	t.Run("isLineReconciled is true only for the reconciled line", func(t *testing.T) {
		r := newRtEnv(t)
		_, reconciled := r.deposit(t, "2026-08-20", r.savings, 1000)
		r.finished(t, r.savings, "2026-08-31", 1000, reconciled)
		_, cleared := r.deposit(t, "2026-09-05", r.savings, 2000)
		_, open := r.deposit(t, "2026-09-06", r.savings, 3000)
		id := r.mustStart(t, r.savings, "2026-09-30", 3000)
		r.mustClear(t, id, cleared)
		for _, c := range []struct {
			name string
			line *core.Record
			want bool
		}{{"reconciled", reconciled, true}, {"cleared in progress", cleared, false}, {"not cleared", open, false}} {
			got, err := isLineReconciled(r.app, c.line.Id)
			if err != nil {
				t.Fatalf("isLineReconciled(%s): %v", c.name, err)
			}
			if got != c.want {
				t.Errorf("isLineReconciled(%s) = %v, want %v", c.name, got, c.want)
			}
		}
	})

	t.Run("unreconcileEntry deletes the cleared rows of an entry in progress", func(t *testing.T) {
		r := newRtEnv(t)
		entry, line := r.deposit(t, "2026-09-20", r.savings, 1000)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		r.mustClear(t, id, line)
		if err := r.app.RunInTransaction(func(tx core.App) error { return unreconcileEntry(tx, entry.Id) }); err != nil {
			t.Fatalf("unreconcileEntry: %v", err)
		}
		if n := rtClearedCount(t, r.app, id); n != 0 {
			t.Errorf("%d cleared rows after unreconcileEntry, want 0", n)
		}
	})
}

func TestReconcile_LateEntry(t *testing.T) {
	r := newRtEnv(t)
	_, line := r.deposit(t, "2026-08-10", r.savings, 1000)
	id := r.finished(t, r.savings, "2026-08-31", 1000, line)
	before := reload(t, r.app, rtRecons, id)

	late, lateLine := r.deposit(t, "2026-08-20", r.savings, 700)

	if got := reload(t, r.app, "books_journal_entries", late.Id).GetString("status"); got != statusPosted {
		t.Fatalf("the late entry is %q, want posted", got)
	}
	after := reload(t, r.app, rtRecons, id)
	for _, f := range []string{
		"status", "statement_date", "statement_balance", "beginning_balance", "cleared_out", "cleared_in",
		"cleared_out_count", "cleared_in_count", "finished_by", "finished_at", "updated",
	} {
		if before.GetString(f) != after.GetString(f) {
			t.Errorf("finished %s = %q after a late entry, want %q", f, after.GetString(f), before.GetString(f))
		}
	}
	row, err := r.app.FindRecordById(rtView, lateLine.Id)
	if err != nil {
		t.Fatalf("the late line is not a row of %s: %v", rtView, err)
	}
	if row.GetString("reconciliation") != "" {
		t.Errorf("the late line's reconciliation = %q, want ''", row.GetString("reconciliation"))
	}
}

func TestReconcile_AccountGuards(t *testing.T) {
	// reserve has no journal line and no bank connection, so only a
	// reconciliation can hold its type and its delete.
	reserve := func(t *testing.T, r *rtEnv) *core.Record {
		t.Helper()
		return mkNumberedAccount(t, r.app, "Reserve Savings", "1020", "bank", "savings")
	}
	const inProgress = "1020 Reserve Savings has a reconciliation. Discard it first."
	const done = "1020 Reserve Savings has reconciled statements."
	cases := []struct {
		name     string
		finished bool
		want     string
	}{{"in progress", false, inProgress}, {"finished", true, done}}
	for _, c := range cases {
		t.Run("a delete is refused, "+c.name, func(t *testing.T) {
			r := newRtEnv(t)
			acct := reserve(t, r)
			id := r.mustStart(t, acct, "2026-09-30", 0)
			if c.finished {
				r.mustFinish(t, id)
			}
			err := r.app.Delete(reload(t, r.app, "books_accounts", acct.Id))
			if got := apiErrorOf(t, err).Message; got != c.want {
				t.Errorf("delete refusal = %q, want %q", got, c.want)
			}
			reload(t, r.app, "books_accounts", acct.Id)
		})
		for _, to := range []string{"expense", "credit_card"} {
			t.Run("a type change to "+to+" is refused, "+c.name, func(t *testing.T) {
				r := newRtEnv(t)
				acct := reserve(t, r)
				id := r.mustStart(t, acct, "2026-09-30", 0)
				if c.finished {
					r.mustFinish(t, id)
				}
				detail := map[string]string{"expense": "rent_lease", "credit_card": "credit_card"}[to]
				err := setFields(t, r.app, "books_accounts", acct.Id, map[string]any{"type": to, "detail_type": detail})
				if got := apiErrorOf(t, err).Message; got != c.want {
					t.Errorf("type change refusal = %q, want %q", got, c.want)
				}
				if got := reload(t, r.app, "books_accounts", acct.Id).GetString("type"); got != "bank" {
					t.Errorf("type = %q after a refused change, want bank", got)
				}
			})
		}
		t.Run("a rename is accepted, "+c.name, func(t *testing.T) {
			r := newRtEnv(t)
			acct := reserve(t, r)
			id := r.mustStart(t, acct, "2026-09-30", 0)
			if c.finished {
				r.mustFinish(t, id)
			}
			if err := setFields(t, r.app, "books_accounts", acct.Id, map[string]any{"name": "Rainy Day Savings"}); err != nil {
				t.Fatalf("rename: %v", err)
			}
		})
	}
}

// rtTotalsCase and rtDatesCase are the rows of testdata/reconcile_cases.json,
// the table the client's lib/reconcile.ts test runs too.
type rtTotalsCase struct {
	Name        string `json:"name"`
	AccountType string `json:"accountType"`
	Beginning   int64  `json:"beginning"`
	Statement   int64  `json:"statement"`
	Lines       []struct {
		Debit  int64 `json:"debit"`
		Credit int64 `json:"credit"`
	} `json:"lines"`
	ClearedOut     int64 `json:"clearedOut"`
	ClearedIn      int64 `json:"clearedIn"`
	OutCount       int64 `json:"outCount"`
	InCount        int64 `json:"inCount"`
	ClearedBalance int64 `json:"clearedBalance"`
	Difference     int64 `json:"difference"`
}

type rtDatesCase struct {
	Name     string `json:"name"`
	LastDate string `json:"lastDate"`
	Date     string `json:"date"`
	OK       bool   `json:"ok"`
}

func loadReconcileCases(t testing.TB) ([]rtTotalsCase, []rtDatesCase) {
	t.Helper()
	raw, err := os.ReadFile("testdata/reconcile_cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases struct {
		Totals []rtTotalsCase `json:"totals"`
		Dates  []rtDatesCase  `json:"dates"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases.Totals) == 0 || len(cases.Dates) == 0 {
		t.Fatalf("testdata/reconcile_cases.json has %d totals and %d dates cases, want some of each",
			len(cases.Totals), len(cases.Dates))
	}
	return cases.Totals, cases.Dates
}

func TestReconcile_SharedTotalsCases(t *testing.T) {
	totals, _ := loadReconcileCases(t)
	for _, c := range totals {
		t.Run(c.Name, func(t *testing.T) {
			lines := make([]reconcileAmount, 0, len(c.Lines))
			for _, l := range c.Lines {
				lines = append(lines, reconcileAmount{debit: l.Debit, credit: l.Credit})
			}
			got := reconcileSums(c.AccountType, c.Beginning, c.Statement, lines)
			check := []struct {
				name      string
				got, want int64
			}{
				{"clearedOut", int64(got.clearedOut), c.ClearedOut},
				{"clearedIn", int64(got.clearedIn), c.ClearedIn},
				{"outCount", int64(got.outCount), c.OutCount},
				{"inCount", int64(got.inCount), c.InCount},
				{"clearedBalance", int64(got.clearedBalance), c.ClearedBalance},
				{"difference", int64(got.difference), c.Difference},
			}
			for _, k := range check {
				if k.got != k.want {
					t.Errorf("%s = %d, want %d", k.name, k.got, k.want)
				}
			}
		})
	}
}

func TestReconcile_SharedDatesCases(t *testing.T) {
	_, dates := loadReconcileCases(t)
	for _, c := range dates {
		t.Run(c.Name, func(t *testing.T) {
			r := newRtEnv(t)
			if c.LastDate != "" {
				r.finished(t, r.savings, c.LastDate, 0)
			}
			a := r.start(t, r.users.bookkeeper, r.savings, c.Date, 0, nil)
			if c.OK {
				a.requireStatus(t, http.StatusOK)
				return
			}
			requireKeyedRefusal(t, a, "statement_date")
		})
	}
}

func TestReconcile_Audit(t *testing.T) {
	r := newRtEnv(t)
	registerAudit(&pocketbase.PocketBase{App: r.app})
	config, ok := auditedCollections(r.app)[rtRecons]
	if !ok {
		t.Fatal("books_reconciliations is not audited")
	}
	if _, ok := auditedCollections(r.app)[rtCleared]; ok {
		t.Error("books_reconciliation_lines is audited; a press writes no audit row")
	}
	found := false
	for _, o := range auditRecordTypeOptions() {
		found = found || (o.Value == rtRecons && o.Label == "Reconciliation")
	}
	if !found {
		t.Error("the Record type options have no Reconciliation")
	}

	_, line := r.deposit(t, "2026-08-20", r.savings, 1000)
	id := r.mustStart(t, r.savings, "2026-08-31", 900)
	const label = "1010 Business Savings 2026-08-31"
	if got := config.ExtractLabel(reload(t, r.app, rtRecons, id)); got != label {
		t.Errorf("reconciliation label = %q, want %q", got, label)
	}
	created := awaitAuditRow(t, r.app, rtRecons, "created", id)
	if got := created.GetString("resource_label"); got != label {
		t.Errorf("created audit row label = %q, want %q", got, label)
	}
	r.update(t, r.users.bookkeeper, id, map[string]any{"statement_balance": 1000}).requireStatus(t, http.StatusOK)
	cleared := r.mustClear(t, id, line)
	r.mustFinish(t, id)

	discarded := r.mustStart(t, r.savings, "2026-09-30", 1000)
	r.discard(t, r.users.bookkeeper, discarded).requireStatus(t, http.StatusNoContent)
	awaitAuditRow(t, r.app, rtRecons, "deleted", discarded)

	counts := []struct {
		id, action string
		want       int64
	}{
		{id, "created", 1},
		{id, "updated", 2},
		{discarded, "created", 1},
		{discarded, "deleted", 1},
	}
	for _, c := range counts {
		n := countOf(t, r.app, "audit_logs", dbx.HashExp{"resource_type": rtRecons, "action": c.action, "resource_id": c.id})
		if n != c.want {
			t.Errorf("%d %s audit rows of %s, want %d", n, c.action, c.id, c.want)
		}
	}
	if n := countOf(t, r.app, "audit_logs", dbx.HashExp{"resource_type": rtCleared}); n != 0 {
		t.Errorf("%d audit rows of cleared rows (one was %s), want 0", n, cleared)
	}
}
