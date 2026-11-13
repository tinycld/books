package books

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/router"
)

// The refusal texts of the invoice guards, as the client gets them (PocketBase
// adds a final period). Written out here, not read from the consts, so a change
// of wording fails this file too.
const (
	wantDueBeforeDate = "The due date cannot be before the invoice date."
	wantTotalNegative = "An invoice total cannot be below zero. Use a credit memo."
	wantTotalTooLarge = "The invoice total is more than Books can store."
	wantTooManyLines  = "An invoice can have at most 250 lines."
	wantBundleOnLine  = "Line %d: a bundle is never stored on a line. Pick it again to add its items."
	wantLineTooLarge  = "Line %d: the amount is too large."
	wantPercentTarget = "Line %d: A percent line applies to the item or subtotal right above it."
	wantNeedsProduct  = "Line %d: Product or service is required."
	wantNeedsDesc     = "Line %d: Description is required."
	wantNoAmountKind  = "Line %d: A %s line has no product or amount."
)

func wantCustomerInactive(name string) string {
	return name + " is inactive. Choose an active customer."
}

func wantProductInactive(n int, name string) string {
	return fmt.Sprintf("Line %d: %s is inactive. Choose an active product or service.", n, name)
}

// A line amount of 10^15 cents: quantity 1 000 000 at 10^9 cents.
const (
	bigQty  = 1_000_000
	bigRate = 1_000_000_000
)

// invoiceEnv is a ledger env with the invoice guards bound, an active
// customer, the products an invoice names and the Denver combined group
// (Colorado state 2.9%, RTD transit 1%, Denver city 4.81%).
type invoiceEnv struct {
	*ledgerEnv
	customer                                   *core.Record
	service, accessPoint, patchCable, discount *core.Record
	bundle, retired                            *core.Record
	agency, denver                             *core.Record
}

func newInvoiceEnv(t *testing.T) *invoiceEnv {
	t.Helper()
	env := newLedgerEnv(t)
	registerSalesDocGuards(env.app, invoiceKind)
	return invoiceEnvOn(t, env)
}

func invoiceEnvOn(t *testing.T, env *ledgerEnv) *invoiceEnv {
	t.Helper()
	app := env.app
	bindInvoiceHost(t, app)
	product := func(fields map[string]any) *core.Record {
		t.Helper()
		if fields["type"] != "bundle" {
			fields["income_account"] = env.revenue.Id
		}
		r, err := newProduct(app, fields)
		if err != nil {
			t.Fatalf("save product %v: %v", fields["name"], err)
		}
		return r
	}
	ie := &invoiceEnv{
		ledgerEnv:   env,
		customer:    mkCustomer(t, app, "Harborview Dental", ""),
		service:     product(map[string]any{"type": "service", "name": "Monthly bookkeeping", "taxable": true}),
		accessPoint: product(map[string]any{"type": "non_inventory", "name": "Wireless access point", "taxable": true}),
		patchCable:  product(map[string]any{"type": "non_inventory", "name": "Patch cable", "taxable": true}),
		discount:    product(map[string]any{"type": "service", "name": "Discount"}),
		bundle:      product(map[string]any{"type": "bundle", "name": "Office network kit"}),
		retired:     product(map[string]any{"type": "service", "name": "Old retainer"}),
	}
	mkBundleItem(t, app, ie.bundle, ie.patchCable, 0)
	makeProductInactive(t, app, ie.retired)
	ie.agency = mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	state := mkTaxRate(t, app, "Colorado state", 29000, ie.agency)
	rtd := mkTaxRate(t, app, "RTD transit", 10000, ie.agency)
	city := mkTaxRate(t, app, "Denver city", 48100, ie.agency)
	ie.denver = mkTaxGroup(t, app, "Denver combined", state, rtd, city)
	return ie
}

// newInvoice saves a draft invoice through the app, so every guard runs, with
// the fields given over a valid default, and returns what the guards said.
func newInvoice(app core.App, customer *core.Record, fields map[string]any) (*core.Record, error) {
	all := map[string]any{
		"customer": customer.Id, "status": "draft", "date": "2026-11-04", "due_date": "2026-12-04",
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_invoices", all)
}

func (ie *invoiceEnv) mkInvoice(t testing.TB, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newInvoice(ie.app, ie.customer, fields)
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	return r
}

// newInvoiceLine saves one line of invoice at position through the app, so
// every guard and the restatement run, and returns what they said.
func newInvoiceLine(app core.App, invoice *core.Record, position int, fields map[string]any) (*core.Record, error) {
	all := map[string]any{"invoice": invoice.Id, "position": position}
	for k, v := range fields {
		all[k] = v
	}
	return saveNew(app, "books_invoice_lines", all)
}

func mkInvoiceLine(t testing.TB, app core.App, invoice *core.Record, position int, fields map[string]any) *core.Record {
	t.Helper()
	r, err := newInvoiceLine(app, invoice, position, fields)
	if err != nil {
		t.Fatalf("save line %d: %v", position+1, err)
	}
	return r
}

func item(product *core.Record, qty float64, rate int64, taxable bool) map[string]any {
	return map[string]any{"kind": "item", "product": product.Id, "quantity": qty, "rate": rate, "taxable": taxable}
}

func percentLine(product *core.Record, ppm int64) map[string]any {
	return map[string]any{"kind": "percent", "product": product.Id, "percent_ppm": ppm}
}

func descriptionLine(text string) map[string]any {
	return map[string]any{"kind": "description", "description": text}
}

func subtotalLine() map[string]any {
	return map[string]any{"kind": "subtotal"}
}

// everyKind is the fixture's every-kind invoice (lib/invoice-form-fixture.ts):
// line amounts 135000, 37800, 10500, 183300, -18330, none, 42000; subtotal
// 206970; taxable 48300, so Denver combined tax 1401 + 483 + 2323 = 4207.
func (ie *invoiceEnv) everyKind() []map[string]any {
	return []map[string]any{
		item(ie.service, 3, 45000, false),
		item(ie.accessPoint, 2, 18900, true),
		item(ie.patchCable, 12, 875, true),
		subtotalLine(),
		percentLine(ie.discount, -100000),
		descriptionLine("Work done at the annex office, October 6 to 17."),
		item(ie.service, 1.5, 28000, false),
	}
}

func requireInvoiceTotals(t testing.TB, app core.App, id string, subtotal, tax, total int) {
	t.Helper()
	r := reload(t, app, "books_invoices", id)
	if got := [3]int{r.GetInt("subtotal"), r.GetInt("tax_total"), r.GetInt("total")}; got != [3]int{subtotal, tax, total} {
		t.Errorf("subtotal/tax_total/total = %v, want %v", got, [3]int{subtotal, tax, total})
	}
}

func requireLineCount(t testing.TB, app core.App, invoice *core.Record, want int64) {
	t.Helper()
	n, err := app.CountRecords("books_invoice_lines", dbx.HashExp{"invoice": invoice.Id})
	if err != nil {
		t.Fatal(err)
	}
	if n != want {
		t.Errorf("%d lines on the invoice, want %d", n, want)
	}
}

// requireRefusalText asserts a 400 whose message is want exactly.
func requireRefusalText(t testing.TB, err error, want string) {
	t.Helper()
	apiErr := apiErrorOf(t, err)
	if apiErr.Status != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", apiErr.Status)
	}
	if apiErr.Message != want {
		t.Errorf("message = %q, want %q", apiErr.Message, want)
	}
}

// requireRefusedOnField asserts a refusal that names field, whether the
// schema (validation.Errors) or a guard (an ApiError's data) refused it, so the
// client shows it under that field.
func requireRefusedOnField(t testing.TB, err error, field string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected a refusal on %s, got none", field)
	}
	var verrs validation.Errors
	if errors.As(err, &verrs) {
		if _, ok := verrs[field]; !ok {
			t.Fatalf("schema refusal %v does not name %s", verrs, field)
		}
		return
	}
	apiErr := apiErrorOf(t, err)
	if _, ok := apiErr.Data[field]; !ok {
		t.Fatalf("refusal %q (data %v) does not name %s", apiErr.Message, apiErr.Data, field)
	}
}

// mkInvoiceRow saves an invoice with saveRecord on an app whose invoice guards
// may not be bound (the delete-guard tests of customers, products and tax
// rates), with the fields given over a valid draft.
func mkInvoiceRow(t testing.TB, app core.App, customer *core.Record, fields map[string]any) *core.Record {
	t.Helper()
	all := map[string]any{
		"customer": customer.Id, "status": "draft", "date": "2026-11-04", "due_date": "2026-12-04", "currency": "USD",
	}
	for k, v := range fields {
		all[k] = v
	}
	return saveRecord(t, app, "books_invoices", all)
}

// setInvoiceStatus writes status straight to the table, past every hook: the
// posting path is not this checkpoint's, but the line guards must already
// hold a posted invoice's lines.
func setInvoiceStatus(t testing.TB, app core.App, id, status string) {
	t.Helper()
	if _, err := app.DB().NewQuery("UPDATE books_invoices SET status = {:s} WHERE id = {:id}").
		Bind(dbx.Params{"s": status, "id": id}).Execute(); err != nil {
		t.Fatalf("set invoice %s %s: %v", id, status, err)
	}
}

func TestInvoice_DraftRestatesTotals(t *testing.T) {
	ie := newInvoiceEnv(t)
	inv := ie.mkInvoice(t, map[string]any{"tax_rate": ie.denver.Id})
	var lines []*core.Record
	for i, fields := range ie.everyKind() {
		lines = append(lines, mkInvoiceLine(t, ie.app, inv, i, fields))
	}

	requireLineAmounts := func(t *testing.T, want []int) {
		t.Helper()
		for i, w := range want {
			if i == 5 {
				continue // the description line has no amount
			}
			if got := reload(t, ie.app, "books_invoice_lines", lines[i].Id).GetInt("amount"); got != w {
				t.Errorf("line %d amount = %d, want %d", i+1, got, w)
			}
		}
	}

	requireLineAmounts(t, []int{135000, 37800, 10500, 183300, -18330, 0, 42000})
	requireInvoiceTotals(t, ie.app, inv.Id, 206970, 4207, 211177)

	// Line 1 goes from 3 to 4: its subtotal and the discount on it follow.
	if err := setFields(t, ie.app, "books_invoice_lines", lines[0].Id, map[string]any{"quantity": 4}); err != nil {
		t.Fatalf("edit line 1 quantity: %v", err)
	}
	requireLineAmounts(t, []int{180000, 37800, 10500, 228300, -22830, 0, 42000})
	requireInvoiceTotals(t, ie.app, inv.Id, 247470, 4207, 251677)

	// The header tax is part of the totals too: no tax, no tax total.
	if err := setFields(t, ie.app, "books_invoices", inv.Id, map[string]any{"tax_rate": ""}); err != nil {
		t.Fatalf("clear the tax rate: %v", err)
	}
	requireInvoiceTotals(t, ie.app, inv.Id, 247470, 0, 247470)
}

func TestInvoice_RefusesDueBeforeDate(t *testing.T) {
	ie := newInvoiceEnv(t)
	_, err := newInvoice(ie.app, ie.customer, map[string]any{"date": "2026-11-04", "due_date": "2026-11-03"})
	requireFieldRefusal(t, err, "due_date", wantDueBeforeDate)

	inv := ie.mkInvoice(t, map[string]any{"date": "2026-11-04", "due_date": "2026-11-04"})
	err = setFields(t, ie.app, "books_invoices", inv.Id, map[string]any{"date": "2026-11-05"})
	requireRefusalText(t, err, wantDueBeforeDate)
	if got := reload(t, ie.app, "books_invoices", inv.Id).GetString("date"); got != "2026-11-04" {
		t.Errorf("date = %s after the refusal, want 2026-11-04", got)
	}
}

func TestInvoice_RefusesBadDays(t *testing.T) {
	ie := newInvoiceEnv(t)
	for _, field := range []string{"date", "due_date"} {
		for _, bad := range []string{"2026-02-30", "2026-13-01", "11/04/2026", "2026-11-4", ""} {
			t.Run(field+" "+bad, func(t *testing.T) {
				fields := map[string]any{"date": "2026-11-04", "due_date": "2026-12-04"}
				fields[field] = bad
				_, err := newInvoice(ie.app, ie.customer, fields)
				requireRefusedOnField(t, err, field)
			})
		}
	}
	if n, _ := ie.app.CountRecords("books_invoices"); n != 0 {
		t.Errorf("%d invoices saved with a bad day, want 0", n)
	}
	ie.mkInvoice(t, map[string]any{"date": "2028-02-29", "due_date": "2028-03-30"})
}

func TestInvoice_RefusesInactiveCustomerWhenItChanges(t *testing.T) {
	ie := newInvoiceEnv(t)
	oldMill := mkCustomer(t, ie.app, "Old Mill Bakery", "")
	if err := setCustomer(t, ie.app, oldMill.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Old Mill Bakery inactive: %v", err)
	}

	_, err := newInvoice(ie.app, oldMill, nil)
	requireFieldRefusal(t, err, "customer", wantCustomerInactive("Old Mill Bakery"))

	// A stored draft keeps a customer that became inactive after it was chosen.
	riverside := mkCustomer(t, ie.app, "Riverside Clinic", "")
	inv, err := newInvoice(ie.app, riverside, nil)
	if err != nil {
		t.Fatalf("save a draft for an active customer: %v", err)
	}
	if err := setCustomer(t, ie.app, riverside.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Riverside Clinic inactive: %v", err)
	}
	if err := setFields(t, ie.app, "books_invoices", inv.Id, map[string]any{"memo": "Second visit"}); err != nil {
		t.Fatalf("a memo edit of a draft whose customer became inactive was refused: %v", err)
	}

	// Choosing an inactive customer again is a change, so it is refused.
	err = setFields(t, ie.app, "books_invoices", inv.Id, map[string]any{"customer": oldMill.Id})
	requireFieldRefusal(t, err, "customer", wantCustomerInactive("Old Mill Bakery"))
	if got := reload(t, ie.app, "books_invoices", inv.Id).GetString("customer"); got != riverside.Id {
		t.Errorf("customer = %s after the refusal, want Riverside Clinic", got)
	}
}

func TestInvoice_RefusesInactiveTaxRateWhenItChanges(t *testing.T) {
	ie := newInvoiceEnv(t)
	boulder := mkTaxRate(t, ie.app, "Boulder city", 38600, ie.agency)
	if err := setTaxRate(t, ie.app, boulder.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Boulder city inactive: %v", err)
	}

	_, err := newInvoice(ie.app, ie.customer, map[string]any{"tax_rate": boulder.Id})
	requireRefusedOnField(t, err, "tax_rate")

	aurora := mkTaxRate(t, ie.app, "Aurora city", 37500, ie.agency)
	inv := ie.mkInvoice(t, map[string]any{"tax_rate": aurora.Id})
	if err := setTaxRate(t, ie.app, aurora.Id, map[string]any{"inactive": true}); err != nil {
		t.Fatalf("make Aurora city inactive: %v", err)
	}
	if err := setFields(t, ie.app, "books_invoices", inv.Id, map[string]any{"memo": "Second visit"}); err != nil {
		t.Fatalf("a memo edit of a draft whose tax rate became inactive was refused: %v", err)
	}

	err = setFields(t, ie.app, "books_invoices", inv.Id, map[string]any{"tax_rate": boulder.Id})
	requireRefusedOnField(t, err, "tax_rate")
	if got := reload(t, ie.app, "books_invoices", inv.Id).GetString("tax_rate"); got != aurora.Id {
		t.Errorf("tax_rate = %s after the refusal, want Aurora city", got)
	}
}

func TestInvoiceLine_RefusesBundleProduct(t *testing.T) {
	ie := newInvoiceEnv(t)
	inv := ie.mkInvoice(t, nil)
	_, err := newInvoiceLine(ie.app, inv, 0, item(ie.bundle, 1, 0, false))
	requireRefusalText(t, err, fmt.Sprintf(wantBundleOnLine, 1))
	requireLineCount(t, ie.app, inv, 0)

	line := mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
	err = setFields(t, ie.app, "books_invoice_lines", line.Id, map[string]any{"product": ie.bundle.Id})
	requireRefusalText(t, err, fmt.Sprintf(wantBundleOnLine, 1))
	if got := reload(t, ie.app, "books_invoice_lines", line.Id).GetString("product"); got != ie.service.Id {
		t.Errorf("product = %s after the refusal, want the service", got)
	}
}

func TestInvoiceLine_RefusesInactiveProductWhenItChanges(t *testing.T) {
	ie := newInvoiceEnv(t)
	inv := ie.mkInvoice(t, nil)
	mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))

	_, err := newInvoiceLine(ie.app, inv, 1, item(ie.retired, 1, 1000, false))
	requireRefusalText(t, err, wantProductInactive(2, "Old retainer"))
	requireLineCount(t, ie.app, inv, 1)

	// A stored line keeps a product that became inactive after it was chosen.
	line := mkInvoiceLine(t, ie.app, inv, 1, item(ie.accessPoint, 2, 18900, true))
	makeProductInactive(t, ie.app, ie.accessPoint)
	if err := setFields(t, ie.app, "books_invoice_lines", line.Id, map[string]any{"description": "Ceiling mount", "quantity": 3}); err != nil {
		t.Fatalf("an edit of a line whose product became inactive was refused: %v", err)
	}
	requireInvoiceTotals(t, ie.app, inv.Id, 45000+56700, 0, 45000+56700)

	// Choosing an inactive product is a change, so it is refused.
	_, err = newInvoiceLine(ie.app, inv, 2, item(ie.accessPoint, 1, 18900, true))
	requireRefusalText(t, err, wantProductInactive(3, "Wireless access point"))
	err = setFields(t, ie.app, "books_invoice_lines", line.Id, map[string]any{"product": ie.retired.Id})
	requireRefusalText(t, err, wantProductInactive(2, "Old retainer"))
}

// Core's Go mirror checks only the host declaration, so Books checks each
// line's kind and its cells: the required cells of each kind, and that a
// description or subtotal line holds no product, rate or percent.
func TestInvoiceLine_RefusesInventoryLessKinds(t *testing.T) {
	ie := newInvoiceEnv(t)
	cases := []struct {
		name   string
		fields map[string]any
		want   string
	}{
		{"an item line with no product", map[string]any{"kind": "item", "quantity": 1, "rate": 100},
			fmt.Sprintf(wantNeedsProduct, 2)},
		{"a percent line with no product", map[string]any{"kind": "percent", "percent_ppm": -100000},
			fmt.Sprintf(wantNeedsProduct, 2)},
		{"a description line with no description", map[string]any{"kind": "description"},
			fmt.Sprintf(wantNeedsDesc, 2)},
		{"a description line that names a product",
			map[string]any{"kind": "description", "description": "Annex", "product": ie.service.Id},
			fmt.Sprintf(wantNoAmountKind, 2, "description")},
		{"a description line with a rate",
			map[string]any{"kind": "description", "description": "Annex", "rate": 100},
			fmt.Sprintf(wantNoAmountKind, 2, "description")},
		{"a description line with a percent",
			map[string]any{"kind": "description", "description": "Annex", "percent_ppm": -100000},
			fmt.Sprintf(wantNoAmountKind, 2, "description")},
		{"a subtotal line that names a product", map[string]any{"kind": "subtotal", "product": ie.service.Id},
			fmt.Sprintf(wantNoAmountKind, 2, "subtotal")},
		{"a subtotal line with a rate", map[string]any{"kind": "subtotal", "rate": 100},
			fmt.Sprintf(wantNoAmountKind, 2, "subtotal")},
		{"a subtotal line with a percent", map[string]any{"kind": "subtotal", "percent_ppm": -100000},
			fmt.Sprintf(wantNoAmountKind, 2, "subtotal")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			inv := ie.mkInvoice(t, nil)
			mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
			_, err := newInvoiceLine(ie.app, inv, 1, tc.fields)
			requireRefusalText(t, err, tc.want)
			requireLineCount(t, ie.app, inv, 1)
		})
	}

	t.Run("an edit that gives a description line a product", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
		line := mkInvoiceLine(t, ie.app, inv, 1, descriptionLine("Annex"))
		err := setFields(t, ie.app, "books_invoice_lines", line.Id, map[string]any{"product": ie.service.Id})
		requireRefusalText(t, err, fmt.Sprintf(wantNoAmountKind, 2, "description"))
	})

	t.Run("each kind with its own cells is accepted", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
		mkInvoiceLine(t, ie.app, inv, 1, subtotalLine())
		mkInvoiceLine(t, ie.app, inv, 2, percentLine(ie.discount, -100000))
		mkInvoiceLine(t, ie.app, inv, 3, descriptionLine("Annex"))
		requireInvoiceTotals(t, ie.app, inv.Id, 40500, 0, 40500)
	})
}

func TestInvoiceLine_PercentNeedsTarget(t *testing.T) {
	ie := newInvoiceEnv(t)

	t.Run("under a description line", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
		mkInvoiceLine(t, ie.app, inv, 1, descriptionLine("Annex"))
		_, err := newInvoiceLine(ie.app, inv, 2, percentLine(ie.discount, -100000))
		requireRefusalText(t, err, fmt.Sprintf(wantPercentTarget, 3))
		requireLineCount(t, ie.app, inv, 2)
	})

	t.Run("as the first line", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		_, err := newInvoiceLine(ie.app, inv, 0, percentLine(ie.discount, -100000))
		requireRefusalText(t, err, fmt.Sprintf(wantPercentTarget, 1))
		requireLineCount(t, ie.app, inv, 0)
	})

	t.Run("under a percent line", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
		mkInvoiceLine(t, ie.app, inv, 1, percentLine(ie.discount, -100000))
		_, err := newInvoiceLine(ie.app, inv, 2, percentLine(ie.discount, -100000))
		requireRefusalText(t, err, fmt.Sprintf(wantPercentTarget, 3))
	})

	t.Run("an edit that takes the item from above a percent line", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		first := mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
		mkInvoiceLine(t, ie.app, inv, 1, percentLine(ie.discount, -100000))
		err := setFields(t, ie.app, "books_invoice_lines", first.Id, map[string]any{
			"kind": "description", "description": "Annex", "product": "", "quantity": 0, "rate": 0,
		})
		requireRefusalText(t, err, fmt.Sprintf(wantPercentTarget, 2))
		if got := reload(t, ie.app, "books_invoice_lines", first.Id).GetString("kind"); got != "item" {
			t.Errorf("line 1 kind = %s after the refusal, want item", got)
		}
	})

	t.Run("under an item and under a subtotal is accepted", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
		mkInvoiceLine(t, ie.app, inv, 1, percentLine(ie.discount, -100000))
		mkInvoiceLine(t, ie.app, inv, 2, subtotalLine())
		mkInvoiceLine(t, ie.app, inv, 3, percentLine(ie.discount, 100000))
		requireInvoiceTotals(t, ie.app, inv.Id, 44550, 0, 44550)
	})
}

func TestInvoice_RefusesNegativeTotal(t *testing.T) {
	ie := newInvoiceEnv(t)
	inv := ie.mkInvoice(t, nil)
	mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 1000, false))
	mkInvoiceLine(t, ie.app, inv, 1, item(ie.service, 1, -500, false))
	requireInvoiceTotals(t, ie.app, inv.Id, 500, 0, 500)

	_, err := newInvoiceLine(ie.app, inv, 2, item(ie.service, 1, -501, false))
	requireRefusalText(t, err, wantTotalNegative)
	requireLineCount(t, ie.app, inv, 2)
	requireInvoiceTotals(t, ie.app, inv.Id, 500, 0, 500)
}

func TestInvoice_RefusesTooLargeTotal(t *testing.T) {
	ie := newInvoiceEnv(t)

	t.Run("a line over 10^15", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		_, err := newInvoiceLine(ie.app, inv, 0, item(ie.service, bigQty, bigRate+1, false))
		requireRefusalText(t, err, fmt.Sprintf(wantLineTooLarge, 1))
		requireLineCount(t, ie.app, inv, 0)
	})

	t.Run("lines that add up past 2^53-1", func(t *testing.T) {
		inv := ie.mkInvoice(t, nil)
		for i := 0; i < 9; i++ {
			mkInvoiceLine(t, ie.app, inv, i, item(ie.service, bigQty, bigRate, false))
		}
		requireInvoiceTotals(t, ie.app, inv.Id, 9_000_000_000_000_000, 0, 9_000_000_000_000_000)
		_, err := newInvoiceLine(ie.app, inv, 9, item(ie.service, bigQty, bigRate, false))
		requireRefusalText(t, err, wantTotalTooLarge)
		requireLineCount(t, ie.app, inv, 9)
	})

	t.Run("the tax takes the total past 2^53-1", func(t *testing.T) {
		inv := ie.mkInvoice(t, map[string]any{"tax_rate": ie.denver.Id})
		for i := 0; i < 8; i++ {
			mkInvoiceLine(t, ie.app, inv, i, item(ie.service, bigQty, bigRate, true))
		}
		// Taxable 8 * 10^15: 2.9%, 1% and 4.81% of it.
		requireInvoiceTotals(t, ie.app, inv.Id, 8_000_000_000_000_000, 696_800_000_000_000, 8_696_800_000_000_000)
		_, err := newInvoiceLine(ie.app, inv, 8, item(ie.service, bigQty, bigRate, true))
		requireRefusalText(t, err, wantTotalTooLarge)
		requireLineCount(t, ie.app, inv, 8)
	})
}

func TestInvoiceLine_RefusesTheLine251st(t *testing.T) {
	env := newLedgerEnv(t)
	customer := mkCustomer(t, env.app, "Harborview Dental", "")
	// 249 lines written before the guards are bound, so the test does not
	// wait on 249 restatements; the guard counts what is stored.
	inv := saveRecord(t, env.app, "books_invoices", map[string]any{
		"customer": customer.Id, "status": "draft", "date": "2026-11-04", "due_date": "2026-12-04", "currency": "USD",
	})
	for i := 0; i < 249; i++ {
		saveRecord(t, env.app, "books_invoice_lines", map[string]any{
			"invoice": inv.Id, "kind": "description", "description": fmt.Sprintf("Note %d", i+1), "position": i,
		})
	}
	registerSalesDocGuards(env.app, invoiceKind)
	bindInvoiceHost(t, env.app)

	mkInvoiceLine(t, env.app, inv, 249, descriptionLine("Note 250"))
	_, err := newInvoiceLine(env.app, inv, 250, descriptionLine("Note 251"))
	requireRefusalText(t, err, wantTooManyLines)
	requireLineCount(t, env.app, inv, 250)
}

// The create rule pins the server fields for REST. Each subtest has its own
// app: apiReq allows one call per app.
func TestInvoice_ServerFieldsRefused(t *testing.T) {
	body := func(ie *invoiceEnv, extra string) string {
		return fmt.Sprintf(`{"customer":%q,"status":"draft","date":"2026-11-04","due_date":"2026-12-04"%s}`, ie.customer.Id, extra)
	}
	requireNoInvoice := func(t testing.TB, app *tests.TestApp) {
		if n, _ := app.CountRecords("books_invoices"); n != 0 {
			t.Errorf("%d invoices after a create that set a server field, want 0", n)
		}
	}

	t.Run("a draft with no server field is created", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		apiReq{
			method: http.MethodPost, url: "/api/collections/books_invoices/records",
			token: tokenFor(t, ie.users.bookkeeper), body: body(ie, ""), want: http.StatusOK,
			after: func(t testing.TB, app *tests.TestApp) {
				if n, _ := app.CountRecords("books_invoices"); n != 1 {
					t.Errorf("%d invoices after a valid create, want 1", n)
				}
			},
		}.run(t, ie.app)
	})

	for name, extra := range map[string]func(t testing.TB, ie *invoiceEnv) string{
		"number": func(testing.TB, *invoiceEnv) string { return `,"number":"1001"` },
		"total":  func(testing.TB, *invoiceEnv) string { return `,"total":100` },
		// A real entry, so only the rule can refuse the relation.
		"entry": func(t testing.TB, ie *invoiceEnv) string {
			return fmt.Sprintf(`,"entry":%q`, ie.sale(t, "2026-11-04", 100).Id)
		},
	} {
		t.Run(name, func(t *testing.T) {
			ie := newInvoiceEnv(t)
			apiReq{
				method: http.MethodPost, url: "/api/collections/books_invoices/records",
				token: tokenFor(t, ie.users.bookkeeper), body: body(ie, extra(t, ie)), want: http.StatusBadRequest,
				after: requireNoInvoice,
			}.run(t, ie.app)
		})
	}
}

func TestInvoiceLine_RefusedOnPostedInvoice(t *testing.T) {
	ie := newInvoiceEnv(t)
	inv := ie.mkInvoice(t, nil)
	line := mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
	setInvoiceStatus(t, ie.app, inv.Id, "posted")

	if err := setFields(t, ie.app, "books_invoice_lines", line.Id, map[string]any{"quantity": 2}); err == nil {
		t.Error("a line of a posted invoice was changed")
	}
	if got := reload(t, ie.app, "books_invoice_lines", line.Id).GetFloat("quantity"); got != 1 {
		t.Errorf("quantity = %v after the refusal, want 1", got)
	}
	if _, err := newInvoiceLine(ie.app, inv, 1, item(ie.service, 1, 100, false)); err == nil {
		t.Error("a line was added to a posted invoice")
	}
	if err := ie.app.Delete(reload(t, ie.app, "books_invoice_lines", line.Id)); err == nil {
		t.Error("a line of a posted invoice was deleted")
	}
	requireLineCount(t, ie.app, inv, 1)
	requireInvoiceTotals(t, ie.app, inv.Id, 45000, 0, 45000)
}

// The delete rule, through REST with a bookkeeper: a draft deletes, a posted
// invoice is not found for delete. Each subtest has its own app.
func TestInvoice_DeleteOnlyDraft(t *testing.T) {
	t.Run("posted", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		inv := ie.mkInvoice(t, nil)
		mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
		setInvoiceStatus(t, ie.app, inv.Id, "posted")
		apiReq{
			method: http.MethodDelete, url: "/api/collections/books_invoices/records/" + inv.Id,
			token: tokenFor(t, ie.users.bookkeeper), want: http.StatusNotFound,
			after: func(t testing.TB, app *tests.TestApp) {
				if _, err := app.FindRecordById("books_invoices", inv.Id); err != nil {
					t.Errorf("the posted invoice is gone: %v", err)
				}
			},
		}.run(t, ie.app)
	})

	t.Run("draft", func(t *testing.T) {
		ie := newInvoiceEnv(t)
		inv := ie.mkInvoice(t, nil)
		mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
		apiReq{
			method: http.MethodDelete, url: "/api/collections/books_invoices/records/" + inv.Id,
			token: tokenFor(t, ie.users.bookkeeper), want: http.StatusNoContent,
			after: func(t testing.TB, app *tests.TestApp) {
				if _, err := app.FindRecordById("books_invoices", inv.Id); err == nil {
					t.Error("the draft is still there")
				}
				if n, _ := app.CountRecords("books_invoice_lines", dbx.HashExp{"invoice": inv.Id}); n != 0 {
					t.Errorf("%d lines of the deleted draft remain, want 0", n)
				}
			},
		}.run(t, ie.app)
	})
}

// The Go-only refusal texts live in server/invoices.go as constants.
func TestInvoice_ZeroTotalTextIsTheDecisionsText(t *testing.T) {
	if msgZeroTotal != "An invoice with a total of zero cannot be posted. Add an amount or keep it as a draft." {
		t.Errorf("msgZeroTotal = %q", msgZeroTotal)
	}
}

// Spec §4.3: an invoice's audit row is "Invoice 1004", or "Draft invoice" while
// it has no number; a line's row follows its invoice ("Draft invoice: line 2").
func TestAudit_LabelsAnInvoiceAndItsLines(t *testing.T) {
	ie := newInvoiceEnv(t)
	audited := auditedCollections(ie.app)
	inv := ie.mkInvoice(t, nil)
	mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
	line := mkInvoiceLine(t, ie.app, inv, 1, item(ie.accessPoint, 1, 18900, false))

	if got, want := audited["books_invoices"].ExtractLabel(inv), "Draft invoice"; got != want {
		t.Errorf("draft invoice label = %q, want %q", got, want)
	}
	if got, want := audited["books_invoice_lines"].ExtractLabel(line), "Draft invoice: line 2"; got != want {
		t.Errorf("draft invoice line label = %q, want %q", got, want)
	}
	numbered := inv.Fresh()
	numbered.Set("number", "1004")
	if got, want := audited["books_invoices"].ExtractLabel(numbered), "Invoice 1004"; got != want {
		t.Errorf("numbered invoice label = %q, want %q", got, want)
	}
}

// A create that leaves out status is refused by the schema's required check on
// status, not told that a draft is posted from the form; that text is only for
// a create that asks for posted or void.
func TestInvoice_CreateStatusRefusals(t *testing.T) {
	ie := newInvoiceEnv(t)

	_, err := newInvoice(ie.app, ie.customer, map[string]any{"status": ""})
	requireRefusedOnField(t, err, "status")
	var apiErr *router.ApiError
	if errors.As(err, &apiErr) && apiErr.Message == msgInvoicePostedFromForm {
		t.Errorf("a create with no status got %q", apiErr.Message)
	}

	for _, status := range []string{"posted", "void"} {
		_, err := newInvoice(ie.app, ie.customer, map[string]any{"status": status})
		requireRefusalText(t, err, msgInvoicePostedFromForm)
	}
	if n, err := ie.app.CountRecords("books_invoices"); err != nil || n != 0 {
		t.Errorf("%d invoices stored (err %v), want 0", n, err)
	}
}

// While Books restates an invoice it writes only the lines' amounts, so the
// mark lets an amount through and nothing else: a write that runs while the
// mark is set cannot change a line's other cells past the guard.
func TestInvoiceLine_RestatingAllowsOnlyTheAmount(t *testing.T) {
	ie := newInvoiceEnv(t)
	inv := ie.mkInvoice(t, nil)
	line := mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
	done := markRestating(ie.app, invoiceKind, inv.Id)
	defer done()

	changes := map[string]map[string]any{
		"quantity":            {"quantity": 2},
		"rate":                {"rate": 100},
		"description":         {"description": "Changed while restating"},
		"kind":                {"kind": "description", "product": "", "quantity": 0, "rate": 0, "description": "x"},
		"amount and quantity": {"amount": 90000, "quantity": 2},
	}
	for name, fields := range changes {
		t.Run(name, func(t *testing.T) {
			err := setFields(t, ie.app, "books_invoice_lines", line.Id, fields)
			if apiErr := apiErrorOf(t, err); apiErr.Status != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", apiErr.Status)
			}
			got := reload(t, ie.app, "books_invoice_lines", line.Id)
			if got.GetString("kind") != "item" || got.GetFloat("quantity") != 1 || got.GetInt("rate") != 45000 ||
				got.GetString("description") != "" || got.GetInt("amount") != 45000 {
				t.Errorf("line after the refusal: kind %q qty %v rate %d description %q amount %d, want item 1 45000 \"\" 45000",
					got.GetString("kind"), got.GetFloat("quantity"), got.GetInt("rate"), got.GetString("description"), got.GetInt("amount"))
			}
		})
	}

	t.Run("amount only", func(t *testing.T) {
		if err := setFields(t, ie.app, "books_invoice_lines", line.Id, map[string]any{"amount": 12345}); err != nil {
			t.Fatalf("an amount-only write while restating was refused: %v", err)
		}
		if got := reload(t, ie.app, "books_invoice_lines", line.Id).GetInt("amount"); got != 12345 {
			t.Errorf("amount = %d, want 12345", got)
		}
	})
}

const wantQuantityNotPositive = "Line %d: Enter a quantity more than 0."

// An item line's quantity is more than 0. PocketBase skips the schema's min
// for a 0 or missing number, so the guard refuses it.
func TestInvoiceLine_ItemNeedsAPositiveQuantity(t *testing.T) {
	ie := newInvoiceEnv(t)
	inv := ie.mkInvoice(t, nil)
	first := mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))

	_, err := newInvoiceLine(ie.app, inv, 1, item(ie.service, 0, 45000, false))
	requireRefusalText(t, err, fmt.Sprintf(wantQuantityNotPositive, 2))
	_, err = newInvoiceLine(ie.app, inv, 1, map[string]any{"kind": "item", "product": ie.service.Id, "rate": 45000})
	requireRefusalText(t, err, fmt.Sprintf(wantQuantityNotPositive, 2))
	requireLineCount(t, ie.app, inv, 1)

	err = setFields(t, ie.app, "books_invoice_lines", first.Id, map[string]any{"quantity": 0})
	requireRefusalText(t, err, fmt.Sprintf(wantQuantityNotPositive, 1))
	if got := reload(t, ie.app, "books_invoice_lines", first.Id).GetFloat("quantity"); got != 1 {
		t.Errorf("quantity = %v after the refusal, want 1", got)
	}
	requireInvoiceTotals(t, ie.app, inv.Id, 45000, 0, 45000)
}

// requireLineRefusal asserts a 400 whose text names line n. The wording of a
// foreign-cell refusal is the implementer's, in the "Line n: …" style.
func requireLineRefusal(t testing.TB, err error, n int) {
	t.Helper()
	apiErr := apiErrorOf(t, err)
	if apiErr.Status != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", apiErr.Status)
	}
	if prefix := fmt.Sprintf("Line %d: ", n); !strings.HasPrefix(apiErr.Message, prefix) {
		t.Errorf("message = %q, want it to start with %q", apiErr.Message, prefix)
	}
}

// Deleting a user or a form that a posted or void invoice names makes
// PocketBase clear the link with a save of the invoice; that save changes
// nothing else, so the posted/void guard lets it through. Any other change
// to a posted invoice is still refused.
func TestInvoice_PostedKeepsUnlinksOfDeletedRows(t *testing.T) {
	ie := newInvoiceEnv(t)
	poster := mkUser(t, ie.app, "member")
	voider := mkUser(t, ie.app, "member")
	// The unlink is proved only for a form of an unbound host, because only that
	// form can be deleted while a posted invoice names it. Core's forms hooks
	// refuse to delete a form of a bound host (books:invoice) while a record
	// names it ("This form is in use"), so for a bound host the delete never
	// happens and there is no unlink to keep. The form is therefore one of a host
	// no package provides any more (written past the hooks).
	const formID = "formretired0001"
	if _, err := ie.app.DB().Insert("forms", dbx.Params{
		"id": formID, "host": "retired:invoice", "name": "Invoice", "slug": "invoice", "definition": `{"pages":[]}`,
	}).Execute(); err != nil {
		t.Fatalf("write the retired host's form: %v", err)
	}
	form := reload(t, ie.app, "forms", formID)
	posted := ie.mkInvoice(t, nil)
	mkInvoiceLine(t, ie.app, posted, 0, item(ie.service, 1, 45000, false))
	void := ie.mkInvoice(t, nil)
	mkInvoiceLine(t, ie.app, void, 0, item(ie.service, 1, 45000, false))
	// Written past the hooks: the links a posting stamps, without posting.
	for id, set := range map[string]dbx.Params{
		posted.Id: {"status": statusPosted, "number": "1001", "posted_by": poster.Id, "form": form.Id},
		void.Id:   {"status": statusVoid, "number": "1002", "posted_by": poster.Id, "voided_by": voider.Id},
	} {
		if _, err := ie.app.DB().Update("books_invoices", set, dbx.HashExp{"id": id}).Execute(); err != nil {
			t.Fatalf("stamp invoice %s: %v", id, err)
		}
	}

	t.Run("another change with the unlink is refused", func(t *testing.T) {
		err := setFields(t, ie.app, "books_invoices", posted.Id, map[string]any{"posted_by": "", "memo": "Changed"})
		requireRefusalText(t, err, "A posted or void invoice cannot be changed.")
		if got := reload(t, ie.app, "books_invoices", posted.Id).GetString("posted_by"); got != poster.Id {
			t.Errorf("posted_by = %q after the refusal, want the poster", got)
		}
		err = setFields(t, ie.app, "books_invoices", posted.Id, map[string]any{"posted_by": voider.Id})
		requireRefusalText(t, err, "A posted or void invoice cannot be changed.")
	})

	if err := ie.app.Delete(reload(t, ie.app, "forms", form.Id)); err != nil {
		t.Fatalf("delete the form a posted invoice names: %v", err)
	}
	if err := ie.app.Delete(reload(t, ie.app, "users", voider.Id)); err != nil {
		t.Fatalf("delete the user who voided an invoice: %v", err)
	}
	if err := ie.app.Delete(reload(t, ie.app, "users", poster.Id)); err != nil {
		t.Fatalf("delete the user who posted two invoices: %v", err)
	}
	p := reload(t, ie.app, "books_invoices", posted.Id)
	v := reload(t, ie.app, "books_invoices", void.Id)
	if p.GetString("form") != "" || p.GetString("posted_by") != "" || v.GetString("posted_by") != "" || v.GetString("voided_by") != "" {
		t.Errorf("links after the deletes: form %q posted_by %q / %q voided_by %q, want all cleared",
			p.GetString("form"), p.GetString("posted_by"), v.GetString("posted_by"), v.GetString("voided_by"))
	}
	if p.GetString("status") != statusPosted || p.GetString("number") != "1001" || v.GetString("status") != statusVoid {
		t.Errorf("status/number after the deletes: %q %q / %q, want posted 1001 / void", p.GetString("status"), p.GetString("number"), v.GetString("status"))
	}
}

// The delete guard reads the stored status inside serialized, not the record
// the caller holds: a record loaded while the invoice was a draft cannot
// delete it once it is posted.
func TestInvoice_DeleteRereadsTheStoredStatus(t *testing.T) {
	ie := newInvoiceEnv(t)
	inv := ie.mkInvoice(t, nil)
	mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
	stale := reload(t, ie.app, "books_invoices", inv.Id)
	setInvoiceStatus(t, ie.app, inv.Id, statusPosted)

	err := ie.app.Delete(stale)
	requireRefusalText(t, err, "Only a draft invoice can be deleted.")
	if _, err := ie.app.FindRecordById("books_invoices", inv.Id); err != nil {
		t.Fatalf("the posted invoice is gone: %v", err)
	}
	requireLineCount(t, ie.app, inv, 1)
}

// An item line has no percent; a percent line has no quantity or rate.
func TestInvoiceLine_RefusesAnotherKindsCells(t *testing.T) {
	cases := map[string]struct {
		foreign string
		value   any
		base    func(ie *invoiceEnv) map[string]any
	}{
		"an item with a percent": {"percent_ppm", 100000,
			func(ie *invoiceEnv) map[string]any { return item(ie.accessPoint, 1, 18900, false) }},
		"a percent with a quantity": {"quantity", 2,
			func(ie *invoiceEnv) map[string]any { return percentLine(ie.discount, -100000) }},
		"a percent with a rate": {"rate", 500,
			func(ie *invoiceEnv) map[string]any { return percentLine(ie.discount, -100000) }},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			ie := newInvoiceEnv(t)
			inv := ie.mkInvoice(t, nil)
			mkInvoiceLine(t, ie.app, inv, 0, item(ie.service, 1, 45000, false))
			fields := tc.base(ie)
			fields[tc.foreign] = tc.value
			_, err := newInvoiceLine(ie.app, inv, 1, fields)
			requireLineRefusal(t, err, 2)
			requireLineCount(t, ie.app, inv, 1)
			requireInvoiceTotals(t, ie.app, inv.Id, 45000, 0, 45000)
		})
	}
}
