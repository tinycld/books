package books

import (
	"errors"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Each write keeps the stored payable rows in step: no rebuild runs in this
// test. The count after each write proves the write reached the table.
func TestPayableRefreshOnEachWrite(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	step := func(name string, rows int) {
		t.Helper()
		requireNoPayableDrift(t, b.app)
		if got := apRows(t, b.app, ""); len(got) != rows {
			t.Fatalf("after %s: %d stored rows, want %d: %+v", name, len(got), rows, got)
		}
	}

	bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
	step("the bill's post", 1)
	pay := apPayBills(t, b, v, "2026-09-25", map[string]int{bill.Id: 13725})
	step("the bill payment's post", 2)
	if err := voidBillPaymentAs(b.app, pay.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}
	step("the bill payment's void", 1)
	credit := apVendorCredit(t, b, v, "2026-10-06", 20000)
	step("the vendor credit's post", 2)
	application := apApply(t, b, credit, bill, "2026-10-20", 12000)
	step("the application", 4)
	if a := b.removeAs(t, b.users.bookkeeper, application); a.status != http.StatusNoContent {
		t.Fatalf("remove the application answered %d; body: %s", a.status, a.body)
	}
	step("the application's delete", 2)
	refund := apRefund(t, b, v, "2026-10-25", map[string]int{credit.Id: 5000})
	step("the vendor refund's post", 3)
	if err := voidRefundAs(b.app, refund.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the refund: %v", err)
	}
	step("the vendor refund's void", 2)
	apJournal(t, b, "2026-09-01", v, 0, 31000)
	step("the journal entry's post", 3)
}

// A write that fails after the bill's entry is written takes its stored rows
// with it: the refresh ran inside the write's transaction.
func TestPayableRefreshRollsBackWithItsWrite(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	stop := errors.New("stop after the post")
	inside := -1
	err := b.app.RunInTransaction(func(tx core.App) error {
		bill := mkBill(t, tx, v, map[string]any{"date": "2026-08-20", "due_date": "2026-09-19"})
		mkBillLine(t, tx, bill, 0, accountLine(b.expense, 86000))
		if err := postBillAs(tx, bill.Id, b.users.bookkeeper.Id); err != nil {
			t.Fatalf("post the bill inside the transaction: %v", err)
		}
		inside = len(apRows(t, tx, ""))
		return stop
	})
	if !errors.Is(err, stop) {
		t.Fatalf("the transaction returned %v, want the test's error", err)
	}
	if inside != 1 {
		t.Errorf("inside the transaction the bill's post stored %d rows, want 1", inside)
	}
	if rows := apRows(t, b.app, ""); len(rows) != 0 {
		t.Errorf("after the rollback %d stored rows remain, want 0: %+v", len(rows), rows)
	}
	requireNoPayableDrift(t, b.app)
}

// A refresh outside a transaction could commit without the write it follows.
func TestPayableRefreshNeedsTransaction(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
	err := refreshPayableEntry(b.app, bill.GetString("entry"))
	if err == nil {
		t.Fatal("a refresh outside a transaction passed, want a refusal")
	}
	if want := "books: payable rows are refreshed only inside the transaction of the write"; err.Error() != want {
		t.Errorf("refusal = %q, want %q", err.Error(), want)
	}
	requireNoPayableDrift(t, b.app)
}

// Nobody writes a stored row over REST, a superuser neither.
func TestPayableItemsRefuseWrites(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
	row := apOne(t, "the bill's rows", apRows(t, b.app, ""))
	rows := "/api/collections/" + payableItemsCollection + "/records"
	super := mkSuperuser(t, b.app)
	for _, c := range []struct {
		name, method, url, body string
	}{
		{"create", http.MethodPost, rows, `{"source":"line","entry":"` + bill.GetString("entry") + `","credit":1}`},
		{"update", http.MethodPatch, rows + "/" + row.id, `{"credit":1}`},
		{"delete", http.MethodDelete, rows + "/" + row.id, ""},
	} {
		status, body := b.rest(t).send(t, super, c.method, c.url, c.body)
		if status != http.StatusBadRequest {
			t.Errorf("a superuser's %s answered %d, want 400; body: %s", c.name, status, body)
			continue
		}
		message, _ := restAnswer{status: status, body: body}.refusal(t)
		if message != msgPayableItemsReadOnly {
			t.Errorf("a superuser's %s refusal = %q, want %q", c.name, message, msgPayableItemsReadOnly)
		}
	}
	if got := apRows(t, b.app, ""); len(got) != 1 || got[0] != row {
		t.Errorf("after the refused writes the stored rows = %+v, want only %+v", got, row)
	}
	requireNoPayableDrift(t, b.app)
}

// A refresh settles the items of the rows it changed, not every item of the
// book: every row of another vendor or bill keeps its stored settled day, a
// wrong one too, until a rebuild.
func TestPayableRefreshSettlesOnlyTouchedItems(t *testing.T) {
	b := newAPBook(t)
	harbor := apVendor(t, b, "Harbor Freight Logistics")
	cascade := apVendor(t, b, "Cascade Fuel & Fleet")
	touched := apBill(t, b, harbor, "2026-08-20", "2026-09-19", 40000)
	other := apBill(t, b, harbor, "2026-08-21", "2026-09-20", 50000)
	elsewhere := apBill(t, b, cascade, "2026-08-22", "2026-09-21", 60000)
	requireNoPayableDrift(t, b.app)
	if _, err := b.app.DB().NewQuery("UPDATE books_payable_items SET settled = '1999-01-01' WHERE item = {:item}").
		Bind(dbx.Params{"item": other.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	before := map[string]apRow{}
	for _, r := range apRows(t, b.app, "") {
		if r.item != touched.Id {
			before[r.id] = r
		}
	}
	if len(before) != 2 {
		t.Fatalf("rows of the other bills = %+v, want 2", before)
	}

	apPayBills(t, b, harbor, "2026-09-25", map[string]int{touched.Id: 40000})
	if got := apSettledOf(t, b.app, touched.Id); got != "2026-09-25" {
		t.Errorf("the paid bill has settled %q, want 2026-09-25", got)
	}
	after := map[string]apRow{}
	for _, r := range apRows(t, b.app, "") {
		if r.item != touched.Id {
			after[r.id] = r
		}
	}
	if len(after) != len(before) {
		t.Errorf("rows of the other bills after the payment = %+v, want %+v", after, before)
	}
	for id, was := range before {
		if now, ok := after[id]; !ok || now != was {
			t.Errorf("row %s of an item the payment did not touch changed:\nbefore %+v\nafter  %+v", id, was, now)
		}
	}
	if got := apSettledOf(t, b.app, elsewhere.Id); got != openItemDay {
		t.Errorf("another vendor's bill has settled %q, want %s", got, openItemDay)
	}
}

// One journal entry with an Accounts receivable line and an Accounts payable
// line: the one entry hook refreshes both tables.
func TestEntryRefreshKeepsBothTables(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	c := mkCustomer(t, b.app, "Aspen Ridge Dental", "")
	entry := postJournal(t, b.app, "", "2026-09-01", "A/R and A/P",
		jnLine{account: b.receivable1100, debit: 25000, position: 0, customer: c.Id},
		jnLine{account: b.payable, credit: 25000, position: 1, vendor: v.Id})

	receivable := 0
	for _, r := range storedRows(t, b.app) {
		if r.Entry == entry.Id {
			receivable++
		}
	}
	if receivable != 1 {
		t.Errorf("the entry stored %d receivable rows, want 1", receivable)
	}
	payable := apOfEntry(apRows(t, b.app, ""), entry.Id)
	if len(payable) != 1 || payable[0].credit != 25000 || payable[0].vendor != v.Id {
		t.Errorf("the entry's payable rows = %+v, want one of credit 25000 for the vendor", payable)
	}
	requireNoPayableDrift(t, b.app)
	requireNoReceivableDrift(t, b.app)
}

// The rebuild route lists the stored payable rows that drifted, beside the
// receivable ones, and repairs them.
func TestRebuildRoute_RepairsPayables(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	gone := apBill(t, b, v, "2026-08-20", "2026-09-19", 40000)
	wrong := apBill(t, b, v, "2026-08-21", "2026-09-20", 50000)
	goneRow := apOne(t, "the first bill's rows", apOfItem(apRows(t, b.app, ""), gone.Id))
	wrongRow := apOne(t, "the second bill's rows", apOfItem(apRows(t, b.app, ""), wrong.Id))
	for _, sql := range []string{
		"DELETE FROM books_payable_items WHERE id = '" + goneRow.id + "'",
		"INSERT INTO books_payable_items (id, source, vendor, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date, settled) " +
			"VALUES ('straypayable001', 'line', '" + v.Id + "', '" + wrong.GetString("entry") + "', '2026-08-22', 'USD', 0, 100, 'strayitem000001', 'entry', 'X', 1, '2026-08-22', '" + openItemDay + "')",
		"UPDATE books_payable_items SET settled = '1999-01-01' WHERE id = '" + wrongRow.id + "'",
	} {
		if _, err := b.app.DB().NewQuery(sql).Execute(); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	apiReq{
		method: http.MethodPost, url: "/api/books/balances/rebuild",
		token: tokenFor(t, b.users.admin), want: http.StatusOK, before: bindBalanceRoutes,
		content: []string{
			`"payableDriftCount":3`,
			`{"id":"` + goneRow.id + `","entry":"` + gone.GetString("entry") + `","item":"` + gone.Id + `","problem":"missing"}`,
			`{"id":"straypayable001","entry":"` + wrong.GetString("entry") + `","item":"strayitem000001","problem":"stale"}`,
			`{"id":"` + wrongRow.id + `","entry":"` + wrong.GetString("entry") + `","item":"` + wrong.Id + `","problem":"settled"}`,
			`"receivableDrifts":`, `"receivableDriftCount":0`,
		},
	}.run(t, b.app)
	requireNoPayableDrift(t, b.app)
	rows := apRows(t, b.app, "")
	if len(apOfItem(rows, gone.Id)) != 1 || len(apOfItem(rows, "strayitem000001")) != 0 {
		t.Errorf("after the rebuild the stored rows = %+v, want the deleted row back and no stray row", rows)
	}
}
