package books

import (
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestPost_BalancedEntry(t *testing.T) {
	env := newLedgerEnv(t)
	posted := mustPost(t, env.app, env.sale(t, "2026-05-10", 5000).Id, env.users.bookkeeper.Id)
	if posted.GetString("number") != "1" || posted.GetInt("sequence") != 1 || posted.GetInt("total") != 5000 {
		t.Fatalf("posted = %v", posted.PublicExport())
	}
	if posted.GetDateTime("posted_at").IsZero() || posted.GetString("currency") != "USD" {
		t.Fatalf("posted_at %v currency %q", posted.GetDateTime("posted_at"), posted.GetString("currency"))
	}
	lines, _ := entryLines(env.app, posted.Id)
	for _, l := range lines {
		if !l.GetBool("posted") || l.GetString("date") != "2026-05-10" {
			t.Errorf("line not stamped: %v", l.PublicExport())
		}
	}
	if d, c := balanceOf(t, env.app, env.checking, "2026-05"); d != 5000 || c != 0 {
		t.Errorf("checking %d/%d", d, c)
	}
	if d, c := balanceOf(t, env.app, env.revenue, "2026-05"); d != 0 || c != 5000 {
		t.Errorf("revenue %d/%d", d, c)
	}
	requireNoDrift(t, env.app)
}

func TestPost_UnbalancedPostOverRESTIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := mkDraft(t, env.app, "2026-05-01", ln{env.checking, 1000, 0}, ln{env.revenue, 0, 900})
	apiReq{
		method:  http.MethodPatch,
		url:     "/api/collections/books_journal_entries/records/" + entry.Id,
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"status":"posted"}`,
		want:    http.StatusBadRequest,
		content: []string{"Debits (10.00) do not equal credits (9.00)", "out of balance by 1.00"},
		after: func(t testing.TB, app *tests.TestApp) {
			if s := reload(t, app, "books_journal_entries", entry.Id).GetString("status"); s != statusDraft {
				t.Errorf("status = %s, want draft", s)
			}
			if n := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); n != 1 {
				t.Errorf("next_number = %d, want 1", n)
			}
			if d, c := balanceOf(t, app, env.checking, "2026-05"); d != 0 || c != 0 {
				t.Errorf("a refused post moved a balance: %d/%d", d, c)
			}
		},
	}.run(t, env.app)
}

func TestPost_OverRESTStampsTheActor(t *testing.T) {
	env := newLedgerEnv(t)
	entry := env.sale(t, "2026-05-01", 100)
	apiReq{
		method:  http.MethodPatch,
		url:     "/api/collections/books_journal_entries/records/" + entry.Id,
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"status":"posted"}`,
		want:    http.StatusOK,
		content: []string{`"posted_by":"` + env.users.bookkeeper.Id + `"`, `"number":"1"`},
	}.run(t, env.app)
}

func TestPost_LineAndDateRules(t *testing.T) {
	cases := []struct {
		name  string
		build func(t *testing.T, env *ledgerEnv) string
		want  string
	}{
		{"one line", func(t *testing.T, env *ledgerEnv) string {
			return mkDraft(t, env.app, "2026-05-01", ln{env.checking, 100, 0}).Id
		}, "at least two lines"},
		{"both sides on a line", func(t *testing.T, env *ledgerEnv) string {
			return mkDraft(t, env.app, "2026-05-01", ln{env.checking, 100, 100}, ln{env.revenue, 0, 0}).Id
		}, "Line 1 has both a debit and a credit"},
		{"an empty line", func(t *testing.T, env *ledgerEnv) string {
			return mkDraft(t, env.app, "2026-05-01", ln{env.checking, 100, 0}, ln{env.revenue, 0, 100}, ln{env.rent, 0, 0}).Id
		}, "Line 3 has no amount"},
		{"an inactive account", func(t *testing.T, env *ledgerEnv) string {
			id := env.sale(t, "2026-05-01", 100).Id
			acct := reload(t, env.app, "books_accounts", env.revenue.Id)
			acct.Set("inactive", true)
			if err := env.app.Save(acct); err != nil {
				t.Fatal(err)
			}
			return id
		}, "Line 2: account Consulting Income is inactive"},
		{"a day that does not exist", func(t *testing.T, env *ledgerEnv) string {
			return env.sale(t, "2026-02-30", 100).Id
		}, "is not a date"},
		{"auto-reverse on the entry date", func(t *testing.T, env *ledgerEnv) string {
			e := env.sale(t, "2026-05-31", 100)
			e.Set("auto_reverse_on", "2026-05-31")
			if err := env.app.Save(e); err != nil {
				t.Fatal(err)
			}
			return e.Id
		}, "auto-reverse date must be after the entry date"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := newLedgerEnv(t)
			requireRefused(t, setStatus(env.app, tc.build(t, env), statusPosted, ""), tc.want)
			requireNoDrift(t, env.app)
		})
	}
}

func TestPost_ClosedPeriod(t *testing.T) {
	env := newLedgerEnv(t)
	setCloseDate(t, env.app, "2026-03-31")
	requireRefused(t, setStatus(env.app, env.sale(t, "2026-03-31", 100).Id, statusPosted, env.users.bookkeeper.Id),
		"closed through 2026-03-31")
	mustPost(t, env.app, env.sale(t, "2026-04-01", 100).Id, env.users.bookkeeper.Id)
}

func TestPost_ClosedPeriodWithAnOverride(t *testing.T) {
	env := newLedgerEnv(t)
	setCloseDate(t, env.app, "2026-03-31")
	ov := grantOverride(t, env.app, env.users.bookkeeper, time.Now().Add(time.Hour))
	entry := env.sale(t, "2026-03-15", 100)
	apiReq{
		method:  http.MethodPatch,
		url:     "/api/collections/books_journal_entries/records/" + entry.Id,
		token:   tokenFor(t, env.users.bookkeeper),
		body:    `{"status":"posted"}`,
		want:    http.StatusOK,
		content: []string{`"close_override":"` + ov.Id + `"`},
	}.run(t, env.app)
}

func TestPost_ExpiredOverrideDoesNotOpenThePeriod(t *testing.T) {
	env := newLedgerEnv(t)
	setCloseDate(t, env.app, "2026-03-31")
	ov := grantOverride(t, env.app, env.users.bookkeeper, time.Now().Add(time.Hour))
	ov.Set("expires_at", time.Now().Add(-time.Minute))
	if err := env.app.Save(ov); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	requireRefused(t, setStatus(env.app, env.sale(t, "2026-03-15", 100).Id, statusPosted, env.users.bookkeeper.Id),
		"closed through")
}

func TestPost_RefusedPostConsumesNoNumber(t *testing.T) {
	env := newLedgerEnv(t)
	bad := mkDraft(t, env.app, "2026-05-01", ln{env.checking, 100, 0}, ln{env.revenue, 0, 99})
	requireRefused(t, setStatus(env.app, bad.Id, statusPosted, ""), "do not equal credits")
	if got := mustPost(t, env.app, env.sale(t, "2026-05-01", 100).Id, "").GetString("number"); got != "1" {
		t.Fatalf("number = %s, want 1", got)
	}
}

func TestPost_ConcurrentPostsGetDistinctContiguousNumbers(t *testing.T) {
	env := newLedgerEnv(t)
	const n = 10
	ids := make([]string, n)
	for i := range ids {
		ids[i] = env.sale(t, "2026-05-01", 100*(i+1)).Id
	}
	var wg sync.WaitGroup
	for _, id := range ids {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			if err := setStatus(env.app, id, statusPosted, ""); err != nil {
				t.Errorf("post %s: %v", id, err)
			}
		}(id)
	}
	wg.Wait()
	seen := map[int]bool{}
	for _, id := range ids {
		seq := reload(t, env.app, "books_journal_entries", id).GetInt("sequence")
		if seen[seq] {
			t.Errorf("sequence %d issued twice", seq)
		}
		seen[seq] = true
	}
	for i := 1; i <= n; i++ {
		if !seen[i] {
			t.Errorf("sequence %d skipped", i)
		}
	}
	requireNoDrift(t, env.app)
}

func TestCreate_EntriesStartAsDrafts(t *testing.T) {
	env := newLedgerEnv(t)
	col, _ := env.app.FindCollectionByNameOrId("books_journal_entries")
	cases := []struct {
		name   string
		fields map[string]any
		want   string
	}{
		{"created posted", map[string]any{"status": "posted", "origin": "manual"}, "starts as a draft"},
		{"a reversal naming nothing", map[string]any{"status": "draft", "origin": "reversal"}, "must name the entry it reverses"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := core.NewRecord(col)
			r.Load(map[string]any{"date": "2026-05-01", "doc_type": "journal"})
			r.Load(tc.fields)
			requireRefused(t, env.app.Save(r), tc.want)
		})
	}
}

func TestDraftEdit_ServerFieldsAreRefused(t *testing.T) {
	env := newLedgerEnv(t)
	draft := env.sale(t, "2026-05-01", 100)
	draft.Set("number", "99")
	requireRefused(t, env.app.Save(draft), "Books sets these fields itself: number")
	draft = reload(t, env.app, "books_journal_entries", draft.Id)
	draft.Set("memo", "Fixed memo")
	draft.Set("date", "2026-05-02")
	if err := env.app.Save(draft); err != nil {
		t.Fatalf("edit a draft: %v", err)
	}
}

func TestPost_EachMonthKeepsItsOwnBalanceRow(t *testing.T) {
	env := newLedgerEnv(t)
	mustPost(t, env.app, env.sale(t, "2026-04-30", 300).Id, "")
	mustPost(t, env.app, env.sale(t, "2026-05-01", 500).Id, "")
	rent := mkDraft(t, env.app, "2026-05-31", ln{env.rent, 200, 0}, ln{env.checking, 0, 200})
	mustPost(t, env.app, rent.Id, "")

	cases := []struct {
		account       *core.Record
		period        string
		debit, credit int
	}{
		{env.checking, "2026-04", 300, 0},
		{env.checking, "2026-05", 500, 200},
		{env.revenue, "2026-04", 0, 300},
		{env.revenue, "2026-05", 0, 500},
		{env.rent, "2026-04", 0, 0},
		{env.rent, "2026-05", 200, 0},
	}
	for _, tc := range cases {
		if d, c := balanceOf(t, env.app, tc.account, tc.period); d != tc.debit || c != tc.credit {
			t.Errorf("%s %s = %d/%d, want %d/%d", tc.account.GetString("name"), tc.period, d, c, tc.debit, tc.credit)
		}
	}
	requireNoDrift(t, env.app)
	if fixed, err := rebuildBalances(env.app); err != nil || fixed != 0 {
		t.Fatalf("rebuild after posting fixed %d, err %v; want 0", fixed, err)
	}
}

func TestPost_RefusedPostLeavesTheLinesUnstamped(t *testing.T) {
	env := newLedgerEnv(t)
	bad := mkDraft(t, env.app, "2026-05-01", ln{env.checking, 100, 0}, ln{env.revenue, 0, 99})
	requireRefused(t, setStatus(env.app, bad.Id, statusPosted, ""), "out of balance by 0.01")
	lines, err := entryLines(env.app, bad.Id)
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range lines {
		if l.GetBool("posted") || l.GetString("date") != "" {
			t.Errorf("a refused post stamped a line: %v", l.PublicExport())
		}
	}
	if got := reload(t, env.app, "books_journal_entries", bad.Id); got.GetString("number") != "" || got.GetInt("total") != 0 {
		t.Errorf("a refused post numbered the entry: %v", got.PublicExport())
	}
}

func TestFormatMinor(t *testing.T) {
	for n, want := range map[int]string{0: "0.00", 5: "0.05", 123456: "1234.56", -1: "-0.01", -1050: "-10.50"} {
		if got := formatMinor(n); got != want {
			t.Errorf("formatMinor(%d) = %s, want %s", n, got, want)
		}
	}
}
