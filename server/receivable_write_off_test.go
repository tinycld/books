package books

import (
	"reflect"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// A write-off and its void reversal change the invoice they name: their
// Accounts receivable lines are rows of the invoice's item (its kind, number,
// sequence and due day), so a written-off invoice is settled on the write-off's
// day and leaves A/R Aging, and a void opens it again. The rows are stored in
// the write's own transaction (requireNoDrift checks them against the book).

// writeOffAR runs the A/R Aging as the write-off env's reader.
func writeOffAR(t *testing.T, we *writeOffEnv) arBook {
	t.Helper()
	registerBooksSources(t)
	return arBook{app: we.app, reader: we.users.readOnly}
}

// requireInvoiceItem fails unless every stored row of the write-off's entry is a
// row of inv's item, with inv's kind, number, sequence and due day.
func requireInvoiceItem(t *testing.T, we *writeOffEnv, what, entryID string, inv *core.Record) {
	t.Helper()
	invEntry := reload(t, we.app, "books_journal_entries", inv.GetString("entry"))
	rows := ofEntry(arRows(t, we.app, receivableSourceLine), entryID)
	if len(rows) != 1 {
		t.Fatalf("%s: %d stored rows, want 1: %+v", what, len(rows), rows)
	}
	r := rows[0]
	if got, want := [5]any{r.item, r.kind, r.number, r.seq, r.due},
		[5]any{inv.Id, "invoice", invEntry.GetString("number"), invEntry.GetInt("sequence"), inv.GetString("due_date")}; got != want {
		t.Errorf("%s: item/kind/number/seq/due = %v, want %v (the invoice's item)", what, got, want)
	}
}

func TestWriteOffReceivableRows(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := reload(t, we.app, "books_invoices", we.postedInvoice(t, 50000).Id)
	wo := we.mkWriteOff(t, inv, nil)

	requireInvoiceItem(t, we, "the write-off's line", wo.GetString("entry"), inv)
	requireOneItem(t, "the written-off invoice", ofItem(allRows(t, we.app), inv.Id), inv.Id, 0)
	if got := settledOf(t, we.app, inv.Id); got != writeOffDay {
		t.Errorf("the written-off invoice settles on %s, want the write-off's day %s", got, writeOffDay)
	}
	requireNoDrift(t, we.app)

	if err := voidWriteOffAs(we.app, wo.Id, we.users.admin.Id); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	requireInvoiceItem(t, we, "the void reversal's line", findReversal(t, we.app, wo.GetString("entry")).Id, inv)
	requireOneItem(t, "the invoice after the void", ofItem(allRows(t, we.app), inv.Id), inv.Id, 50000)
	if got := settledOf(t, we.app, inv.Id); got != receivableOpen {
		t.Errorf("the invoice after the write-off's void settles on %s, want open", got)
	}
	requireNoDrift(t, we.app)
}

// A part-paid invoice written off: the payment and the write-off settle it on
// the write-off's day; the day before, the item is the unpaid part.
func TestWriteOffReceivableRows_PartPaid(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := reload(t, we.app, "books_invoices", we.postedInvoice(t, 50000).Id)
	we.pay(t, inv, "2026-11-06", 10000)
	wo := we.mkWriteOff(t, inv, nil)

	requireInvoiceItem(t, we, "the write-off's line", wo.GetString("entry"), inv)
	requireOneItem(t, "the paid and written-off invoice", ofItem(allRows(t, we.app), inv.Id), inv.Id, 0)
	if got := settledOf(t, we.app, inv.Id); got != writeOffDay {
		t.Errorf("the invoice settles on %s, want the write-off's day %s", got, writeOffDay)
	}
	requireNoDrift(t, we.app)

	b := writeOffAR(t, we)
	res, item := b.openItem(t, map[string]any{"asOf": "2026-11-09"}, we.customer, inv.Id)
	if v, _ := agedCell(t, item, "total"); v != 40000 {
		t.Errorf("as of 2026-11-09 (before the write-off) the invoice item = %d, want 40000", v)
	}
	for _, l := range arLinesOf(t, res, item) {
		if strings.Contains(l.Label, "Write-off") {
			t.Errorf("as of 2026-11-09 the invoice item has the line %q, want no write-off line", l.Label)
		}
	}
	after := b.run(t, map[string]any{"asOf": writeOffDay})
	if cbHasCustomer(after, we.customer) {
		t.Errorf("as of %s (written off) the customer has a row; rows %q", writeOffDay, bsLabels(after))
	}
}

// In A/R Aging a written-off invoice is gone from the write-off's day on, the
// write-off is no item of its own, and after the void the invoice is open
// again, its lines the invoice, the write-off and its void reversal.
func TestWriteOffARAging(t *testing.T) {
	we := newWriteOffEnv(t)
	inv := reload(t, we.app, "books_invoices", we.postedInvoice(t, 50000).Id)
	wo := we.mkWriteOff(t, inv, nil)
	b := writeOffAR(t, we)

	_, item := b.openItem(t, map[string]any{"asOf": "2026-11-09"}, we.customer, inv.Id)
	if v, _ := agedCell(t, item, "total"); v != 50000 {
		t.Errorf("as of 2026-11-09 (before the write-off) the invoice item = %d, want 50000", v)
	}
	res := b.run(t, nil)
	if cbHasCustomer(res, we.customer) {
		t.Errorf("after the write-off the customer has a row; rows %q", bsLabels(res))
	}

	if err := voidWriteOffAs(we.app, wo.Id, we.users.admin.Id); err != nil {
		t.Fatalf("void the write-off: %v", err)
	}
	opened, row := b.openCustomer(t, nil, we.customer)
	invNumber := reload(t, we.app, "books_journal_entries", inv.GetString("entry")).GetString("number")
	if got, want := labelsOf(arItemsOf(t, opened, row)), []string{"Invoice " + invNumber}; !reflect.DeepEqual(got, want) {
		t.Errorf("after the void the customer's items = %q, want %q (the write-off is no item)", got, want)
	}
	res, item = b.openItem(t, nil, we.customer, inv.Id)
	// Due 2026-11-04: age 14 on 2026-11-18.
	requireFigs(t, "the invoice after the write-off's void", item, map[string]int64{"d30": 50000, "total": 50000})
	lines := arLinesOf(t, res, item)
	var figs []int64
	for _, l := range lines {
		v, _ := agedCell(t, l, "total")
		figs = append(figs, v)
	}
	if !reflect.DeepEqual(figs, []int64{50000, -50000, 50000}) {
		t.Errorf("the invoice's lines %q add %v, want the invoice, the write-off and its reversal [50000 -50000 50000]", labelsOf(lines), figs)
	}
	if len(lines) == 3 && lines[1].Label != writeOffDay+" · Write-off "+wo.GetString("number") {
		t.Errorf("the write-off's line = %q, want %q", lines[1].Label, writeOffDay+" · Write-off "+wo.GetString("number"))
	}
	requireNoDrift(t, we.app)
}
