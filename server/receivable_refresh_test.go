package books

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
)

// Each post keeps the stored rows in step: no rebuild runs in this test.
func TestReceivableRefreshOnPost(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	requireNoReceivableDrift(t, b.app)
	pay := arPayment(t, b, c, "2026-09-10", 70000, map[string]int{inv.Id: 55000})
	requireNoReceivableDrift(t, b.app)
	arCreditMemo(t, b, c, "2026-10-20", 63500)
	arJournalPrefix(t, b)
	postJournal(t, b.app, "", "2026-09-01", "A/R adjustment",
		jnLine{account: b.receivable, debit: 12000, position: 0},
		jnLine{account: b.income, credit: 12000, position: 1})
	requireNoReceivableDrift(t, b.app)

	rows := storedRows(t, b.app)
	if len(rows) != 5 {
		t.Fatalf("stored %d rows, want 5 (invoice, payment, application, credit memo, journal line): %+v", len(rows), rows)
	}
	for _, r := range rows {
		if r.Entry == pay.GetString("entry") && r.Source == receivableSourceLine && r.Credit != 15000 {
			t.Errorf("the payment's own line has credit %d, want its unapplied 15000", r.Credit)
		}
	}
	if got := settledOf(t, b.app, inv.Id); got != receivableOpen {
		t.Errorf("a part-paid invoice has settled %q, want open", got)
	}
}

// A payment in full settles the invoice on the payment's day; the payment's
// void takes its applications away and opens the invoice again.
func TestReceivableRefreshOnVoid(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	inv := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	pay := arPayment(t, b, c, "2026-09-10", 100000, map[string]int{inv.Id: 100000})
	requireNoReceivableDrift(t, b.app)
	if got := settledOf(t, b.app, inv.Id); got != "2026-09-10" {
		t.Fatalf("paid in full: settled = %q, want 2026-09-10", got)
	}
	pay.Set("status", statusVoid)
	if err := b.app.Save(pay); err != nil {
		t.Fatalf("void the payment: %v", err)
	}
	requireNoReceivableDrift(t, b.app)
	if got := settledOf(t, b.app, inv.Id); got != receivableOpen {
		t.Errorf("after the payment's void: settled = %q, want open", got)
	}
	for _, r := range storedRows(t, b.app) {
		if r.Source == receivableSourceApplication {
			t.Errorf("a void payment still has an application row: %+v", r)
		}
	}
}

// settled has no customer rule: each paid item of a sub-customer settles on
// its day, and a change of the customer's parent moves no settled day.
func TestReceivableSettledIgnoresParent(t *testing.T) {
	b := newARBook(t)
	parent := mkCustomer(t, b.app, "Keeper Parent", "")
	sub := mkCustomer(t, b.app, "Keeper sub", parent.Id)
	first := arInvoice(t, b, sub, "2026-08-04", "2026-09-03", 7000)
	arPayment(t, b, sub, "2026-09-10", 7000, map[string]int{first.Id: 7000})
	requireNoReceivableDrift(t, b.app)
	if got := settledOf(t, b.app, first.Id); got != "2026-09-10" {
		t.Errorf("a sub-customer's paid item: settled = %q, want 2026-09-10", got)
	}

	sub, err := b.app.FindRecordById("books_customers", sub.Id)
	if err != nil {
		t.Fatal(err)
	}
	sub.Set("parent", "")
	if err := b.app.Save(sub); err != nil {
		t.Fatalf("take the sub-customer out of its family: %v", err)
	}
	requireNoReceivableDrift(t, b.app)
	if got := settledOf(t, b.app, first.Id); got != "2026-09-10" {
		t.Errorf("after the customer left its parent: settled = %q, want 2026-09-10 still", got)
	}
}

// A refresh settles the items of the rows it changed, not every item of their
// customer: a wrong settled day on another open item stays until a rebuild.
func TestReceivableRefreshSettlesOnlyTouchedItems(t *testing.T) {
	b := newARBook(t)
	c := b.docs.customer
	touched := arInvoice(t, b, c, "2026-08-04", "2026-09-03", 100000)
	other := arInvoice(t, b, c, "2026-08-05", "2026-09-04", 50000)
	requireNoReceivableDrift(t, b.app)
	if _, err := b.app.DB().NewQuery("UPDATE books_receivable_items SET settled = '1999-01-01' WHERE item = {:item}").
		Bind(dbx.Params{"item": other.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	arPayment(t, b, c, "2026-09-10", 100000, map[string]int{touched.Id: 100000})
	if got := settledOf(t, b.app, touched.Id); got != "2026-09-10" {
		t.Errorf("the paid invoice has settled %q, want 2026-09-10", got)
	}
	if got := settledOf(t, b.app, other.Id); got != "1999-01-01" {
		t.Errorf("an item the refresh did not touch has settled %q, want its stored 1999-01-01 left alone", got)
	}
}

// A refresh outside a transaction could commit without the write it follows.
func TestReceivableRefreshNeedsTransaction(t *testing.T) {
	b := newARBook(t)
	inv := arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 100000)
	if err := refreshReceivableEntry(b.app, inv.GetString("entry")); err == nil {
		t.Fatal("a refresh outside a transaction passed, want a refusal")
	}
	requireNoReceivableDrift(t, b.app)
}

// Nobody writes a stored row over REST, a superuser neither.
func TestReceivableItemsRefuseWrites(t *testing.T) {
	b := newARBook(t)
	arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 100000)
	row := storedRows(t, b.app)[0]
	url := "/api/collections/" + receivableItemsCollection + "/records/" + row.ID
	super, reader := tokenFor(t, mkSuperuser(t, b.app)), tokenFor(t, b.reader)
	apiSeq(t, b.app,
		apiReq{method: http.MethodPost, url: "/api/collections/" + receivableItemsCollection + "/records", token: super, body: `{"source":"line","debit":1}`, want: http.StatusBadRequest, content: []string{msgReceivableItemsReadOnly}},
		apiReq{method: http.MethodPatch, url: url, token: super, body: `{"debit":1}`, want: http.StatusBadRequest, content: []string{msgReceivableItemsReadOnly}},
		apiReq{method: http.MethodDelete, url: url, token: super, want: http.StatusBadRequest, content: []string{msgReceivableItemsReadOnly}},
		apiReq{method: http.MethodDelete, url: url, token: reader, want: http.StatusForbidden},
		apiReq{method: http.MethodGet, url: url, token: reader, want: http.StatusOK, content: []string{`"debit":100000`}},
	)
	requireNoReceivableDrift(t, b.app)
}

// The rebuild route lists the stored rows that drifted and repairs them.
func TestRebuildRoute_RepairsReceivables(t *testing.T) {
	b := newARBook(t)
	arInvoice(t, b, b.docs.customer, "2026-08-04", "2026-09-03", 100000)
	row := storedRows(t, b.app)[0]
	if _, err := b.app.DB().NewQuery("UPDATE books_receivable_items SET debit = 1 WHERE id = {:id}").Bind(map[string]any{"id": row.ID}).Execute(); err != nil {
		t.Fatal(err)
	}
	apiReq{
		method: http.MethodPost, url: "/api/books/balances/rebuild",
		token: tokenFor(t, b.docs.users.admin), want: http.StatusOK, before: bindBalanceRoutes,
		content: []string{`"receivableDrifts":[{"id":"` + row.ID + `"`, `"problem":"missing"`, `"problem":"stale"`, `"receivableDriftCount":2`},
	}.run(t, b.app)
	requireNoReceivableDrift(t, b.app)
}

// An invoice correction moves the applications of the live payments to the
// correction before the correction has its entry: the rows follow.
func TestReceivableRefreshOnInvoiceCorrection(t *testing.T) {
	pe := newPaymentEnv(t)
	inv, _ := pe.paidInvoice(t)
	draft := pe.correctionOf(t, inv, pe.customer, 45000)
	mustPostInvoice(t, pe.app, draft.Id, pe.users.bookkeeper.Id)
	requireNoReceivableDrift(t, pe.app)
	applications := 0
	for _, r := range storedRows(t, pe.app) {
		if r.Source != receivableSourceApplication {
			continue
		}
		applications++
		if r.Item != draft.Id {
			t.Errorf("an application row names item %s, want the correction %s (the original is %s)", r.Item, draft.Id, inv.Id)
		}
	}
	if applications == 0 {
		t.Fatal("the paid invoice's correction has no application row")
	}
}

// A refresh settles one customer and item: it must find their rows by index,
// not read the whole table inside each write transaction.
func TestReceivableSettleReadsOneItem(t *testing.T) {
	b := newARBook(t)
	var steps []struct {
		Detail string `db:"detail"`
	}
	err := b.app.DB().NewQuery("EXPLAIN QUERY PLAN " + receivableItems.settleSQL("WHERE (customer = {:c0} AND item = {:i0}) OR (customer = {:c1} AND item = {:i1})")).
		Bind(dbx.Params{"c0": b.docs.customer.Id, "i0": "x", "c1": b.docs.customer.Id, "i1": "y"}).All(&steps)
	if err != nil {
		t.Fatalf("explain the settle statement: %v", err)
	}
	if len(steps) == 0 {
		t.Fatal("the settle statement has no plan step")
	}
	for _, s := range steps {
		if strings.Contains(s.Detail, "SCAN "+receivableItemsCollection) {
			t.Errorf("the settle of one item scans the stored rows: %q", s.Detail)
		}
	}
}
