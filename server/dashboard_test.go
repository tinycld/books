package books

import (
	"encoding/json"
	"maps"
	"math"
	"net/http"
	"reflect"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
)

// The two dashboard views (dashboard spec §4 "New views"):
// books_invoice_due_totals holds one row per due date of the posted invoices
// with an open balance (id = the due date, balance = the sum of the open
// balances, count = the invoices), and books_payment_day_totals one row per
// date of the posted payments (id = the date, amount = the sum, count = the
// payments). Both are read the way the records API reads them, by their
// collection names, so a wrong query or a missing migration fails here.

const (
	dashboardDueTotalsName = "books_invoice_due_totals"
	dashboardDayTotalsName = "books_payment_day_totals"
)

// dashboardTotal is one view row: the summed cents and the count.
type dashboardTotal struct {
	total, count int
}

// dashboardRows reads every row of view as day -> total. dayField names the
// row's day column and totalField its cents column. It fails the test when a
// row's id is not its day.
func dashboardRows(t testing.TB, app core.App, view, dayField, totalField string) map[string]dashboardTotal {
	t.Helper()
	rows, err := app.FindAllRecords(view)
	if err != nil {
		t.Fatalf("read %s: %v", view, err)
	}
	out := map[string]dashboardTotal{}
	for _, r := range rows {
		day := r.GetString(dayField)
		if r.Id != day {
			t.Errorf("%s row id %q is not its %s %q", view, r.Id, dayField, day)
		}
		out[day] = dashboardTotal{total: r.GetInt(totalField), count: r.GetInt("count")}
	}
	return out
}

func dueTotals(t testing.TB, app core.App) map[string]dashboardTotal {
	t.Helper()
	return dashboardRows(t, app, dashboardDueTotalsName, "due_date", "balance")
}

func dayTotals(t testing.TB, app core.App) map[string]dashboardTotal {
	t.Helper()
	return dashboardRows(t, app, dashboardDayTotalsName, "date", "amount")
}

func requireDashboardRows(t testing.TB, what string, got, want map[string]dashboardTotal) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s = %+v, want %+v", what, got, want)
	}
}

// invoiceDue saves an invoice of the env's customer due on due with one line
// of total, posted when post is true.
func (pe *paymentEnv) invoiceDue(t testing.TB, due string, total int64, post bool) *core.Record {
	t.Helper()
	inv, err := newInvoice(pe.app, pe.customer, map[string]any{"due_date": due})
	if err != nil {
		t.Fatalf("save a draft invoice due %s: %v", due, err)
	}
	mkInvoiceLine(t, pe.app, inv, 0, item(pe.service, 1, total, false))
	if !post {
		return inv
	}
	return mustPostInvoice(t, pe.app, inv.Id, pe.users.bookkeeper.Id)
}

// paymentOn posts a payment dated date that applies amount to invoice.
func (pe *paymentEnv) paymentOn(t testing.TB, date string, invoice *core.Record, amount int64) *core.Record {
	t.Helper()
	payment := pe.mkPayment(t, map[string]any{"date": date, "amount": amount})
	mkApplication(t, pe.app, payment, invoice, 0, amount)
	return mustPostPayment(t, pe.app, payment.Id, pe.users.bookkeeper.Id)
}

func TestInvoiceDueTotals_Rows(t *testing.T) {
	pe := newPaymentEnv(t)
	pe.invoiceDue(t, "2026-12-04", 30000, true)
	pe.invoiceDue(t, "2026-12-04", 12500, true)
	pe.invoiceDue(t, "2026-12-20", 8000, true)

	want := map[string]dashboardTotal{
		"2026-12-04": {total: 42500, count: 2},
		"2026-12-20": {total: 8000, count: 1},
	}
	requireDashboardRows(t, "due totals", dueTotals(t, pe.app), want)

	// A draft is not owed yet: it adds no row and changes none.
	pe.invoiceDue(t, "2026-12-04", 9900, false)
	pe.invoiceDue(t, "2026-12-28", 7700, false)
	requireDashboardRows(t, "due totals after two drafts", dueTotals(t, pe.app), want)
}

func TestInvoiceDueTotals_PaymentLowersAndRemoves(t *testing.T) {
	pe := newPaymentEnv(t)
	shared := pe.invoiceDue(t, "2026-12-04", 30000, true)
	pe.invoiceDue(t, "2026-12-04", 12500, true)
	alone := pe.invoiceDue(t, "2026-12-20", 8000, true)

	pe.paymentOn(t, "2026-11-10", shared, 10000)
	requireDashboardRows(t, "due totals after a part payment", dueTotals(t, pe.app), map[string]dashboardTotal{
		"2026-12-04": {total: 32500, count: 2},
		"2026-12-20": {total: 8000, count: 1},
	})

	pe.paymentOn(t, "2026-11-12", alone, 8000)
	requireDashboardRows(t, "due totals after the only invoice of a day is paid in full", dueTotals(t, pe.app), map[string]dashboardTotal{
		"2026-12-04": {total: 32500, count: 2},
	})
}

func TestInvoiceDueTotals_VoidRemoves(t *testing.T) {
	pe := newPaymentEnv(t)
	pe.invoiceDue(t, "2026-12-04", 30000, true)
	alone := pe.invoiceDue(t, "2026-12-20", 8000, true)
	requireDashboardRows(t, "due totals before the void", dueTotals(t, pe.app), map[string]dashboardTotal{
		"2026-12-04": {total: 30000, count: 1},
		"2026-12-20": {total: 8000, count: 1},
	})

	if err := voidInvoiceAs(pe.app, alone.Id, pe.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the invoice: %v", err)
	}
	requireDashboardRows(t, "due totals after the void", dueTotals(t, pe.app), map[string]dashboardTotal{
		"2026-12-04": {total: 30000, count: 1},
	})
}

func TestPaymentDayTotals_Rows(t *testing.T) {
	pe := newPaymentEnv(t)
	first := pe.paymentOn(t, "2026-11-10", pe.invoiceDue(t, "2026-12-04", 30000, true), 30000)
	pe.paymentOn(t, "2026-11-10", pe.invoiceDue(t, "2026-12-04", 12500, true), 12500)
	only := pe.paymentOn(t, "2026-11-12", pe.invoiceDue(t, "2026-12-20", 8000, true), 8000)

	requireDashboardRows(t, "day totals", dayTotals(t, pe.app), map[string]dashboardTotal{
		"2026-11-10": {total: 42500, count: 2},
		"2026-11-12": {total: 8000, count: 1},
	})

	// A draft payment is not received yet.
	pe.mkPayment(t, map[string]any{"date": "2026-11-14", "amount": 5000})

	if err := voidPaymentAs(pe.app, first.Id, pe.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the first payment: %v", err)
	}
	requireDashboardRows(t, "day totals after a void on a shared day", dayTotals(t, pe.app), map[string]dashboardTotal{
		"2026-11-10": {total: 12500, count: 1},
		"2026-11-12": {total: 8000, count: 1},
	})

	if err := voidPaymentAs(pe.app, only.Id, pe.users.bookkeeper.Id); err != nil {
		t.Fatalf("void the only payment of a day: %v", err)
	}
	requireDashboardRows(t, "day totals after the only payment of a day is void", dayTotals(t, pe.app), map[string]dashboardTotal{
		"2026-11-10": {total: 12500, count: 1},
	})
}

// PocketBase types a view column from its SQL; the CASTs make the cents and
// the counts number fields, so the records API sends whole JSON numbers.
func TestDashboardViews_ColumnTypes(t *testing.T) {
	pe := newPaymentEnv(t)
	inv := pe.invoiceDue(t, "2026-12-04", 2781865, true)
	pe.paymentOn(t, "2026-11-10", inv, 1234567)

	cases := []struct {
		view, day string
		numbers   []string
	}{
		{dashboardDueTotalsName, "due_date", []string{"balance", "count"}},
		{dashboardDayTotalsName, "date", []string{"amount", "count"}},
	}
	for _, c := range cases {
		col, err := pe.app.FindCollectionByNameOrId(c.view)
		if err != nil {
			t.Fatalf("find %s: %v", c.view, err)
		}
		if col.Type != core.CollectionTypeView {
			t.Errorf("%s type = %q, want view", c.view, col.Type)
		}
		for _, name := range c.numbers {
			f := col.Fields.GetByName(name)
			if f == nil || f.Type() != core.FieldTypeNumber {
				t.Errorf("%s.%s field = %v, want a number field", c.view, name, f)
			}
		}

		rows, err := pe.app.FindAllRecords(c.view)
		if err != nil {
			t.Fatalf("read %s: %v", c.view, err)
		}
		if len(rows) != 1 {
			t.Fatalf("%s rows = %d, want 1", c.view, len(rows))
		}
		raw, err := json.Marshal(rows[0].PublicExport())
		if err != nil {
			t.Fatal(err)
		}
		var exported map[string]any
		if err := json.Unmarshal(raw, &exported); err != nil {
			t.Fatal(err)
		}
		for _, name := range c.numbers {
			got, isNumber := exported[name].(float64)
			if !isNumber || got != math.Trunc(got) || got <= 0 {
				t.Errorf("%s exported %s = %#v (%T), want a positive whole JSON number; row %s",
					c.view, name, exported[name], exported[name], raw)
			}
		}
		day, isText := exported[c.day].(string)
		if !isText || len(day) != 10 {
			t.Errorf("%s exported %s = %#v, want a 10-character day; row %s", c.view, c.day, exported[c.day], raw)
		}
	}
}

// Register, as production wires Books, makes both views live through core's
// change signal over the collection each one reads, and CheckViews accepts
// them on that app.
func TestDashboardViews_AreLive(t *testing.T) {
	changesignal.ResetForTesting()
	t.Cleanup(changesignal.ResetForTesting)
	app, _ := newRegisteredApp(t)

	views := changesignal.RegisteredViews()
	want := map[string][]string{
		dashboardDueTotalsName: {"books_invoices"},
		dashboardDayTotalsName: {"books_payments"},
	}
	for view, sources := range want {
		got, ok := views[view]
		if !ok {
			t.Errorf("Register did not register the %s view; registered views: %v",
				view, slices.Sorted(maps.Keys(views)))
			continue
		}
		if !reflect.DeepEqual(got, sources) {
			t.Errorf("registered sources of %s = %v, want %v", view, got, sources)
		}
	}
	if err := changesignal.CheckViews(app); err != nil {
		t.Errorf("CheckViews: %v", err)
	}
}

// Both views carry the READ rule of books_party_balances: a Books reader lists
// their rows, and a signed-in user with no Books access gets none.
func TestDashboardViews_ReadRule(t *testing.T) {
	pe := newPaymentEnv(t)
	inv := pe.invoiceDue(t, "2026-12-04", 30000, true)
	pe.paymentOn(t, "2026-11-10", inv, 10000)

	reader, outsider := tokenFor(t, pe.users.readOnly), tokenFor(t, pe.users.none)
	due := "/api/collections/" + dashboardDueTotalsName + "/records"
	day := "/api/collections/" + dashboardDayTotalsName + "/records"
	apiSeq(t, pe.app,
		apiReq{method: http.MethodGet, url: due, token: reader, want: http.StatusOK,
			content: []string{`"totalItems":1`, `"id":"2026-12-04"`}},
		apiReq{method: http.MethodGet, url: day, token: reader, want: http.StatusOK,
			content: []string{`"totalItems":1`, `"id":"2026-11-10"`}},
		apiReq{method: http.MethodGet, url: due, token: outsider, want: http.StatusOK,
			content: []string{`"totalItems":0`}},
		apiReq{method: http.MethodGet, url: day, token: outsider, want: http.StatusOK,
			content: []string{`"totalItems":0`}},
	)
}
