package books

import (
	"fmt"
	"testing"

	"github.com/pocketbase/dbx"
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

// The hooks and the rebuild store the same rows: one per Accounts receivable
// line and one per application of a posted payment, each given to its item.
func TestReceivableRebuildStoresRows(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	pay := arPayment(t, b, c, "2026-09-10", 70000, map[string]int{inv.Id: 55000})
	memo := arCreditMemo(t, b, c, "2026-10-20", 63500)
	arJournalPrefix(t, b)
	je := postJournal(t, b.app, "", "2026-09-01", "A/R adjustment",
		jnLine{account: b.receivable, debit: 12000, position: 0},
		jnLine{account: b.income, credit: 12000, position: 1})
	line := arLineOf(t, b, je.Id)

	type row struct {
		Customer, Entry, Date string
		Debit, Credit         int
		Kind, Due, Settled    string
	}
	// By source and item: every item here is open.
	want := map[string]row{
		"line " + inv.Id:        {c.Id, inv.GetString("entry"), "2026-08-04", 100000, 0, "invoice", "2026-09-03", receivableOpen},
		"application " + inv.Id: {c.Id, pay.GetString("entry"), "2026-09-10", 0, 55000, "invoice", "2026-09-03", receivableOpen},
		"line " + pay.Id:        {c.Id, pay.GetString("entry"), "2026-09-10", 0, 15000, "payment", "2026-09-10", receivableOpen},
		"line " + memo.Id:       {c.Id, memo.GetString("entry"), "2026-10-20", 0, 63500, "credit_memo", "2026-10-20", receivableOpen},
		"line " + line.Id:       {"", je.Id, "2026-09-01", 12000, 0, "entry", "2026-09-01", receivableOpen},
	}
	check := func(when string) {
		t.Helper()
		got := storedRows(t, b.app)
		if len(got) != len(want) {
			t.Fatalf("%s: stored %d rows, want %d: %+v", when, len(got), len(want), got)
		}
		for _, g := range got {
			key := g.Source + " " + g.Item
			w, ok := want[key]
			if !ok {
				t.Errorf("%s: a stored row of %q, want one of the five items: %+v", when, key, g)
				continue
			}
			if (row{g.Customer, g.Entry, g.Date, g.Debit, g.Credit, g.Kind, g.Due, g.Settled}) != w {
				t.Errorf("%s: the row of %q = %+v, want %+v", when, key, g, w)
			}
			if g.Number == "" || g.Seq == 0 || g.Currency == "" {
				t.Errorf("%s: the row of %q has no number, sequence or currency: %+v", when, key, g)
			}
		}
	}
	check("after the posts")
	requireRebuilt(t, b.app)
	check("after a rebuild")
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

// The route answers with at most maxReceivableDriftsReported rows and the full
// count, as for the journal lines and the cash-basis rows.
func TestReceivableDriftReport_IsCapped(t *testing.T) {
	drifts := make([]ReceivableDrift, maxReceivableDriftsReported+2)
	for i := range drifts {
		drifts[i].ID = fmt.Sprintf("row%03d", i)
	}
	listed, count := receivableDriftReport(drifts)
	if len(listed) != maxReceivableDriftsReported || count != maxReceivableDriftsReported+2 {
		t.Fatalf("listed %d, count %d; want %d and %d", len(listed), count, maxReceivableDriftsReported, maxReceivableDriftsReported+2)
	}
	if listed[0].ID != "row000" {
		t.Errorf("first listed = %q, want the first drift", listed[0].ID)
	}
	few, n := receivableDriftReport(drifts[:3])
	if len(few) != 3 || n != 3 {
		t.Fatalf("listed %d, count %d; want 3 and 3", len(few), n)
	}
}

// settleReceivables with a pair list fixes only the rows of those customers and
// items (a blank customer is the rows with no customer), returns how many rows
// it changed, and walks a list longer than receivablePairChunk in chunks.
// It is a pin: the code was right when the test was written, so it passed on
// its first run.
func TestSettleReceivablesSubset(t *testing.T) {
	b := newARBook(t)
	c1 := b.docs.customer
	c2 := mkCustomer(t, b.app, "Second Customer", "")
	for _, c := range []*core.Record{c1, c2} {
		inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
		arPayment(t, b, c, "2026-09-10", 100000, map[string]int{inv.Id: 100000})
	}
	arJournalPrefix(t, b)
	postJournal(t, b.app, "", "2026-09-01", "A/R with no customer",
		jnLine{account: b.receivable, debit: 12000, position: 0},
		jnLine{account: b.income, credit: 12000, position: 1})
	requireRebuilt(t, b.app)

	count := map[string]int64{}
	for _, r := range storedRows(t, b.app) {
		count[r.Customer]++
	}
	if count[c1.Id] == 0 || count[c2.Id] == 0 || count[""] != 1 {
		t.Fatalf("rows by customer = %v, want rows for both customers and one with none", count)
	}

	corrupt := func() {
		t.Helper()
		if _, err := b.app.DB().NewQuery("UPDATE books_receivable_items SET settled = '1999-01-01'").Execute(); err != nil {
			t.Fatalf("corrupt the settled days: %v", err)
		}
	}
	wrong := func(customer string) int64 {
		t.Helper()
		var n int64
		err := b.app.DB().NewQuery("SELECT COUNT(*) FROM books_receivable_items WHERE settled = '1999-01-01' AND customer = {:c}").
			Bind(dbx.Params{"c": customer}).Row(&n)
		if err != nil {
			t.Fatalf("count the wrong rows: %v", err)
		}
		return n
	}
	settle := func(pairs []receivablePair) int64 {
		t.Helper()
		var n int64
		err := b.app.RunInTransaction(func(tx core.App) error {
			var err error
			n, err = settleReceivables(tx, pairs)
			return err
		})
		if err != nil {
			t.Fatalf("settle %d pairs: %v", len(pairs), err)
		}
		return n
	}
	// pairsOf lists each customer and item of the stored rows of customer.
	pairsOf := func(customer string) []receivablePair {
		t.Helper()
		seen := map[receivablePair]bool{}
		var pairs []receivablePair
		for _, r := range storedRows(t, b.app) {
			if p := (receivablePair{r.Customer, r.Item}); r.Customer == customer && !seen[p] {
				seen[p] = true
				pairs = append(pairs, p)
			}
		}
		return pairs
	}

	corrupt()
	if n := settle(pairsOf(c1.Id)); n != count[c1.Id] {
		t.Errorf("settle one customer changed %d rows, want %d", n, count[c1.Id])
	}
	if wrong(c1.Id) != 0 || wrong(c2.Id) != count[c2.Id] || wrong("") != 1 {
		t.Errorf("after one customer: wrong rows c1=%d c2=%d none=%d, want 0, %d, 1", wrong(c1.Id), wrong(c2.Id), wrong(""), count[c2.Id])
	}

	if n := settle(pairsOf("")); n != 1 {
		t.Errorf("settle the blank id changed %d rows, want 1", n)
	}
	if wrong("") != 0 || wrong(c2.Id) != count[c2.Id] {
		t.Errorf("after the blank id: wrong rows none=%d c2=%d, want 0, %d", wrong(""), wrong(c2.Id), count[c2.Id])
	}

	// The real pairs sit at both ends of a list of receivablePairChunk+1 pairs,
	// so they fall in two chunks.
	corrupt()
	real1, real2 := pairsOf(c1.Id), pairsOf(c2.Id)
	pairs := make([]receivablePair, receivablePairChunk+len(real1)+len(real2))
	for i := range pairs {
		pairs[i] = receivablePair{fmt.Sprintf("absent%09d", i), "none"}
	}
	copy(pairs, real2)
	copy(pairs[len(pairs)-len(real1):], real1)
	if n := settle(pairs); n != count[c1.Id]+count[c2.Id] {
		t.Errorf("settle %d pairs changed %d rows, want %d", len(pairs), n, count[c1.Id]+count[c2.Id])
	}
	if wrong(c1.Id) != 0 || wrong(c2.Id) != 0 || wrong("") != 1 {
		t.Errorf("after the long list: wrong rows c1=%d c2=%d none=%d, want 0, 0, 1", wrong(c1.Id), wrong(c2.Id), wrong(""))
	}
	settle(pairsOf(""))
	requireNoReceivableDrift(t, b.app)
}
