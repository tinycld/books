package books

import (
	"log/slog"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/readonly"
	"tinycld.org/core/readonly/readonlytest"
)

func accrual(t testing.TB, env *ledgerEnv, date, reverseOn string) *core.Record {
	t.Helper()
	e := mkDraft(t, env.app, date, ln{env.rent, 2000, 0}, ln{env.checking, 0, 2000})
	e.Set("auto_reverse_on", reverseOn)
	if err := env.app.Save(e); err != nil {
		t.Fatal(err)
	}
	return mustPost(t, env.app, e.Id, "")
}

func at(day string, hour int) time.Time {
	d, _ := time.Parse(dayLayout, day)
	return d.Add(time.Duration(hour) * time.Hour)
}

func requireSweep(t testing.TB, app core.App, now time.Time, want int) {
	t.Helper()
	if n, err := runAutoReversals(app, now); err != nil || n != want {
		t.Fatalf("sweep at %s posted %d, err %v; want %d", now.Format(time.RFC3339), n, err, want)
	}
}

func TestAutoReverse_PostsOnTheDateOnce(t *testing.T) {
	env := newLedgerEnv(t)
	entry := accrual(t, env, "2026-05-31", "2026-06-01")
	if n, err := runAutoReversals(env.app, at("2026-05-31", 23)); err != nil || n != 0 {
		t.Fatalf("before the date: %d, %v", n, err)
	}
	if n, err := runAutoReversals(env.app, at("2026-06-01", 1)); err != nil || n != 1 {
		t.Fatalf("on the date: %d, %v", n, err)
	}
	rev := findReversal(t, env.app, entry.Id)
	if rev.GetString("origin") != originAutoReversal || rev.GetString("date") != "2026-06-01" || rev.GetString("number") != "2" {
		t.Fatalf("reversal = %v", rev.PublicExport())
	}
	if n, err := runAutoReversals(env.app, at("2026-06-02", 1)); err != nil || n != 0 {
		t.Fatalf("second sweep: %d, %v", n, err)
	}
	requireNoDrift(t, env.app)
}

func TestAutoReverse_SkipsVoidedAndReversed(t *testing.T) {
	env := newLedgerEnv(t)
	voided := accrual(t, env, "2026-05-31", "2026-06-01")
	if err := setStatus(env.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatal(err)
	}
	reversed := accrual(t, env, "2026-05-30", "2026-06-01")
	mustPost(t, env.app, reversalDraft(t, env.app, reversed, "2026-05-31").Id, "")
	if n, err := runAutoReversals(env.app, at("2026-06-01", 1)); err != nil || n != 0 {
		t.Fatalf("sweep posted %d, err %v; want 0", n, err)
	}
}

func TestAutoReverse_ClosedPeriodIsSkippedNotForced(t *testing.T) {
	env := newLedgerEnv(t)
	entry := accrual(t, env, "2026-05-31", "2026-06-01")
	// Bypass the settings guard to stand in for a close date set before the
	// guard existed; the sweep must still not post into a closed period.
	if _, err := env.app.DB().NewQuery("UPDATE books_settings SET close_date = '2026-06-30'").Execute(); err != nil {
		t.Fatal(err)
	}
	if n, err := runAutoReversals(env.app, at("2026-07-01", 1)); err != nil || n != 0 {
		t.Fatalf("sweep posted %d, err %v; want 0", n, err)
	}
	if rev, _ := postedReversalOf(env.app, entry.Id); rev != nil {
		t.Fatal("a reversal was posted into the closed period")
	}
}

func TestCloseDate_RefusedOverAPendingAutoReversal(t *testing.T) {
	env := newLedgerEnv(t)
	accrual(t, env, "2026-05-31", "2026-06-01")
	s := reload(t, env.app, "books_settings", settingsID)
	s.Set("close_date", "2026-06-30")
	requireRefused(t, env.app.Save(s), "reverses automatically on 2026-06-01")
	if _, err := runAutoReversals(env.app, at("2026-06-01", 1)); err != nil {
		t.Fatal(err)
	}
	setCloseDate(t, env.app, "2026-06-30")
}

// The reversal is an ordinary posted entry: the original's document type, a
// new number, mirrored lines, written by nobody, and every month row in step.
func TestAutoReverse_PostsAMirroredEntryUnderANewNumber(t *testing.T) {
	env := newLedgerEnv(t)
	entry := accrual(t, env, "2026-05-31", "2026-06-01")
	requireSweep(t, env.app, at("2026-06-01", 0), 1)
	rev := findReversal(t, env.app, entry.Id)
	if rev.GetString("status") != statusPosted || rev.GetString("doc_type") != entry.GetString("doc_type") ||
		rev.GetString("memo") != "Automatic reversal of 1" || rev.GetString("posted_by") != "" ||
		rev.GetString("created_by") != "" || rev.GetInt("total") != 2000 {
		t.Fatalf("reversal = %v", rev.PublicExport())
	}
	requireNextNumber(t, env.app, 3)
	requireBalance(t, env.app, env.rent, "2026-05", 2000, 0)
	requireBalance(t, env.app, env.checking, "2026-05", 0, 2000)
	requireBalance(t, env.app, env.rent, "2026-06", 0, 2000)
	requireBalance(t, env.app, env.checking, "2026-06", 2000, 0)
	requireRebuildFixesNothing(t, env.app)
}

// A reversal ignores inactive, so retiring an account after the accrual does
// not strand the reversal.
func TestAutoReverse_PostsOverAnInactiveAccount(t *testing.T) {
	env := newLedgerEnv(t)
	entry := accrual(t, env, "2026-05-31", "2026-06-01")
	rent := reload(t, env.app, "books_accounts", env.rent.Id)
	rent.Set("inactive", true)
	if err := env.app.Save(rent); err != nil {
		t.Fatal(err)
	}
	requireSweep(t, env.app, at("2026-06-01", 0), 1)
	if rev, err := postedReversalOf(env.app, entry.Id); err != nil || rev == nil {
		t.Fatalf("no posted reversal (err %v)", err)
	}
	requireNoDrift(t, env.app)
}

// Every original that keeps its auto-reverse date but is already settled: a
// voided one, an edited one (void by its correction), one reversed by hand,
// and one whose automatic reversal was voided. None is swept, and none holds
// the close date back.
func TestAutoReverse_SettledOriginalsAreNeitherSweptNorBlockTheCloseDate(t *testing.T) {
	env := newLedgerEnv(t)

	voided := accrual(t, env, "2026-05-31", "2026-06-01")
	if err := setStatus(env.app, voided.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}

	edited := accrual(t, env, "2026-05-30", "2026-06-02")
	mustPost(t, env.app, correctionDraft(t, env, edited, "2026-05-30", 2500).Id, "")
	if s := reload(t, env.app, "books_journal_entries", edited.Id).GetString("status"); s != statusVoid {
		t.Fatalf("edited original is %s, want void", s)
	}

	byHand := accrual(t, env, "2026-05-29", "2026-06-03")
	mustPost(t, env.app, reversalDraft(t, env.app, byHand, "2026-05-31").Id, "")

	reverted := accrual(t, env, "2026-05-28", "2026-06-01")
	requireSweep(t, env.app, at("2026-06-01", 0), 1)
	auto := findReversal(t, env.app, reverted.Id)
	if err := setStatus(env.app, auto.Id, statusVoid, ""); err != nil {
		t.Fatalf("void the automatic reversal: %v", err)
	}

	for _, e := range []*core.Record{voided, edited, byHand, reverted} {
		if keep := reload(t, env.app, "books_journal_entries", e.Id).GetString("auto_reverse_on"); keep == "" {
			t.Fatalf("entry %s lost its auto-reverse date; the test needs it kept", e.Id)
		}
	}
	requireSweep(t, env.app, at("2026-06-10", 0), 0)
	if err := checkPendingAutoReversals(env.app, "2026-06-30"); err != nil {
		t.Fatalf("a settled original blocks the close date: %v", err)
	}
	setCloseDate(t, env.app, "2026-06-30")
	requireRebuildFixesNothing(t, env.app)
}

// Each reversal has its own transaction. One that is refused after it wrote
// its draft, lines and a balance row leaves none of them, and the next due
// entry still posts.
func TestAutoReverse_ARefusedReversalLeavesNoTraceAndTheSweepGoesOn(t *testing.T) {
	logs := readonlytest.CaptureLogs(t)
	env := newLedgerEnv(t)
	failing := accrual(t, env, "2026-05-31", "2026-06-01")
	fine := accrual(t, env, "2026-06-30", "2026-07-01")
	// The reversal of failing credits rent, then debits checking in 2026-06;
	// the checking row is one step from the stored limit, so the second line
	// is refused after the first one's row was written.
	if _, err := env.app.DB().
		NewQuery("UPDATE books_account_balances SET debit_total = {:v} WHERE period = '2026-06' AND account = {:a}").
		Bind(dbx.Params{"v": maxStoredAmount - 50, "a": env.checking.Id}).Execute(); err != nil {
		t.Fatal(err)
	}

	requireSweep(t, env.app, at("2026-07-01", 0), 1)

	if rev, err := postedReversalOf(env.app, failing.Id); err != nil || rev != nil {
		t.Fatalf("failing entry has a reversal %v (err %v)", rev, err)
	}
	rev := findReversal(t, env.app, fine.Id)
	if rev.GetString("number") != "3" || rev.GetString("date") != "2026-07-01" {
		t.Fatalf("reversal of the second entry = %v", rev.PublicExport())
	}
	// Two accruals and one reversal: no stray draft of the refused one.
	requireRowCounts(t, env.app, 3, 6)
	requireNextNumber(t, env.app, 4)
	requireBalance(t, env.app, env.rent, "2026-06", 2000, 0)
	requireBalance(t, env.app, env.checking, "2026-06", maxStoredAmount-50, 2000)
	requireBalance(t, env.app, env.rent, "2026-07", 0, 2000)
	requireBalance(t, env.app, env.checking, "2026-07", 2000, 0)

	r, ok := readonlytest.Find(logs(), "auto-reversal refused")
	if !ok {
		t.Fatal("the refusal was not logged")
	}
	if r.Level != slog.LevelWarn || r.Attrs["pkg"] != "books" || r.Attrs["entry"] != failing.Id {
		t.Fatalf("log = %+v", r)
	}
}

// Logging and going on is safe only because each reversal commits on its
// own; inside a caller's transaction a refusal could not be undone alone.
func TestAutoReverse_RefusesToRunInsideATransaction(t *testing.T) {
	env := newLedgerEnv(t)
	entry := accrual(t, env, "2026-05-31", "2026-06-01")
	err := env.app.RunInTransaction(func(tx core.App) error {
		_, err := runAutoReversals(tx, at("2026-06-01", 0))
		return err
	})
	requireRefused(t, err, "must not run inside a transaction")
	if rev, _ := postedReversalOf(env.app, entry.Id); rev != nil {
		t.Fatal("a reversal was posted")
	}
}

func TestAutoReverse_WaitsWhileReadOnly(t *testing.T) {
	env := newLedgerEnv(t)
	accrual(t, env, "2026-05-31", "2026-06-01")
	readonly.Enter()
	t.Cleanup(readonly.Leave)
	requireSweep(t, env.app, at("2026-06-01", 0), 0)
	readonly.Leave()
	requireSweep(t, env.app, at("2026-06-01", 0), 1)
}

// The sweep would never reach a reversal dated on or before the close date,
// so posting refuses one, override or not.
func TestPost_AutoReverseDateInTheClosedPeriodIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	setCloseDate(t, env.app, "2026-06-30")
	grantOverride(t, env.app, env.users.bookkeeper, time.Now().Add(time.Hour))
	e := mkDraft(t, env.app, "2026-06-10", ln{env.rent, 2000, 0}, ln{env.checking, 0, 2000})
	e.Set("auto_reverse_on", "2026-06-30")
	if err := env.app.Save(e); err != nil {
		t.Fatal(err)
	}
	requireRefused(t, setStatus(env.app, e.Id, statusPosted, env.users.bookkeeper.Id),
		"closed through 2026-06-30, so the auto-reverse date must be after it")
	requireNothingPosted(t, env.app, e.Id)

	e = reload(t, env.app, "books_journal_entries", e.Id)
	e.Set("auto_reverse_on", "2026-07-01")
	if err := env.app.Save(e); err != nil {
		t.Fatal(err)
	}
	mustPost(t, env.app, e.Id, env.users.bookkeeper.Id)
}

func TestAutoReverse_SweepIsAnHourlyCronJob(t *testing.T) {
	env := newLedgerEnv(t)
	entry := accrual(t, env, "2026-05-31", "2026-06-01")
	registerAutoReverseSweep(env.app)
	var job func()
	for _, j := range env.app.Cron().Jobs() {
		if j.Id() == autoReverseJobID {
			if j.Expression() != "0 * * * *" {
				t.Fatalf("schedule %q, want hourly", j.Expression())
			}
			job = j.Run
		}
	}
	if job == nil {
		t.Fatal("the sweep is not on the cron")
	}
	job()
	requireReversedSoon(t, env.app, entry.Id)
}

// A server that was down when a reversal fell due posts it when it starts,
// not at the next hour.
func TestAutoReverse_SweepRunsWhenTheServerStarts(t *testing.T) {
	env := newLedgerEnv(t)
	entry := accrual(t, env, "2026-05-31", "2026-06-01")
	registerAutoReverseSweep(env.app)
	if err := env.app.OnServe().Trigger(&core.ServeEvent{App: env.app}, func(*core.ServeEvent) error { return nil }); err != nil {
		t.Fatal(err)
	}
	requireReversedSoon(t, env.app, entry.Id)
}

// requireReversedSoon waits for a sweep that runs as a background job.
func requireReversedSoon(t testing.TB, app core.App, entryID string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		rev, err := postedReversalOf(app, entryID)
		if err != nil {
			t.Fatal(err)
		}
		if rev != nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("the background sweep posted no reversal")
}
