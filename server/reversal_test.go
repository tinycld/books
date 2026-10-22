package books

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func findReversal(t testing.TB, app core.App, entryID string) *core.Record {
	t.Helper()
	rev, err := app.FindFirstRecordByFilter("books_journal_entries", "reverses = {:id}", dbx.Params{"id": entryID})
	if err != nil {
		t.Fatalf("no reversal of %s: %v", entryID, err)
	}
	return rev
}

func reversalDraft(t testing.TB, app core.App, target *core.Record, date string) *core.Record {
	t.Helper()
	return saveRecord(t, app, "books_journal_entries", map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "reversal", "reverses": target.Id,
	})
}

func correctionDraft(t testing.TB, env *ledgerEnv, original *core.Record, date string, amount int) *core.Record {
	t.Helper()
	draft := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": date, "status": "draft", "doc_type": "journal", "origin": "manual", "replaces": original.Id,
	})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{"entry": draft.Id, "account": env.checking.Id, "debit": amount, "position": 0})
	saveRecord(t, env.app, "books_journal_lines", map[string]any{"entry": draft.Id, "account": env.revenue.Id, "credit": amount, "position": 1})
	return draft
}

func TestVoid_ReversesInTheOriginalPeriodAndKeepsTheNumber(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
	if err := setStatus(env.app, sale.Id, statusVoid, env.users.bookkeeper.Id); err != nil {
		t.Fatalf("void: %v", err)
	}
	voided := reload(t, env.app, "books_journal_entries", sale.Id)
	if voided.GetString("status") != statusVoid || voided.GetDateTime("voided_at").IsZero() || voided.GetString("voided_by") != env.users.bookkeeper.Id {
		t.Fatalf("voided = %v", voided.PublicExport())
	}
	rev := findReversal(t, env.app, sale.Id)
	if rev.GetString("origin") != originVoidReversal || rev.GetString("status") != statusPosted ||
		rev.GetString("number") != "1" || rev.GetString("date") != "2026-05-10" || rev.GetString("posted_by") != env.users.bookkeeper.Id {
		t.Fatalf("reversal = %v", rev.PublicExport())
	}
	if d, c := balanceOf(t, env.app, env.checking, "2026-05"); d != 5000 || c != 5000 {
		t.Fatalf("checking %d/%d, want 5000/5000", d, c)
	}
	requireNoDrift(t, env.app)
	if got := mustPost(t, env.app, env.sale(t, "2026-05-11", 10).Id, "").GetString("number"); got != "2" {
		t.Fatalf("next number %s, want 2", got)
	}
}

func TestVoid_OverREST(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
	apiReq{
		method:  http.MethodPatch,
		url:     "/api/collections/books_journal_entries/records/" + sale.Id,
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"status":"void"}`,
		want:    http.StatusOK,
		content: []string{`"status":"void"`, `"voided_by":"` + env.users.bookkeeper.Id + `"`},
		after: func(t testing.TB, app *tests.TestApp) {
			findReversal(t, app, sale.Id)
			requireNoDrift(t, app)
		},
	}.run(t, env.app)
}

func TestVoid_Refusals(t *testing.T) {
	t.Run("a void changes nothing else", func(t *testing.T) {
		env := newLedgerEnv(t)
		sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
		sale.Set("status", statusVoid)
		sale.Set("memo", "why")
		requireRefused(t, env.app.Save(sale), "cannot change (memo)")
	})
	t.Run("a void's reversal cannot be voided", func(t *testing.T) {
		env := newLedgerEnv(t)
		sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
		if err := setStatus(env.app, sale.Id, statusVoid, ""); err != nil {
			t.Fatal(err)
		}
		requireRefused(t, setStatus(env.app, findReversal(t, env.app, sale.Id).Id, statusVoid, ""), "records a void")
	})
	t.Run("a reversed entry cannot be voided", func(t *testing.T) {
		env := newLedgerEnv(t)
		sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
		mustPost(t, env.app, reversalDraft(t, env.app, sale, "2026-06-01").Id, "")
		requireRefused(t, setStatus(env.app, sale.Id, statusVoid, ""), "Void that reversal first")
	})
	t.Run("a void is still possible after an account is retired", func(t *testing.T) {
		env := newLedgerEnv(t)
		sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
		acct := reload(t, env.app, "books_accounts", env.revenue.Id)
		acct.Set("inactive", true)
		if err := env.app.Save(acct); err != nil {
			t.Fatal(err)
		}
		if err := setStatus(env.app, sale.Id, statusVoid, ""); err != nil {
			t.Fatalf("void with an inactive account: %v", err)
		}
	})
}

func TestVoid_ClosedPeriodNeedsAnOverride(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-03-10", 100).Id, "")
	setCloseDate(t, env.app, "2026-03-31")
	requireRefused(t, setStatus(env.app, sale.Id, statusVoid, env.users.bookkeeper.Id), "closed through 2026-03-31")
	if s := reload(t, env.app, "books_journal_entries", sale.Id).GetString("status"); s != statusPosted {
		t.Fatalf("a refused void left status %s", s)
	}
	ov := grantOverride(t, env.app, env.users.bookkeeper, time.Now().Add(time.Hour))
	if err := setStatus(env.app, sale.Id, statusVoid, env.users.bookkeeper.Id); err != nil {
		t.Fatalf("void with override: %v", err)
	}
	if got := findReversal(t, env.app, sale.Id).GetString("close_override"); got != ov.Id {
		t.Fatalf("reversal close_override = %q, want %s", got, ov.Id)
	}
}

func TestReverse_PostsMirrorLinesWithANewNumber(t *testing.T) {
	env := newLedgerEnv(t)
	accrual := mustPost(t, env.app, mkDraft(t, env.app, "2026-05-31", ln{env.rent, 2000, 0}, ln{env.checking, 0, 2000}).Id, "")
	rev := mustPost(t, env.app, reversalDraft(t, env.app, accrual, "2026-06-01").Id, "")
	if rev.GetString("number") != "2" {
		t.Fatalf("reversal number %s, want 2", rev.GetString("number"))
	}
	lines, _ := entryLines(env.app, rev.Id)
	if len(lines) != 2 || lines[0].GetString("account") != env.rent.Id || lines[0].GetInt("credit") != 2000 || lines[1].GetInt("debit") != 2000 {
		t.Fatalf("mirror lines wrong: %v %v", lines[0].PublicExport(), lines[1].PublicExport())
	}
	if d, c := balanceOf(t, env.app, env.rent, "2026-06"); d != 0 || c != 2000 {
		t.Fatalf("rent June %d/%d", d, c)
	}
	requireNoDrift(t, env.app)
}

func TestReverse_Refusals(t *testing.T) {
	t.Run("dated before the original", func(t *testing.T) {
		env := newLedgerEnv(t)
		sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
		requireRefused(t, setStatus(env.app, reversalDraft(t, env.app, sale, "2026-05-09").Id, statusPosted, ""), "cannot be dated before")
	})
	t.Run("a second reversal", func(t *testing.T) {
		env := newLedgerEnv(t)
		sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
		mustPost(t, env.app, reversalDraft(t, env.app, sale, "2026-06-01").Id, "")
		requireRefused(t, setStatus(env.app, reversalDraft(t, env.app, sale, "2026-06-02").Id, statusPosted, ""), "already reversed by entry 2")
	})
	t.Run("a void entry", func(t *testing.T) {
		env := newLedgerEnv(t)
		sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
		if err := setStatus(env.app, sale.Id, statusVoid, ""); err != nil {
			t.Fatal(err)
		}
		requireRefused(t, setStatus(env.app, reversalDraft(t, env.app, sale, "2026-06-01").Id, statusPosted, ""), "Only a posted entry can be reversed")
	})
}

func TestEdit_PostsTheCorrectionUnderTheSameNumber(t *testing.T) {
	env := newLedgerEnv(t)
	original := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
	corrected := mustPost(t, env.app, correctionDraft(t, env, original, "2026-05-12", 5500).Id, env.users.bookkeeper.Id)
	if corrected.GetString("number") != "1" || corrected.GetInt("sequence") != 1 {
		t.Fatalf("correction number %s seq %d, want 1", corrected.GetString("number"), corrected.GetInt("sequence"))
	}
	if s := reload(t, env.app, "books_journal_entries", original.Id).GetString("status"); s != statusVoid {
		t.Fatalf("original status %s, want void", s)
	}
	findReversal(t, env.app, original.Id)
	if d, c := balanceOf(t, env.app, env.checking, "2026-05"); d-c != 5500 {
		t.Fatalf("checking net %d, want 5500", d-c)
	}
	requireNoDrift(t, env.app)
}

func TestEdit_ClosedPeriodChecksTheOriginalDate(t *testing.T) {
	env := newLedgerEnv(t)
	original := mustPost(t, env.app, env.sale(t, "2026-03-10", 5000).Id, "")
	setCloseDate(t, env.app, "2026-03-31")
	draft := correctionDraft(t, env, original, "2026-04-02", 5500)
	requireRefused(t, setStatus(env.app, draft.Id, statusPosted, env.users.bookkeeper.Id), "closed through 2026-03-31")
	grantOverride(t, env.app, env.users.bookkeeper, time.Now().Add(time.Hour))
	mustPost(t, env.app, draft.Id, env.users.bookkeeper.Id)
	requireNoDrift(t, env.app)
}

func TestEdit_Refusals(t *testing.T) {
	t.Run("a second edit of the same entry", func(t *testing.T) {
		env := newLedgerEnv(t)
		original := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
		first := correctionDraft(t, env, original, "2026-05-12", 5500)
		second := correctionDraft(t, env, original, "2026-05-13", 5600)
		mustPost(t, env.app, first.Id, "")
		requireRefused(t, setStatus(env.app, second.Id, statusPosted, ""), "is void and cannot be edited")
	})
	t.Run("an invalid correction leaves the original posted", func(t *testing.T) {
		env := newLedgerEnv(t)
		original := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
		bad := correctionDraft(t, env, original, "2026-05-12", 5500)
		lines, _ := entryLines(env.app, bad.Id)
		lines[1].Set("credit", 5400)
		if err := env.app.Save(lines[1]); err != nil {
			t.Fatal(err)
		}
		requireRefused(t, setStatus(env.app, bad.Id, statusPosted, ""), "do not equal credits")
		if s := reload(t, env.app, "books_journal_entries", original.Id).GetString("status"); s != statusPosted {
			t.Fatalf("original status %s after a refused edit", s)
		}
		requireNoDrift(t, env.app)
	})
}

func TestBalances_RebuildMatchesAfterVoidsAndEdits(t *testing.T) {
	env := newLedgerEnv(t)
	a := mustPost(t, env.app, env.sale(t, "2026-04-10", 1000).Id, "")
	b := mustPost(t, env.app, env.sale(t, "2026-05-10", 2000).Id, "")
	if err := setStatus(env.app, a.Id, statusVoid, ""); err != nil {
		t.Fatal(err)
	}
	mustPost(t, env.app, correctionDraft(t, env, b, "2026-05-11", 2100).Id, "")
	mustPost(t, env.app, reversalDraft(t, env.app, mustPost(t, env.app, env.sale(t, "2026-05-20", 300).Id, ""), "2026-06-01").Id, "")
	requireNoDrift(t, env.app)
	if _, err := env.app.DB().
		NewQuery("UPDATE books_account_balances SET debit_total = debit_total + 1 WHERE period = '2026-05' AND account = {:a}").
		Bind(dbx.Params{"a": env.checking.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	if fixed, err := rebuildBalances(env.app); err != nil || fixed != 1 {
		t.Fatalf("rebuild fixed %d, err %v; want 1", fixed, err)
	}
	requireNoDrift(t, env.app)
}

func requireNoReversal(t testing.TB, app core.App, entryID string) {
	t.Helper()
	_, err := app.FindFirstRecordByFilter("books_journal_entries", "reverses = {:id}", dbx.Params{"id": entryID})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("a reversal of %s exists (err %v)", entryID, err)
	}
}

// requireStillPosted checks that a refused void or edit left the entry as it
// was: posted, never voided, with no reversal.
func requireStillPosted(t testing.TB, app core.App, entryID string) {
	t.Helper()
	e := reload(t, app, "books_journal_entries", entryID)
	if e.GetString("status") != statusPosted || e.GetString("voided_by") != "" || !e.GetDateTime("voided_at").IsZero() {
		t.Errorf("entry after a refused void: %v", e.PublicExport())
	}
	requireNoReversal(t, app, entryID)
}

func requireRowCounts(t testing.TB, app core.App, entries, lines int) {
	t.Helper()
	if n, err := app.CountRecords("books_journal_entries"); err != nil || int(n) != entries {
		t.Errorf("%d entries (err %v), want %d", n, err, entries)
	}
	if n, err := app.CountRecords("books_journal_lines"); err != nil || int(n) != lines {
		t.Errorf("%d lines (err %v), want %d", n, err, lines)
	}
}

func requireNextNumber(t testing.TB, app core.App, want int) {
	t.Helper()
	if n := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); n != want {
		t.Errorf("next_number = %d, want %d", n, want)
	}
}

func requireBalance(t testing.TB, app core.App, account *core.Record, period string, debit, credit int) {
	t.Helper()
	if d, c := balanceOf(t, app, account, period); d != debit || c != credit {
		t.Errorf("%s %s = %d/%d, want %d/%d", account.GetString("name"), period, d, c, debit, credit)
	}
}

func requireRebuildFixesNothing(t testing.TB, app core.App) {
	t.Helper()
	requireNoDrift(t, app)
	if fixed, err := rebuildBalances(app); err != nil || fixed != 0 {
		t.Fatalf("rebuild fixed %d, err %v; want 0", fixed, err)
	}
}

// The update rule lets a posted entry take {"status":"void"} with any field a
// draft may edit, so the hook alone stops a void from rewriting the entry.
func TestVoid_PatchThatChangesMoreThanTheStatusIsRefusedOverREST(t *testing.T) {
	cases := []struct{ name, body, want string }{
		{"memo", `{"status":"void","memo":"why"}`, "cannot change (memo)"},
		{"date", `{"status":"void","date":"2026-05-11"}`, "cannot change (date)"},
		{"auto-reverse date", `{"status":"void","auto_reverse_on":"2026-06-01"}`, "cannot change (auto_reverse_on)"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := newLedgerEnv(t)
			sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
			apiReq{
				method:  http.MethodPatch,
				url:     "/api/collections/books_journal_entries/records/" + sale.Id,
				token:   tokenFor(t, env.users.bookkeeper),
				body:    tc.body,
				want:    http.StatusBadRequest,
				content: []string{tc.want},
				after: func(t testing.TB, app *tests.TestApp) {
					requireStillPosted(t, app, sale.Id)
					requireRowCounts(t, app, 1, 2)
					requireNoDrift(t, app)
				},
			}.run(t, env.app)
		})
	}
}

func TestVoid_NetsToZeroInTheOriginalMonth(t *testing.T) {
	env := newLedgerEnv(t)
	april := mustPost(t, env.app, env.sale(t, "2026-04-28", 1000).Id, "")
	mustPost(t, env.app, env.sale(t, "2026-05-10", 2000).Id, "")
	if err := setStatus(env.app, april.Id, statusVoid, ""); err != nil {
		t.Fatalf("void: %v", err)
	}
	requireBalance(t, env.app, env.checking, "2026-04", 1000, 1000)
	requireBalance(t, env.app, env.revenue, "2026-04", 1000, 1000)
	requireBalance(t, env.app, env.checking, "2026-05", 2000, 0)
	requireBalance(t, env.app, env.revenue, "2026-05", 0, 2000)
	requireRebuildFixesNothing(t, env.app)
}

func TestEdit_ACorrectionInALaterMonthReversesInTheOriginalMonth(t *testing.T) {
	env := newLedgerEnv(t)
	original := mustPost(t, env.app, env.sale(t, "2026-04-28", 5000).Id, "")
	corrected := mustPost(t, env.app, correctionDraft(t, env, original, "2026-05-03", 5500).Id, "")
	if corrected.GetString("number") != "1" {
		t.Fatalf("correction number %s, want 1", corrected.GetString("number"))
	}
	rev := findReversal(t, env.app, original.Id)
	if rev.GetString("date") != "2026-04-28" || rev.GetString("number") != "1" || rev.GetString("origin") != originVoidReversal {
		t.Fatalf("reversal = %v", rev.PublicExport())
	}
	requireBalance(t, env.app, env.checking, "2026-04", 5000, 5000)
	requireBalance(t, env.app, env.revenue, "2026-04", 5000, 5000)
	requireBalance(t, env.app, env.checking, "2026-05", 5500, 0)
	requireBalance(t, env.app, env.revenue, "2026-05", 0, 5500)
	requireNextNumber(t, env.app, 2)
	requireRebuildFixesNothing(t, env.app)
}

// A void's reversal goes through the same stored-amount check as any post,
// and its refusal undoes the whole void: the reversal entry and its lines,
// every balance row and the original's status.
func TestVoid_AReversalPastTheStoredLimitRollsBackEverything(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	if _, err := env.app.DB().
		NewQuery("UPDATE books_account_balances SET credit_total = {:v} WHERE period = '2026-05' AND account = {:a}").
		Bind(dbx.Params{"v": maxStoredAmount - 50, "a": env.checking.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	requireRefused(t, setStatus(env.app, sale.Id, statusVoid, env.users.bookkeeper.Id),
		"Checking for 2026-05 past the largest amount Books can store")
	requireStillPosted(t, env.app, sale.Id)
	requireRowCounts(t, env.app, 1, 2)
	requireNextNumber(t, env.app, 2)
	requireBalance(t, env.app, env.checking, "2026-05", 100, maxStoredAmount-50)
	requireBalance(t, env.app, env.revenue, "2026-05", 0, 100)
}

func TestReverse_AFailureAfterTheWritesRollsBackEverything(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	rev := reload(t, env.app, "books_journal_entries", reversalDraft(t, env.app, sale, "2026-06-01").Id)
	// The hooks accept the memo; PocketBase's field validation, which runs
	// after the reversal's lines, balance rows and number are written, refuses it.
	rev.Set("memo", strings.Repeat("x", 5000))
	rev.Set("status", statusPosted)
	requireRefused(t, env.app.Save(rev), "memo")
	if r := reload(t, env.app, "books_journal_entries", rev.Id); r.GetString("status") != statusDraft || r.GetString("number") != "" {
		t.Errorf("reversal after a refused post: %v", r.PublicExport())
	}
	requireRowCounts(t, env.app, 2, 2)
	requireNextNumber(t, env.app, 2)
	requireBalance(t, env.app, env.checking, "2026-06", 0, 0)
	requireBalance(t, env.app, env.revenue, "2026-06", 0, 0)
	requireNoDrift(t, env.app)
}

func TestEdit_AFailureAfterTheWritesRollsBackEverything(t *testing.T) {
	env := newLedgerEnv(t)
	original := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
	draft := reload(t, env.app, "books_journal_entries", correctionDraft(t, env, original, "2026-05-12", 5500).Id)
	// Validation fails after the original is voided, its reversal posted and
	// the correction stamped, so every one of those writes must roll back.
	draft.Set("memo", strings.Repeat("x", 5000))
	draft.Set("status", statusPosted)
	draft.Set("posted_by", env.users.bookkeeper.Id)
	requireRefused(t, env.app.Save(draft), "memo")
	requireStillPosted(t, env.app, original.Id)
	if d := reload(t, env.app, "books_journal_entries", draft.Id); d.GetString("status") != statusDraft || d.GetString("number") != "" {
		t.Errorf("correction after a refused post: %v", d.PublicExport())
	}
	lines, _ := entryLines(env.app, draft.Id)
	for _, l := range lines {
		if l.GetBool("posted") {
			t.Errorf("a refused edit stamped a line: %v", l.PublicExport())
		}
	}
	requireRowCounts(t, env.app, 2, 4)
	requireNextNumber(t, env.app, 2)
	requireBalance(t, env.app, env.checking, "2026-05", 5000, 0)
	requireBalance(t, env.app, env.revenue, "2026-05", 0, 5000)
	requireNoDrift(t, env.app)
}

func TestEdit_MoreRefusals(t *testing.T) {
	t.Run("an entry that a reversal reverses", func(t *testing.T) {
		env := newLedgerEnv(t)
		original := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
		mustPost(t, env.app, reversalDraft(t, env.app, original, "2026-06-01").Id, "")
		draft := correctionDraft(t, env, original, "2026-05-12", 5500)
		requireRefused(t, setStatus(env.app, draft.Id, statusPosted, ""), "Void that reversal first")
		if s := reload(t, env.app, "books_journal_entries", original.Id).GetString("status"); s != statusPosted {
			t.Errorf("original status %s after a refused edit", s)
		}
		requireNextNumber(t, env.app, 3)
		requireNoDrift(t, env.app)
	})
	t.Run("a void's reversal", func(t *testing.T) {
		env := newLedgerEnv(t)
		original := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, "")
		if err := setStatus(env.app, original.Id, statusVoid, ""); err != nil {
			t.Fatal(err)
		}
		draft := correctionDraft(t, env, findReversal(t, env.app, original.Id), "2026-05-12", 5500)
		requireRefused(t, setStatus(env.app, draft.Id, statusPosted, ""), "records a void and cannot be edited")
		requireNoDrift(t, env.app)
	})
}

// Voiding a one-click reversal frees its original to be voided in turn.
func TestVoid_AReversalThenItsOriginal(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 300).Id, "")
	rev := mustPost(t, env.app, reversalDraft(t, env.app, sale, "2026-06-01").Id, "")
	if err := setStatus(env.app, rev.Id, statusVoid, ""); err != nil {
		t.Fatalf("void the reversal: %v", err)
	}
	if got := findReversal(t, env.app, rev.Id).GetString("number"); got != "2" {
		t.Fatalf("the reversal's void has number %s, want 2", got)
	}
	if err := setStatus(env.app, sale.Id, statusVoid, ""); err != nil {
		t.Fatalf("void the original: %v", err)
	}
	requireBalance(t, env.app, env.checking, "2026-05", 300, 300)
	requireBalance(t, env.app, env.checking, "2026-06", 300, 300)
	requireNextNumber(t, env.app, 3)
	requireRebuildFixesNothing(t, env.app)
}

// A void_reversal takes the voided entry's number, so only a void may post
// one. Posted by any other path it would cancel an entry that still reads as
// posted, under that entry's number.
func TestVoidReversal_OnlyAVoidPostsOne(t *testing.T) {
	env := newLedgerEnv(t)
	sale := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	stray := saveRecord(t, env.app, "books_journal_entries", map[string]any{
		"date": "2026-05-10", "status": "draft", "doc_type": "journal", "origin": originVoidReversal, "reverses": sale.Id,
	})
	requireRefused(t, setStatus(env.app, stray.Id, statusPosted, ""), "Books writes a void's reversal")
	if s := reload(t, env.app, "books_journal_entries", sale.Id).GetString("status"); s != statusPosted {
		t.Errorf("original status %s after a refused stray", s)
	}
	if rev, err := postedReversalOf(env.app, sale.Id); err != nil || rev != nil {
		t.Errorf("posted reversal %v (err %v), want none", rev, err)
	}
	requireNextNumber(t, env.app, 2)
	requireNoDrift(t, env.app)
	if err := setStatus(env.app, sale.Id, statusVoid, ""); err != nil {
		t.Fatalf("void after a refused stray: %v", err)
	}
	requireNoDrift(t, env.app)
}

// A reversal or a correction may name only an entry that cannot be deleted
// (posted or void). If it could name a draft, deleting that draft would make
// PocketBase clear the link on the reversal or correction, a change to a
// field fixed at create, and Books would refuse the delete.
func TestDraft_AReversalOrCorrectionCannotNameADraft(t *testing.T) {
	for _, field := range []string{"reverses", "replaces"} {
		t.Run(field, func(t *testing.T) {
			env := newLedgerEnv(t)
			target := env.sale(t, "2026-05-10", 100)
			origin := originReversal
			if field == "replaces" {
				origin = originManual
			}
			col, err := env.app.FindCollectionByNameOrId("books_journal_entries")
			if err != nil {
				t.Fatal(err)
			}
			r := core.NewRecord(col)
			r.Load(map[string]any{"date": "2026-06-01", "status": "draft", "doc_type": "journal", "origin": origin, field: target.Id})
			requireRefused(t, env.app.Save(r), "is a draft. Post it first")
			if err := env.app.Delete(reload(t, env.app, "books_journal_entries", target.Id)); err != nil {
				t.Fatalf("delete the draft: %v", err)
			}
		})
	}
}

func TestDraft_AReversalOrCorrectionNamingADraftIsRefusedOverREST(t *testing.T) {
	env := newLedgerEnv(t)
	target := env.sale(t, "2026-05-10", 100)
	apiReq{
		method:  http.MethodPost,
		url:     "/api/collections/books_journal_entries/records",
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"date":"2026-06-01","status":"draft","doc_type":"journal","origin":"manual","replaces":"` + target.Id + `"}`,
		want:    http.StatusBadRequest,
		content: []string{"is a draft. Post it first"},
	}.run(t, env.app)
}

func TestDraft_ReversalAndCorrectionDraftsDelete(t *testing.T) {
	env := newLedgerEnv(t)
	original := mustPost(t, env.app, env.sale(t, "2026-05-10", 100).Id, "")
	correction := correctionDraft(t, env, original, "2026-05-12", 110)
	rev := reversalDraft(t, env.app, original, "2026-06-01")
	for _, id := range []string{correction.Id, rev.Id} {
		if err := env.app.Delete(reload(t, env.app, "books_journal_entries", id)); err != nil {
			t.Fatalf("delete draft %s: %v", id, err)
		}
	}
	requireRowCounts(t, env.app, 1, 2)
	requireRefused(t, env.app.Delete(reload(t, env.app, "books_journal_entries", original.Id)), "Void it instead")
}
