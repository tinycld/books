package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// Spec §5 (Q9): every tax line written at posting stores the document's gross
// (its subtotal before tax) and its currency beside the taxable amount, so the
// Sales Tax Liability report reads the figures fixed at posting.

// requireTaxLineSnapshot asserts that doc has want tax lines and that each one
// carries the document's subtotal as gross_amount, its currency, and the given
// taxable amount.
func requireTaxLineSnapshot(t testing.TB, app core.App, kind salesDocKind, doc *core.Record, want int, taxable int) []*core.Record {
	t.Helper()
	lines := docTaxLinesOf(t, app, kind, doc.Id)
	if len(lines) != want {
		t.Fatalf("%s %s has %d tax lines, want %d", kind.Collection, doc.Id, len(lines), want)
	}
	currency := doc.GetString("currency")
	if currency == "" {
		t.Fatalf("%s %s has no currency to compare the tax lines with", kind.Collection, doc.Id)
	}
	subtotal := doc.GetInt("subtotal")
	for i, line := range lines {
		if got := line.GetInt("gross_amount"); got != subtotal {
			t.Errorf("tax line %d gross_amount = %d, want the document's subtotal %d", i, got, subtotal)
		}
		if got := line.GetString("currency"); got != currency {
			t.Errorf("tax line %d currency = %q, want the document's currency %q", i, got, currency)
		}
		if got := line.GetInt("taxable_amount"); got != taxable {
			t.Errorf("tax line %d taxable_amount = %d, want %d", i, got, taxable)
		}
	}
	return lines
}

func TestTaxSnapshotGrossAndCurrency(t *testing.T) {
	env := newSalesTaxEnv(t)
	actor := env.users.bookkeeper.Id

	t.Run("an invoice under the group", func(t *testing.T) {
		inv, err := newInvoice(env.app, env.customer, map[string]any{"tax_rate": env.denver.Id})
		if err != nil {
			t.Fatalf("save a draft invoice: %v", err)
		}
		mkInvoiceLine(t, env.app, inv, 0, item(env.service, 1, 10000, true))
		mkInvoiceLine(t, env.app, inv, 1, item(env.service, 1, 2500, false))
		posted := mustPostInvoice(t, env.app, inv.Id, actor)
		if got := posted.GetInt("subtotal"); got != 12500 {
			t.Fatalf("invoice subtotal = %d, want 12500", got)
		}
		requireTaxLineSnapshot(t, env.app, invoiceKind, posted, 3, 10000)
	})

	t.Run("a sales receipt under the group", func(t *testing.T) {
		r := env.mkReceipt(t, map[string]any{"tax_rate": env.denver.Id})
		mkReceiptLine(t, env.app, r, 0, item(env.service, 1, 8000, true))
		mkReceiptLine(t, env.app, r, 1, item(env.service, 1, 1500, false))
		posted := mustPostReceipt(t, env.app, r.Id, actor)
		if got := posted.GetInt("subtotal"); got != 9500 {
			t.Fatalf("sales receipt subtotal = %d, want 9500", got)
		}
		requireTaxLineSnapshot(t, env.app, salesReceiptKind, posted, 3, 8000)
	})

	t.Run("an invoice with a rate and no taxable line", func(t *testing.T) {
		inv, err := newInvoice(env.app, env.customer, map[string]any{"tax_rate": env.denver.Id})
		if err != nil {
			t.Fatalf("save a draft invoice: %v", err)
		}
		mkInvoiceLine(t, env.app, inv, 0, item(env.service, 1, 7300, false))
		posted := mustPostInvoice(t, env.app, inv.Id, actor)
		if got := posted.GetInt("subtotal"); got != 7300 {
			t.Fatalf("invoice subtotal = %d, want 7300", got)
		}
		for i, line := range requireTaxLineSnapshot(t, env.app, invoiceKind, posted, 3, 0) {
			if got := line.GetInt("amount"); got != 0 {
				t.Errorf("tax line %d amount = %d, want 0 (no taxable line)", i, got)
			}
		}
	})
}

func TestTaxSnapshotGrossFollowsCorrection(t *testing.T) {
	env := newSalesTaxEnv(t)
	actor := env.users.bookkeeper.Id

	inv, err := newInvoice(env.app, env.customer, map[string]any{"tax_rate": env.denver.Id})
	if err != nil {
		t.Fatalf("save a draft invoice: %v", err)
	}
	mkInvoiceLine(t, env.app, inv, 0, item(env.service, 1, 10000, true))
	original := mustPostInvoice(t, env.app, inv.Id, actor)

	draft, err := newInvoice(env.app, env.customer, map[string]any{
		"tax_rate": env.denver.Id, "replaces": original.Id, "memo": "Corrected",
	})
	if err != nil {
		t.Fatalf("save the correction draft: %v", err)
	}
	mkInvoiceLine(t, env.app, draft, 0, item(env.service, 1, 16000, true))
	corrected := mustPostInvoice(t, env.app, draft.Id, actor)
	if got := corrected.GetInt("subtotal"); got != 16000 {
		t.Fatalf("correction subtotal = %d, want 16000", got)
	}

	requireTaxLineSnapshot(t, env.app, invoiceKind, corrected, 3, 16000)
	// The original is void now; its tax lines keep the original's subtotal.
	voided := reload(t, env.app, "books_invoices", original.Id)
	if voided.GetString("status") != statusVoid || voided.GetInt("subtotal") != 10000 {
		t.Fatalf("original status %q subtotal %d, want void, 10000", voided.GetString("status"), voided.GetInt("subtotal"))
	}
	requireTaxLineSnapshot(t, env.app, invoiceKind, voided, 3, 10000)
}

func TestTaxLineGrossSchema(t *testing.T) {
	// No hooks bound: a bound app's tax-line guard refuses every write outside
	// a post before field validation runs.
	app := newBooksApp(t)
	agency := mkTaxAgency(t, app, "Colorado DOR", mkLiabilityAccount(t, app, "Sales tax payable"))
	rate := mkTaxRate(t, app, "Colorado state", 29000, agency)
	customer := saveRecord(t, app, "books_customers", map[string]any{"display_name": "Harborview Dental", "code": "HD"})
	inv := mkInvoiceRow(t, app, customer, map[string]any{"status": "posted", "tax_rate": rate.Id})

	line := func(position int, fields map[string]any) (*core.Record, error) {
		all := map[string]any{
			"invoice": inv.Id, "rate": rate.Id, "component": rate.Id, "agency": agency.Id,
			"rate_ppm": 29000, "taxable_amount": 10000, "amount": 290, "position": position,
		}
		for k, v := range fields {
			all[k] = v
		}
		return saveNew(app, "books_invoice_tax_lines", all)
	}

	t.Run("a fractional gross_amount is refused", func(t *testing.T) {
		_, err := line(0, map[string]any{"gross_amount": 1.5, "currency": "USD"})
		requireSchemaRefusal(t, err, "gross_amount")
	})

	t.Run("a lowercase currency is refused", func(t *testing.T) {
		_, err := line(1, map[string]any{"gross_amount": 12500, "currency": "usd"})
		requireSchemaRefusal(t, err, "currency")
	})

	t.Run("a blank currency and a whole gross_amount are accepted", func(t *testing.T) {
		r, err := line(2, map[string]any{"gross_amount": 12500, "currency": ""})
		if err != nil {
			t.Fatalf("save a tax line with gross_amount 12500 and a blank currency: %v", err)
		}
		if got := reload(t, app, "books_invoice_tax_lines", r.Id).GetInt("gross_amount"); got != 12500 {
			t.Errorf("stored gross_amount = %d, want 12500", got)
		}
	})
}
