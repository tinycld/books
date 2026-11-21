package books

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// requirePayableRebuilt rebuilds the stored payable rows and fails when they
// then drift.
func requirePayableRebuilt(t testing.TB, app core.App) {
	t.Helper()
	if err := app.RunInTransaction(payableItems.rebuild); err != nil {
		t.Fatalf("rebuild the payable rows: %v", err)
	}
	requireNoPayableDrift(t, app)
}

// settled is the day a vendor's item reaches zero for good, the same after
// the hooks and after a rebuild.
func TestPayableSettled(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Harbor Freight Logistics")
	partPaid := apBill(t, b, v, "2026-08-04", "2026-09-03", 100000)
	apPayBills(t, b, v, "2026-09-10", map[string]int{partPaid.Id: 40000})
	twoParts := apBill(t, b, v, "2026-08-05", "2026-09-04", 50000)
	apPayBills(t, b, v, "2026-09-11", map[string]int{twoParts.Id: 20000})
	apPayBills(t, b, v, "2026-09-20", map[string]int{twoParts.Id: 30000})
	sameDay := apBill(t, b, v, "2026-08-06", "2026-09-05", 7000)
	apPayBills(t, b, v, "2026-08-06", map[string]int{sameDay.Id: 7000})
	reopened := apBill(t, b, v, "2026-08-07", "2026-09-06", 9000)
	voided := apPayBills(t, b, v, "2026-09-12", map[string]int{reopened.Id: 9000})
	if got := apSettledOf(t, b.app, reopened.Id); got != "2026-09-12" {
		t.Fatalf("paid in full: settled = %q, want 2026-09-12", got)
	}
	if err := voidBillPaymentAs(b.app, voided.Id, b.users.admin.Id); err != nil {
		t.Fatalf("void the bill payment: %v", err)
	}

	check := func(when string) {
		t.Helper()
		for name, tc := range map[string]struct{ item, want string }{
			"part paid: open":                     {partPaid.Id, openItemDay},
			"paid in two parts: the last payment": {twoParts.Id, "2026-09-20"},
			"paid on its own day: that day":       {sameDay.Id, "2026-08-06"},
			"opened again by a void payment":      {reopened.Id, openItemDay},
		} {
			if got := apSettledOf(t, b.app, tc.item); got != tc.want {
				t.Errorf("%s: %s: settled = %q, want %q", when, name, got, tc.want)
			}
		}
	}
	requireNoPayableDrift(t, b.app)
	check("after the writes")
	requirePayableRebuilt(t, b.app)
	check("after a rebuild")
}

// payableItems.verify names each problem alone, with the row it is about.
func TestVerifyPayablesFindsDrift(t *testing.T) {
	setup := func(t *testing.T) (apBook, *core.Record, apRow) {
		t.Helper()
		b := newAPBook(t)
		v := apVendor(t, b, "Harbor Freight Logistics")
		bill := apBill(t, b, v, "2026-08-20", "2026-09-19", 86000)
		requirePayableRebuilt(t, b.app)
		return b, bill, apOne(t, "the bill's rows", apRows(t, b.app, ""))
	}
	exec := func(t *testing.T, b apBook, sql string) {
		t.Helper()
		if _, err := b.app.DB().NewQuery(sql).Execute(); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	for _, c := range []struct {
		name  string
		drift func(t *testing.T, b apBook, bill *core.Record, row apRow) ItemDrift
	}{
		{"stale", func(t *testing.T, b apBook, bill *core.Record, row apRow) ItemDrift {
			exec(t, b, "INSERT INTO books_payable_items (id, source, vendor, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date, settled) "+
				"VALUES ('straypayable001', 'line', '"+row.vendor+"', '"+row.entry+"', '2026-08-22', 'USD', 0, 100, 'strayitem000001', 'entry', 'X', 1, '2026-08-22', '"+openItemDay+"')")
			return ItemDrift{ID: "straypayable001", Entry: row.entry, Item: "strayitem000001", Problem: "stale"}
		}},
		{"missing", func(t *testing.T, b apBook, bill *core.Record, row apRow) ItemDrift {
			exec(t, b, "DELETE FROM books_payable_items WHERE id = '"+row.id+"'")
			return ItemDrift{ID: row.id, Entry: bill.GetString("entry"), Item: bill.Id, Problem: "missing"}
		}},
		{"settled", func(t *testing.T, b apBook, bill *core.Record, row apRow) ItemDrift {
			exec(t, b, "UPDATE books_payable_items SET settled = '1999-01-01' WHERE id = '"+row.id+"'")
			return ItemDrift{ID: row.id, Entry: bill.GetString("entry"), Item: bill.Id, Problem: "settled"}
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			b, bill, row := setup(t)
			want := c.drift(t, b, bill, row)
			drifts, err := payableItems.verify(b.app)
			if err != nil {
				t.Fatalf("verify payables: %v", err)
			}
			if !reflect.DeepEqual(drifts, []ItemDrift{want}) {
				t.Errorf("drifts = %+v, want only %+v", drifts, want)
			}
			requirePayableRebuilt(t, b.app)
		})
	}
}

// The route answers with at most maxItemDriftsReported payable rows and the
// full count, as for the receivable rows.
func TestPayableDriftReport_IsCapped(t *testing.T) {
	drifts := make([]ItemDrift, maxItemDriftsReported+1)
	for i := range drifts {
		drifts[i].ID = fmt.Sprintf("payable%03d", i)
	}
	listed, count := itemDriftReport(drifts)
	if len(listed) != 100 || count != 101 {
		t.Fatalf("listed %d, count %d; want 100 and 101", len(listed), count)
	}
	if listed[0].ID != "payable000" || listed[99].ID != "payable099" {
		t.Errorf("listed %q to %q, want the first 100 drifts", listed[0].ID, listed[99].ID)
	}
}
