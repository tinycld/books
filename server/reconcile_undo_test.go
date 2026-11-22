package books

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

// Reconciliation report spec §3 "Undo" and §4 Schema and Server, with settled
// difference 12 of the plan: the finish stamps the finisher's name; a Books
// admin returns the latest finished reconciliation of an account to In
// progress with one update ({status: "in_progress"}). The rule lets a writer's
// undo reach the update request hook, which refuses a user who is not a Books
// admin, so a bookkeeper reads the hook's text and not the rule's 404.

// undo sends the one update an undo is, as user.
func (r *rtEnv) undo(t testing.TB, user *core.Record, id string) apiAnswer {
	t.Helper()
	return r.update(t, user, id, map[string]any{"status": "in_progress"})
}

// rtPair finishes two statements on 1010 Business Savings: Aug 31, 2026 over a
// deposit of $10.00, then Sep 30, 2026 over a deposit of $5.00 and a payment of
// $2.00 (beginning $10.00, ending $13.00). It returns the earlier and the
// latest reconciliation's ids.
func (r *rtEnv) rtPair(t testing.TB) (earlier, latest string) {
	t.Helper()
	_, first := r.deposit(t, "2026-08-10", r.savings, 1000)
	earlier = r.finished(t, r.savings, "2026-08-31", 1000, first)
	_, in := r.deposit(t, "2026-09-10", r.savings, 500)
	_, out := r.payment(t, "2026-09-12", r.savings, 200)
	latest = r.finished(t, r.savings, "2026-09-30", 1300, in, out)
	return earlier, latest
}

func requireReconStatus(t testing.TB, app core.App, id, want string) {
	t.Helper()
	if got := reload(t, app, rtRecons, id).GetString("status"); got != want {
		t.Errorf("status of %s = %q, want %q", id, got, want)
	}
}

// rtUndoValue is a value a client could send for a field of a finished
// reconciliation that differs from the stored one.
func rtUndoValue(r *rtEnv, field string) any {
	switch field {
	case "account":
		return r.card.Id
	case "statement_date":
		return "2026-10-31"
	case "has_statement_totals":
		return true
	case "created_by", "finished_by":
		return r.users.admin.Id
	case "finished_by_name":
		return "Someone Else"
	case "finished_at":
		return "2026-10-01 12:00:00.000Z"
	case "currency":
		return "EUR"
	default:
		return 7
	}
}

func TestReconcileFinish_StampsName(t *testing.T) {
	t.Run("a bookkeeper's finish stamps the bookkeeper's name", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		id := r.finished(t, r.savings, "2026-09-30", 1000, line)
		want := r.users.bookkeeper.GetString("name")
		if want == "" {
			t.Fatal("the bookkeeper has no name")
		}
		if got := reload(t, r.app, rtRecons, id).GetString("finished_by_name"); got != want {
			t.Errorf("finished_by_name = %q, want the finisher's name %q", got, want)
		}
	})

	t.Run("an update that sends finished_by_name is refused, in progress and finished", func(t *testing.T) {
		r := newRtEnv(t)
		open := r.mustStart(t, r.card, "2026-09-30", 0)
		requireRefusedWrite(t, r.update(t, r.users.bookkeeper, open, map[string]any{"finished_by_name": "Mallory"}))
		if got := reload(t, r.app, rtRecons, open).GetString("finished_by_name"); got != "" {
			t.Errorf("finished_by_name = %q after a refused update in progress, want ''", got)
		}
		_, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		id := r.finished(t, r.savings, "2026-09-30", 1000, line)
		name := reload(t, r.app, rtRecons, id).GetString("finished_by_name")
		requireRefusedWrite(t, r.update(t, r.users.bookkeeper, id, map[string]any{"finished_by_name": "Mallory"}))
		requireRefusedWrite(t, r.update(t, r.users.admin, id, map[string]any{"finished_by_name": "Mallory"}))
		if got := reload(t, r.app, rtRecons, id).GetString("finished_by_name"); got != name || got == "" {
			t.Errorf("finished_by_name = %q after refused updates, want the stamped %q", got, name)
		}
	})

	t.Run("after the finisher's user record is deleted, finished_by is empty and the name stays", func(t *testing.T) {
		r := newRtEnv(t)
		ana := mkUser(t, r.app, "member")
		ana.Set("name", "Ana Ruiz")
		if err := r.app.Save(ana); err != nil {
			t.Fatalf("name the user: %v", err)
		}
		setPkgAccess(t, r.app, ana, "full")
		_, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		started := r.start(t, ana, r.savings, "2026-09-30", 1000, nil)
		started.requireStatus(t, http.StatusOK)
		id := started.id(t)
		r.clear(t, ana, id, line, nil).requireStatus(t, http.StatusOK)
		r.finish(t, ana, id).requireStatus(t, http.StatusOK)
		before := reload(t, r.app, rtRecons, id)
		if before.GetString("finished_by") != ana.Id || before.GetString("finished_by_name") != "Ana Ruiz" {
			t.Errorf("after the finish: finished_by %q, finished_by_name %q; want %q and %q",
				before.GetString("finished_by"), before.GetString("finished_by_name"), ana.Id, "Ana Ruiz")
		}

		if err := r.app.Delete(reload(t, r.app, "users", ana.Id)); err != nil {
			t.Fatalf("delete the finisher: %v", err)
		}

		after := reload(t, r.app, rtRecons, id)
		if got := after.GetString("finished_by"); got != "" {
			t.Errorf("finished_by = %q after the user's delete, want ''", got)
		}
		if got := after.GetString("finished_by_name"); got != "Ana Ruiz" {
			t.Errorf("finished_by_name = %q after the user's delete, want %q", got, "Ana Ruiz")
		}
		if got := after.GetString("status"); got != reconcileFinished {
			t.Errorf("status = %q after the user's delete, want finished", got)
		}
	})

	t.Run("a superuser's finish keeps the finished_by_name it sends", func(t *testing.T) {
		r := newRtEnv(t)
		_, line := r.deposit(t, "2026-09-05", r.savings, 1000)
		id := r.mustStart(t, r.savings, "2026-09-30", 1000)
		r.mustClear(t, id, line)
		r.update(t, mkSuperuser(t, r.app), id, map[string]any{
			"status": "finished", "finished_by": r.users.bookkeeper.Id, "finished_by_name": "Seed",
		}).requireStatus(t, http.StatusOK)
		stored := reload(t, r.app, rtRecons, id)
		if stored.GetString("status") != reconcileFinished || stored.GetString("finished_by_name") != "Seed" {
			t.Errorf("status %q, finished_by_name %q; want finished and %q",
				stored.GetString("status"), stored.GetString("finished_by_name"), "Seed")
		}
	})
}

// users.name allows 255 characters and finished_by_name 200: a finisher with a
// longer name still finishes, and the stamp is the first 200 runes of the name.
func TestReconcileFinish_StampsLongName(t *testing.T) {
	r := newRtEnv(t)
	long := mkUser(t, r.app, "member")
	name := strings.Repeat("é", 150) + strings.Repeat("a", 105)
	long.Set("name", name)
	if err := r.app.Save(long); err != nil {
		t.Fatalf("give the user a 255-character name: %v", err)
	}
	setPkgAccess(t, r.app, long, "full")
	_, line := r.deposit(t, "2026-09-05", r.savings, 1000)
	started := r.start(t, long, r.savings, "2026-09-30", 1000, nil)
	started.requireStatus(t, http.StatusOK)
	id := started.id(t)
	r.clear(t, long, id, line, nil).requireStatus(t, http.StatusOK)

	r.finish(t, long, id).requireStatus(t, http.StatusOK)

	stored := reload(t, r.app, rtRecons, id)
	if got := stored.GetString("status"); got != reconcileFinished {
		t.Errorf("status = %q after the finish, want finished", got)
	}
	want := strings.Repeat("é", 150) + strings.Repeat("a", 50)
	if got := stored.GetString("finished_by_name"); got != want {
		t.Errorf("finished_by_name = %q (%d runes), want the first 200 runes of the name %q",
			got, len([]rune(got)), want)
	}
}

func TestReconcileUndo_Rule(t *testing.T) {
	t.Run("an admin's undo of the latest finished reconciliation passes", func(t *testing.T) {
		r := newRtEnv(t)
		_, latest := r.rtPair(t)
		r.undo(t, r.users.admin, latest).requireStatus(t, http.StatusOK)
		requireReconStatus(t, r.app, latest, reconcileInProgress)
	})

	t.Run("a bookkeeper's undo is refused with the admin text, and the row stays finished", func(t *testing.T) {
		r := newRtEnv(t)
		_, latest := r.rtPair(t)
		const want = "Only a Books admin can undo a reconciliation."
		if got := msgUndoNotAdmin + "."; got != want {
			t.Errorf("msgUndoNotAdmin = %q, want %q without its final period", msgUndoNotAdmin, want)
		}
		r.undo(t, r.users.bookkeeper, latest).requireRefusal(t, want)
		requireReconStatus(t, r.app, latest, reconcileFinished)
	})

	t.Run("a reader's undo is refused by the rule", func(t *testing.T) {
		r := newRtEnv(t)
		_, latest := r.rtPair(t)
		r.undo(t, r.users.readOnly, latest).requireStatus(t, http.StatusNotFound)
		requireReconStatus(t, r.app, latest, reconcileFinished)
	})

	t.Run("an admin's undo that also sends statement_balance is refused", func(t *testing.T) {
		r := newRtEnv(t)
		_, latest := r.rtPair(t)
		requireRefusedWrite(t, r.update(t, r.users.admin, latest,
			map[string]any{"status": "in_progress", "statement_balance": 9999}))
		stored := reload(t, r.app, rtRecons, latest)
		if stored.GetString("status") != reconcileFinished || stored.GetInt("statement_balance") != 1300 {
			t.Errorf("status %q, statement_balance %d after a refused undo, want finished and 1300",
				stored.GetString("status"), stored.GetInt("statement_balance"))
		}
	})

	col, err := newBooksApp(t).FindCollectionByNameOrId(rtRecons)
	if err != nil {
		t.Fatalf("find %s: %v", rtRecons, err)
	}
	var others []string
	for _, f := range col.Fields {
		switch f.GetName() {
		case "status", "id", "created", "updated":
		default:
			others = append(others, f.GetName())
		}
	}
	found := false
	for _, f := range others {
		found = found || f == "finished_by_name"
	}
	if !found {
		t.Errorf("%s has no finished_by_name field; its fields: %v", rtRecons, others)
	}
	for _, field := range others {
		t.Run("an admin's undo that also sends "+field+" is refused", func(t *testing.T) {
			r := newRtEnv(t)
			_, latest := r.rtPair(t)
			before := reload(t, r.app, rtRecons, latest).GetString(field)
			requireRefusedWrite(t, r.update(t, r.users.admin, latest,
				map[string]any{"status": "in_progress", field: rtUndoValue(r, field)}))
			stored := reload(t, r.app, rtRecons, latest)
			if stored.GetString("status") != reconcileFinished {
				t.Errorf("status = %q after an undo that sent %s, want finished", stored.GetString("status"), field)
			}
			if got := stored.GetString(field); got != before {
				t.Errorf("%s = %q after a refused undo, want %q", field, got, before)
			}
		})
	}
}

func TestReconcileUndo_Stamps(t *testing.T) {
	r := newRtEnv(t)
	_, latest := r.rtPair(t)
	before := reload(t, r.app, rtRecons, latest)
	rows, err := r.app.FindAllRecords(rtCleared, dbx.HashExp{"reconciliation": latest})
	if err != nil || len(rows) != 2 {
		t.Fatalf("the latest reconciliation's cleared rows = %d (%v), want 2", len(rows), err)
	}

	r.undo(t, r.users.admin, latest).requireStatus(t, http.StatusOK)

	stored := reload(t, r.app, rtRecons, latest)
	if got := stored.GetString("status"); got != reconcileInProgress {
		t.Errorf("status = %q after the undo, want in_progress", got)
	}
	for _, f := range []string{"cleared_out", "cleared_in", "cleared_out_count", "cleared_in_count"} {
		if got := stored.GetInt(f); got != 0 {
			t.Errorf("%s = %d after the undo, want 0", f, got)
		}
	}
	if !stored.GetDateTime("finished_at").IsZero() {
		t.Errorf("finished_at = %v after the undo, want empty", stored.GetDateTime("finished_at"))
	}
	for _, f := range []string{"finished_by", "finished_by_name"} {
		if got := stored.GetString(f); got != "" {
			t.Errorf("%s = %q after the undo, want ''", f, got)
		}
	}
	for _, f := range []string{"beginning_balance", "statement_date", "statement_balance", "account", "currency"} {
		if got, want := stored.GetString(f), before.GetString(f); got != want {
			t.Errorf("%s = %q after the undo, want it unchanged at %q", f, got, want)
		}
	}
	if n := rtClearedCount(t, r.app, latest); n != 2 {
		t.Errorf("%d cleared rows after the undo, want the 2 it had", n)
	}
	for _, row := range rows {
		if reload(t, r.app, rtCleared, row.Id).GetBool("finished") {
			t.Errorf("cleared row %s is still finished after the undo", row.Id)
		}
	}
}

func TestReconcileUndo_NotLatest(t *testing.T) {
	r := newRtEnv(t)
	earlier, latest := r.rtPair(t)
	const want = "Only the latest reconciliation of 1010 Business Savings can be undone. Undo the statement of Sep 30, 2026 first."
	if got := fmt.Sprintf(msgUndoNotLatest, "1010 Business Savings", "Sep 30, 2026") + "."; got != want {
		t.Errorf("msgUndoNotLatest gives %q, want %q without its final period", got, want)
	}

	r.undo(t, r.users.admin, earlier).requireRefusal(t, want)

	requireReconStatus(t, r.app, earlier, reconcileFinished)
	requireReconStatus(t, r.app, latest, reconcileFinished)
	if n := countOf(t, r.app, rtCleared, dbx.HashExp{"reconciliation": earlier, "finished": true}); n != 1 {
		t.Errorf("%d finished cleared rows of the earlier reconciliation after the refused undo, want 1", n)
	}
}

func TestReconcileUndo_InProgress(t *testing.T) {
	r := newRtEnv(t)
	_, line := r.deposit(t, "2026-08-10", r.savings, 1000)
	latest := r.finished(t, r.savings, "2026-08-31", 1000, line)
	open := r.mustStart(t, r.savings, "2026-09-30", 1000)

	r.undo(t, r.users.admin, latest).requireRefusal(t, fmt.Sprintf(msgReconcileInProgress, "1010 Business Savings"))

	requireReconStatus(t, r.app, latest, reconcileFinished)
	requireReconStatus(t, r.app, open, reconcileInProgress)
}

func TestReconcileUndo_TwoAtOnce(t *testing.T) {
	r := newRtEnv(t)
	earlier, latest := r.rtPair(t)
	ids := []string{latest, earlier}
	answers := make([]apiAnswer, len(ids))
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i, id := range ids {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			answers[i] = r.undo(t, r.users.admin, id)
		}()
	}
	close(start)
	wg.Wait()

	passed := 0
	for i, a := range answers {
		if a.status == http.StatusOK {
			passed++
		} else if a.status < 400 || a.status >= 500 {
			t.Errorf("undo of %s = %d, want 200 or a refusal; body: %s", ids[i], a.status, a.body)
		}
	}
	if passed > 1 {
		t.Errorf("%d undos passed, want at most one", passed)
	}
	if answers[0].status != http.StatusOK {
		t.Errorf("the undo of the latest = %d, want 200 (the earlier one is never the latest while it is finished); body: %s",
			answers[0].status, answers[0].body)
	}
	open := countOf(t, r.app, rtRecons, dbx.HashExp{"account": r.savings.Id, "status": reconcileInProgress})
	if open > 1 {
		t.Errorf("%d reconciliations in progress on the account after both undos, want at most 1", open)
	}
	requireReconStatus(t, r.app, earlier, reconcileFinished)
}

// Two undos of the same latest reconciliation, sent together: both requests
// load the row finished; the second saves after the first committed. Exactly
// one passes, and the row stays as that undo left it.
func TestReconcileUndo_TwoOfOne(t *testing.T) {
	r := newRtEnv(t)
	registerAudit(&pocketbase.PocketBase{App: r.app})
	_, latest := r.rtPair(t)
	awaitAuditRow(t, r.app, rtRecons, "updated", latest)

	// Each request waits here, after it loaded the row and before any hook of
	// Books, until the other one has loaded it too.
	var loaded sync.WaitGroup
	loaded.Add(2)
	r.app.OnRecordUpdateRequest(rtRecons).Bind(&hook.Handler[*core.RecordRequestEvent]{
		Priority: -1,
		Func: func(e *core.RecordRequestEvent) error {
			loaded.Done()
			both := make(chan struct{})
			go func() { loaded.Wait(); close(both) }()
			select {
			case <-both:
			case <-time.After(5 * time.Second):
				return errors.New("the other undo did not load the row within 5s")
			}
			return e.Next()
		},
	})

	answers := make([]apiAnswer, 2)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := range answers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			answers[i] = r.undo(t, r.users.admin, latest)
		}()
	}
	close(start)
	wg.Wait()

	passed := 0
	for i, a := range answers {
		if a.status == http.StatusOK {
			passed++
		} else if a.status < 400 || a.status >= 500 {
			t.Errorf("undo %d = %d, want 200 or a refusal; body: %s", i, a.status, a.body)
		}
	}
	if passed != 1 {
		t.Errorf("%d undos of one reconciliation passed, want exactly one; answers: %d %s / %d %s",
			passed, answers[0].status, answers[0].body, answers[1].status, answers[1].body)
	}

	stored := reload(t, r.app, rtRecons, latest)
	if got := stored.GetString("status"); got != reconcileInProgress {
		t.Errorf("status = %q after both undos, want in_progress", got)
	}
	for _, f := range []string{"cleared_out", "cleared_in", "cleared_out_count", "cleared_in_count"} {
		if got := stored.GetInt(f); got != 0 {
			t.Errorf("%s = %d after both undos, want 0", f, got)
		}
	}
	if !stored.GetDateTime("finished_at").IsZero() {
		t.Errorf("finished_at = %v after both undos, want empty", stored.GetDateTime("finished_at"))
	}
	for _, f := range []string{"finished_by", "finished_by_name"} {
		if got := stored.GetString(f); got != "" {
			t.Errorf("%s = %q after both undos, want ''", f, got)
		}
	}

	// The finish wrote one updated row; each update that passed writes one more.
	var updated []*core.Record
	waitFor(t, func() bool {
		updated = auditRowsOf(t, r.app, latest, "updated")
		return len(updated) >= 1+passed
	})
	if undos := undoAuditRows(t, r.app, latest); len(undos) != 1 {
		t.Errorf("%d audit rows with status finished → in_progress, want 1", len(undos))
	}
}

func TestReconcileUndo_VoidThenFinish(t *testing.T) {
	r := newRtEnv(t)
	_, kept := r.deposit(t, "2026-09-05", r.savings, 1000)
	voided, voidedLine := r.deposit(t, "2026-09-10", r.savings, 500)
	id := r.finished(t, r.savings, "2026-09-30", 1500, kept, voidedLine)
	r.undo(t, r.users.admin, id).requireStatus(t, http.StatusOK)

	voidEntryAs(t, r.app, voided.Id, r.users.bookkeeper.Id)

	if n := countOf(t, r.app, rtCleared, dbx.HashExp{"line": voidedLine.Id}); n != 0 {
		t.Errorf("%d cleared rows of the voided line, want 0", n)
	}
	r.update(t, r.users.bookkeeper, id, map[string]any{"statement_balance": 1000}).requireStatus(t, http.StatusOK)
	r.mustFinish(t, id)

	stored := reload(t, r.app, rtRecons, id)
	want := map[string]int{"cleared_in": 1000, "cleared_in_count": 1, "cleared_out": 0, "cleared_out_count": 0}
	for f, v := range want {
		if got := stored.GetInt(f); got != v {
			t.Errorf("%s = %d after the second finish, want %d", f, got, v)
		}
	}
	if stored.GetString("status") != reconcileFinished {
		t.Errorf("status = %q after the second finish, want finished", stored.GetString("status"))
	}
	if stored.GetDateTime("finished_at").IsZero() {
		t.Error("finished_at is empty after the second finish")
	}
	if got := stored.GetString("finished_by"); got != r.users.bookkeeper.Id {
		t.Errorf("finished_by = %q after the second finish, want the bookkeeper", got)
	}
	if got, want := stored.GetString("finished_by_name"), r.users.bookkeeper.GetString("name"); got != want {
		t.Errorf("finished_by_name = %q after the second finish, want %q", got, want)
	}
	rows, err := r.app.FindAllRecords(rtCleared, dbx.HashExp{"reconciliation": id})
	if err != nil || len(rows) != 1 {
		t.Fatalf("cleared rows after the second finish = %d (%v), want 1", len(rows), err)
	}
	if rows[0].GetString("line") != kept.Id || !rows[0].GetBool("finished") {
		t.Errorf("the row left = line %q, finished %v; want the kept line, finished", rows[0].GetString("line"), rows[0].GetBool("finished"))
	}
}

func TestReconcileUndo_GoCaller(t *testing.T) {
	t.Run("a save from Go with no request passes the admin check", func(t *testing.T) {
		r := newRtEnv(t)
		_, latest := r.rtPair(t)
		rec := reload(t, r.app, rtRecons, latest)
		rec.Set("status", reconcileInProgress)
		if err := r.app.Save(rec); err != nil {
			t.Fatalf("a Go undo: %v", err)
		}
		stored := reload(t, r.app, rtRecons, latest)
		if stored.GetString("status") != reconcileInProgress || stored.GetInt("cleared_in") != 0 {
			t.Errorf("after a Go undo: status %q, cleared_in %d; want in_progress and 0",
				stored.GetString("status"), stored.GetInt("cleared_in"))
		}
	})

	t.Run("a superuser's request passes the admin check", func(t *testing.T) {
		r := newRtEnv(t)
		_, latest := r.rtPair(t)
		r.undo(t, mkSuperuser(t, r.app), latest).requireStatus(t, http.StatusOK)
		requireReconStatus(t, r.app, latest, reconcileInProgress)
	})

	t.Run("checkReconcileUndo overwrites a cleared field a Go caller sends and refuses any other change", func(t *testing.T) {
		r := newRtEnv(t)
		_, latest := r.rtPair(t)
		stored := reload(t, r.app, rtRecons, latest)
		next := reload(t, r.app, rtRecons, latest)
		next.Set("status", reconcileInProgress)
		next.Set("cleared_out", 999)
		next.Set("finished_by_name", "Someone Else")
		if err := r.app.RunInTransaction(func(tx core.App) error { return checkReconcileUndo(tx, stored, next) }); err != nil {
			t.Fatalf("checkReconcileUndo: %v", err)
		}
		if next.GetInt("cleared_out") != 0 || next.GetString("finished_by_name") != "" || next.GetString("finished_by") != "" {
			t.Errorf("after checkReconcileUndo: cleared_out %d, finished_by_name %q, finished_by %q; want 0, '' and ''",
				next.GetInt("cleared_out"), next.GetString("finished_by_name"), next.GetString("finished_by"))
		}

		changed := reload(t, r.app, rtRecons, latest)
		changed.Set("status", reconcileInProgress)
		changed.Set("statement_balance", 7)
		err := r.app.RunInTransaction(func(tx core.App) error { return checkReconcileUndo(tx, stored, changed) })
		if got := apiErrorOf(t, err).Message; got != "An undo cannot change the reconciliation." {
			t.Errorf("refusal = %q, want %q", got, "An undo cannot change the reconciliation.")
		}
	})
}

func TestReconcileUndo_Audit(t *testing.T) {
	r := newRtEnv(t)
	registerAudit(&pocketbase.PocketBase{App: r.app})
	_, line := r.deposit(t, "2026-08-20", r.savings, 1000)
	id := r.finished(t, r.savings, "2026-08-31", 1000, line)
	awaitAuditRow(t, r.app, rtRecons, "updated", id)

	r.undo(t, r.users.admin, id).requireStatus(t, http.StatusOK)
	var undos []*core.Record
	waitFor(t, func() bool {
		undos = undoAuditRows(t, r.app, id)
		return len(undos) > 0
	})
	r.mustFinish(t, id)

	var updated []*core.Record
	waitFor(t, func() bool {
		updated = auditRowsOf(t, r.app, id, "updated")
		return len(updated) >= 3
	})
	if len(updated) != 3 {
		t.Errorf("%d updated audit rows of the reconciliation, want 3: the finish, the undo and the second finish", len(updated))
	}
	undos = undoAuditRows(t, r.app, id)
	if len(undos) != 1 {
		t.Fatalf("%d audit rows with status finished → in_progress, want 1", len(undos))
	}
	if got := undos[0].GetString("actor"); got != r.users.admin.Id {
		t.Errorf("the undo's actor = %q, want the admin %q", got, r.users.admin.Id)
	}
}

func auditRowsOf(t testing.TB, app core.App, id, action string) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter("audit_logs",
		"resource_type = {:c} && action = {:a} && resource_id = {:id}", "created", 0, 0,
		dbx.Params{"c": rtRecons, "a": action, "id": id})
	if err != nil {
		t.Fatalf("read the audit rows of %s: %v", id, err)
	}
	return rows
}

// undoAuditRows are the reconciliation's updated audit rows whose changes take
// status from finished to in_progress.
func undoAuditRows(t testing.TB, app core.App, id string) []*core.Record {
	t.Helper()
	var out []*core.Record
	for _, row := range auditRowsOf(t, app, id, "updated") {
		change, _ := auditJSONField(t, row, "changes")["status"].(map[string]any)
		if change["before"] == reconcileFinished && change["after"] == reconcileInProgress {
			out = append(out, row)
		}
	}
	return out
}
