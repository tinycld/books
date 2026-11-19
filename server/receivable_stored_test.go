package books

import (
	"sort"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// storedRow is one books_receivable_items row.
type storedRow struct {
	ID       string `db:"id"`
	Source   string `db:"source"`
	Customer string `db:"customer"`
	Entry    string `db:"entry"`
	Date     string `db:"date"`
	Debit    int    `db:"debit"`
	Credit   int    `db:"credit"`
	Item     string `db:"item"`
	Kind     string `db:"item_kind"`
	Number   string `db:"item_number"`
	Seq      int    `db:"item_seq"`
	Due      string `db:"due_date"`
	Currency string `db:"currency"`
	Settled  string `db:"settled"`
}

func storedRows(t testing.TB, app core.App) []storedRow {
	t.Helper()
	var rows []storedRow
	err := app.DB().NewQuery("SELECT id, source, customer, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date, settled FROM books_receivable_items ORDER BY id").All(&rows)
	if err != nil {
		t.Fatalf("read the stored receivable rows: %v", err)
	}
	return rows
}

// requireRebuilt rebuilds the stored rows and fails when they then drift.
func requireRebuilt(t testing.TB, app core.App) {
	t.Helper()
	if err := app.RunInTransaction(rebuildReceivables); err != nil {
		t.Fatalf("rebuild the receivable rows: %v", err)
	}
	requireNoReceivableDrift(t, app)
}

func requireNoReceivableDrift(t testing.TB, app core.App) {
	t.Helper()
	drifts, err := verifyReceivables(app)
	if err != nil {
		t.Fatalf("verify receivables: %v", err)
	}
	if len(drifts) > 0 {
		t.Fatalf("receivable rows drifted from the book: %+v", drifts)
	}
}

// settledOf is the one settled day of the stored rows of item.
func settledOf(t testing.TB, app core.App, item string) string {
	t.Helper()
	days := map[string]bool{}
	for _, r := range storedRows(t, app) {
		if r.Item == item {
			days[r.Settled] = true
		}
	}
	if len(days) != 1 {
		t.Fatalf("item %s has settled days %v, want exactly one", item, days)
	}
	for day := range days {
		return day
	}
	return ""
}

// The rebuild stores exactly the rows of the two views.
func TestReceivableRebuildMatchesViews(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	arPayment(t, b, c, "2026-09-10", 70000, map[string]int{inv.Id: 55000})
	arCreditMemo(t, b, c, "2026-10-20", 63500)
	arJournalPrefix(t, b)
	postJournal(t, b.app, "", "2026-09-01", "A/R adjustment",
		jnLine{account: b.receivable, debit: 12000, position: 0},
		jnLine{account: b.income, credit: 12000, position: 1})
	requireRebuilt(t, b.app)

	want := allRows(t, b.app)
	sort.Slice(want, func(i, j int) bool { return want[i].id < want[j].id })
	got := storedRows(t, b.app)
	if len(got) != len(want) || len(got) != 5 {
		t.Fatalf("stored %d rows, the views give %d, want 5", len(got), len(want))
	}
	for i, w := range want {
		g := got[i]
		if g.ID != w.id || g.Customer != w.customer || g.Entry != w.entry || g.Date != w.date ||
			g.Debit != w.debit || g.Credit != w.credit || g.Item != w.item || g.Currency != w.currency ||
			g.Kind != w.kind || g.Number != w.number || g.Seq != w.seq || g.Due != w.due {
			t.Errorf("stored row %d = %+v, the view row is %+v", i, g, w)
		}
	}
}

// settled is the day a customer's item reaches zero for good.
func TestReceivableSettled(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	open := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	arPayment(t, b, c, "2026-09-10", 40000, map[string]int{open.Id: 40000})
	paid := arInvoice(t, b, c, "2026-08-05", "2026-09-04", 50000)
	arPayment(t, b, c, "2026-09-11", 20000, map[string]int{paid.Id: 20000})
	arPayment(t, b, c, "2026-09-20", 30000, map[string]int{paid.Id: 30000})
	sameDay := arInvoice(t, b, c, "2026-08-06", "2026-09-05", 7000)
	arPayment(t, b, c, "2026-08-06", 7000, map[string]int{sameDay.Id: 7000})
	requireRebuilt(t, b.app)

	for name, tc := range map[string]struct{ item, want string }{
		"part paid: open":                     {open.Id, receivableOpen},
		"paid in two parts: the last payment": {paid.Id, "2026-09-20"},
		"paid on its own day: that day":       {sameDay.Id, "2026-08-06"},
	} {
		if got := settledOf(t, b.app, tc.item); got != tc.want {
			t.Errorf("%s: settled = %q, want %q", name, got, tc.want)
		}
	}
}

// A payment's void opens the invoice again: zero for a time is not settled.
func TestReceivableSettledReopens(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	pay := arPayment(t, b, c, "2026-09-10", 100000, map[string]int{inv.Id: 100000})
	requireRebuilt(t, b.app)
	if got := settledOf(t, b.app, inv.Id); got != "2026-09-10" {
		t.Fatalf("paid in full: settled = %q, want 2026-09-10", got)
	}
	pay.Set("status", statusVoid)
	if err := b.app.Save(pay); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	requireRebuilt(t, b.app)
	if got := settledOf(t, b.app, inv.Id); got != receivableOpen {
		t.Errorf("after the payment's void: settled = %q, want open", got)
	}
}

// verifyReceivables names a stale row, a missing row and a wrong settled day.
func TestVerifyReceivablesFindsDrift(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	arPayment(t, b, c, "2026-09-10", 100000, map[string]int{inv.Id: 100000})
	requireRebuilt(t, b.app)
	rows := storedRows(t, b.app)
	exec := func(sql string) {
		t.Helper()
		if _, err := b.app.DB().NewQuery(sql).Execute(); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	exec("UPDATE books_receivable_items SET debit = debit + 1 WHERE id = '" + rows[0].ID + "'")
	exec("DELETE FROM books_receivable_items WHERE id = '" + rows[1].ID + "'")
	drifts, err := verifyReceivables(b.app)
	if err != nil {
		t.Fatalf("verify receivables: %v", err)
	}
	problems := map[string]int{}
	for _, d := range drifts {
		problems[d.Problem]++
	}
	if problems["stale"] != 1 || problems["missing"] != 2 || problems["settled"] == 0 {
		t.Fatalf("drifts = %+v, want 1 stale, 2 missing and a settled drift", drifts)
	}
	requireRebuilt(t, b.app)
}
