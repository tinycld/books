package books

import (
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
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

// The create rule pins Books' fields for REST. A Go caller passes no rule,
// so the create hook refuses the same fields: a draft cannot start with a
// number, a total, a poster or a close-date override.
func TestCreate_ServerFieldsOnANewDraftAreRefused(t *testing.T) {
	env := newLedgerEnv(t)
	col, _ := env.app.FindCollectionByNameOrId("books_journal_entries")
	ov := grantOverride(t, env.app, env.users.bookkeeper, time.Now().Add(time.Hour))
	now := time.Now()
	cases := map[string]any{
		"number": "7", "sequence": 7, "total": 100, "posted_at": now, "posted_by": env.users.bookkeeper.Id,
		"voided_at": now, "voided_by": env.users.bookkeeper.Id, "close_override": ov.Id,
	}
	for field, value := range cases {
		t.Run(field, func(t *testing.T) {
			r := core.NewRecord(col)
			r.Load(map[string]any{"date": "2026-05-01", "doc_type": "journal", "status": "draft", "origin": "manual"})
			r.Set(field, value)
			requireRefused(t, env.app.Save(r), "Books sets these fields itself: "+field+".")
		})
	}
}

// A close_override left on a draft by a bypass of the hooks is not the
// override of this post. A post that needs no override clears it.
func TestPost_AStaleCloseOverrideIsCleared(t *testing.T) {
	env := newLedgerEnv(t)
	ov := grantOverride(t, env.app, env.users.bookkeeper, time.Now().Add(time.Hour))
	entry := env.sale(t, "2026-05-01", 100)
	if _, err := env.app.DB().NewQuery("UPDATE books_journal_entries SET close_override = {:ov} WHERE id = {:id}").
		Bind(dbx.Params{"ov": ov.Id, "id": entry.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	posted := mustPost(t, env.app, entry.Id, env.users.bookkeeper.Id)
	if got := posted.GetString("close_override"); got != "" {
		t.Fatalf("close_override = %q after a post that needed no override", got)
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

// requireNothingPosted checks that a refused post left no trace: the entry is
// a draft with no number, its lines are unstamped, and no number was used.
func requireNothingPosted(t testing.TB, app core.App, entryID string) {
	t.Helper()
	entry := reload(t, app, "books_journal_entries", entryID)
	if entry.GetString("status") != statusDraft || entry.GetString("number") != "" || entry.GetInt("total") != 0 {
		t.Errorf("entry after a refused post: %v", entry.PublicExport())
	}
	if n := reload(t, app, "books_doc_sequences", "booksseqjournal").GetInt("next_number"); n != 1 {
		t.Errorf("next_number = %d, want 1", n)
	}
	lines, err := entryLines(app, entryID)
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range lines {
		if l.GetBool("posted") || l.GetString("date") != "" {
			t.Errorf("a refused post stamped a line: %v", l.PublicExport())
		}
	}
}

// bigSale is a balanced draft whose debit side is the given line amounts.
func (env *ledgerEnv) bigSale(t testing.TB, amounts ...int) *core.Record {
	t.Helper()
	var lines []ln
	for _, a := range amounts {
		lines = append(lines, ln{env.checking, a, 0}, ln{env.revenue, 0, a})
	}
	return mkDraft(t, env.app, "2026-05-01", lines...)
}

func repeat(n, amount int) []int {
	out := make([]int, n)
	for i := range out {
		out[i] = amount
	}
	return out
}

func TestPost_LineLimitFitsUnderTheStoredLimit(t *testing.T) {
	if maxAmount > maxStoredAmount {
		t.Fatalf("maxAmount %d is above maxStoredAmount %d", maxAmount, maxStoredAmount)
	}
	if maxStoredAmount != 1<<53-1 {
		t.Fatalf("maxStoredAmount = %d, want 2^53-1", maxStoredAmount)
	}
}

func TestPost_TotalOverTheStoredLimitIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	// Ten lines of 10^15 a side: each line is allowed, the total is not.
	entry := env.bigSale(t, repeat(10, maxAmount)...)
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, ""),
		"largest amount Books can store (90071992547409.91)")
	requireNothingPosted(t, env.app, entry.Id)
	if d, c := balanceOf(t, env.app, env.checking, "2026-05"); d != 0 || c != 0 {
		t.Errorf("a refused post moved a balance: %d/%d", d, c)
	}
}

func TestPost_BalanceRowOverTheStoredLimitIsRefused(t *testing.T) {
	env := newLedgerEnv(t)
	saveRecord(t, env.app, "books_account_balances", map[string]any{
		"account": env.checking.Id, "period": "2026-05", "debit_total": maxStoredAmount - 50, "currency": "USD",
	})
	entry := env.sale(t, "2026-05-01", 100)
	requireRefused(t, setStatus(env.app, entry.Id, statusPosted, ""),
		"Checking for 2026-05 past the largest amount Books can store (90071992547409.91)")
	requireNothingPosted(t, env.app, entry.Id)
	if d, c := balanceOf(t, env.app, env.checking, "2026-05"); d != maxStoredAmount-50 || c != 0 {
		t.Errorf("checking = %d/%d, want the seeded row unchanged", d, c)
	}
	if d, c := balanceOf(t, env.app, env.revenue, "2026-05"); d != 0 || c != 0 {
		t.Errorf("revenue = %d/%d, want no row", d, c)
	}
}

func TestPost_ExactlyAtTheStoredLimitPosts(t *testing.T) {
	env := newLedgerEnv(t)
	amounts := append(repeat(9, maxAmount), maxStoredAmount-9*maxAmount)
	posted := mustPost(t, env.app, env.bigSale(t, amounts...).Id, "")
	if posted.GetInt("total") != maxStoredAmount {
		t.Fatalf("total = %d, want %d", posted.GetInt("total"), maxStoredAmount)
	}
	if d, _ := balanceOf(t, env.app, env.checking, "2026-05"); d != maxStoredAmount {
		t.Errorf("checking debit = %d, want %d", d, maxStoredAmount)
	}
	if _, c := balanceOf(t, env.app, env.revenue, "2026-05"); c != maxStoredAmount {
		t.Errorf("revenue credit = %d, want %d", c, maxStoredAmount)
	}
	requireNoDrift(t, env.app)
}

func TestPost_ServerFieldsChangedWhilePostingAreRefused(t *testing.T) {
	env := newLedgerEnv(t)
	entry := reload(t, env.app, "books_journal_entries", env.sale(t, "2026-05-01", 100).Id)
	entry.Set("status", statusPosted)
	entry.Set("created_by", env.users.admin.Id)
	requireRefused(t, env.app.Save(entry), "Books sets these fields itself: created_by")
	requireNothingPosted(t, env.app, entry.Id)
}

// These rows cannot be made through the hooks, which refuse them on create;
// raw SQL stands in for a row written before a rule existed.
func TestPost_RowsTheHooksWouldRefuseAreCaughtAtPosting(t *testing.T) {
	cases := []struct {
		name  string
		query func(env *ledgerEnv, line *core.Record) (string, dbx.Params)
		want  string
	}{
		{"a line in another currency", func(_ *ledgerEnv, line *core.Record) (string, dbx.Params) {
			return "UPDATE books_journal_lines SET currency = 'EUR' WHERE id = {:id}", dbx.Params{"id": line.Id}
		}, "Line 2: its currency does not match the entry (USD)"},
		{"an account in another currency", func(env *ledgerEnv, _ *core.Record) (string, dbx.Params) {
			return "UPDATE books_accounts SET currency = 'EUR' WHERE id = {:id}", dbx.Params{"id": env.revenue.Id}
		}, "Line 2: its currency does not match the entry (USD)"},
		{"a line whose account is gone", func(_ *ledgerEnv, line *core.Record) (string, dbx.Params) {
			return "UPDATE books_journal_lines SET account = 'missingacct0001' WHERE id = {:id}", dbx.Params{"id": line.Id}
		}, "Line 2: the account does not exist"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := newLedgerEnv(t)
			entry := env.sale(t, "2026-05-01", 100)
			lines, err := entryLines(env.app, entry.Id)
			if err != nil {
				t.Fatal(err)
			}
			sql, params := tc.query(env, lines[1])
			if _, err := env.app.DB().NewQuery(sql).Bind(params).Execute(); err != nil {
				t.Fatal(err)
			}
			requireRefused(t, setStatus(env.app, entry.Id, statusPosted, ""), tc.want)
			requireNothingPosted(t, env.app, entry.Id)
		})
	}
}

func TestPost_AFailureAfterTheWritesRollsThemBack(t *testing.T) {
	env := newLedgerEnv(t)
	entry := reload(t, env.app, "books_journal_entries", env.sale(t, "2026-05-01", 100).Id)
	// The hooks accept the memo; PocketBase's field validation, which runs
	// after the posting writes, refuses it.
	entry.Set("memo", strings.Repeat("x", 5000))
	entry.Set("status", statusPosted)
	requireRefused(t, env.app.Save(entry), "memo")
	requireNothingPosted(t, env.app, entry.Id)
	if d, c := balanceOf(t, env.app, env.checking, "2026-05"); d != 0 || c != 0 {
		t.Errorf("a rolled-back post moved a balance: %d/%d", d, c)
	}
	requireNoDrift(t, env.app)
}
