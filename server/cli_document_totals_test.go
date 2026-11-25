package books

import (
	"fmt"
	"strconv"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// The CLI computes nothing: it sends the lines and prints the totals, the
// line amounts and the tax lines the server stored. The form shows the same
// numbers before the save, from tinycld/books/lib/document-lines.ts, and
// tests/document-lines.test.ts holds that code to
// testdata/document_totals.json. This test sends each case of that file as
// the batch of `invoices add` and holds what the server stored to the case,
// so the CLI and the form print the same numbers for the same lines.
func TestCLIDocuments_TotalsMatchTheFormCases(t *testing.T) {
	env := newSaleStockEnv(t, costingFIFO)
	enableBatch(t, env.app)
	token := tokenFor(t, env.users.bookkeeper)
	const invoices, lines = "books_invoices", "books_invoice_lines"
	ran := 0
	for index, tc := range loadDocumentTotalsVectors(t).Cases {
		// An account line is a line of a bill; TestCLIDocuments_BillTotalsMatchTheFormCases sends those.
		if tc.Lines[0].Kind == lineKindAccount {
			continue
		}
		ran++
		t.Run(tc.Name, func(t *testing.T) {
			id := fmt.Sprintf("clitotals%06d", index)
			header := fmt.Sprintf(`{"customer":%q,"date":"2026-11-04","due_date":"2026-12-04","id":%q,"status":"draft"`, env.customer.Id, id)
			if rate := cliTaxRate(t, env, index, tc.Components); rate != "" {
				header += fmt.Sprintf(`,"tax_rate":%q`, rate)
			}
			ops := []string{cliOp("POST", invoices, "", header+"}")}
			for position, l := range tc.Lines {
				var fields string
				switch l.Kind {
				case lineKindItem:
					fields = fmt.Sprintf(`"kind":"item","product":%q,"quantity":%s,"rate":%d,"taxable":%t`,
						env.service.Id, strconv.FormatFloat(l.Quantity, 'f', -1, 64), l.Rate, l.Taxable)
				case lineKindPercent:
					fields = fmt.Sprintf(`"kind":"percent","product":%q,"percent_ppm":%d,"taxable":%t`, env.service.Id, l.PercentPpm, l.Taxable)
				case lineKindDescription:
					fields = `"kind":"description","description":"Note"`
				default:
					fields = fmt.Sprintf(`"kind":%q`, l.Kind)
				}
				ops = append(ops, rowOp(lines, "invoice", id, position, fields))
			}
			post := cliOp("PATCH", invoices, id, `{"revision":1,"status":"posted"}`)
			switch {
			case tc.TooLarge:
				apiSeq(t, env.app, refusedBatch(token, []string{`too large`}, ops...))
				return
			case len(tc.PercentTargetErrors) > 0:
				// Books checks the target of a percent line when the header is
				// written, and names the line.
				line := fmt.Sprintf(`"message":"Line %d: A percent line applies to the item or subtotal right above it."`, tc.PercentTargetErrors[0]+1)
				apiSeq(t, env.app, refusedBatch(token, []string{line}, append(append([]string{}, ops...), post)...))
				return
			case tc.Total < 0:
				// The form shows the negative total; Books refuses to store it.
				apiSeq(t, env.app, refusedBatch(token, []string{`"message":"An invoice total cannot be below zero. Use a credit memo."`}, ops...))
				return
			case tc.Total > 0:
				// Tax lines exist only on a posted invoice, so every case is posted and
				// held to the form's numbers again. A zero total stays a draft: the
				// server does not post one.
				ops = append(ops, post)
			}
			apiSeq(t, env.app, apiCalls(
				[]apiReq{docBatch(token, ops...)},
				showDoc(token, invoices, id, []string{`"id":"` + id + `"`}, lines, "invoice", []string{fmt.Sprintf(`"totalItems":%d`, len(tc.Lines))}),
			)...)

			var taxTotal int64
			for _, amount := range tc.Tax {
				taxTotal += amount
			}
			stored := reload(t, env.app, invoices, id)
			if got := [3]int64{int64(stored.GetFloat("subtotal")), int64(stored.GetFloat("tax_total")), int64(stored.GetFloat("total"))}; got != [3]int64{tc.Subtotal, taxTotal, tc.Total} {
				t.Errorf("subtotal/tax_total/total = %v, want %v", got, [3]int64{tc.Subtotal, taxTotal, tc.Total})
			}
			rows := cliRows(t, env.app, lines, "invoice", id)
			if len(rows) != len(tc.Amounts) {
				t.Fatalf("%d lines, want %d", len(rows), len(tc.Amounts))
			}
			for i, want := range tc.Amounts {
				// A line with no amount (a description line) is stored as 0.
				var amount int64
				if want != nil {
					amount = *want
				}
				if got := int64(rows[i].GetFloat("amount")); got != amount {
					t.Errorf("line %d amount = %d, want %d", i, got, amount)
				}
			}
			taxRows := cliRows(t, env.app, "books_invoice_tax_lines", "invoice", id)
			if len(taxRows) != len(tc.Tax) {
				t.Fatalf("%d tax lines, want %d", len(taxRows), len(tc.Tax))
			}
			for i, want := range tc.Tax {
				row := taxRows[i]
				if int64(row.GetFloat("amount")) != want || int64(row.GetFloat("rate_ppm")) != tc.Components[i] || int64(row.GetFloat("taxable_amount")) != tc.TaxableTotal {
					t.Errorf("tax line %d = amount %v, rate_ppm %v, taxable_amount %v; want %d, %d, %d",
						i, row.Get("amount"), row.Get("rate_ppm"), row.Get("taxable_amount"), want, tc.Components[i], tc.TaxableTotal)
				}
			}
		})
	}
	if ran < 10 {
		t.Errorf("only %d cases of testdata/document_totals.json ran", ran)
	}
}

// cliTaxRate is a tax rate with the components of a case: none, one rate, or
// a group of rates.
func cliTaxRate(t *testing.T, env *saleStockEnv, index int, components []int64) string {
	t.Helper()
	rates := make([]*core.Record, len(components))
	for i, ppm := range components {
		rates[i] = mkTaxRate(t, env.app, fmt.Sprintf("Case %d rate %d", index, i), int(ppm), env.stateDOR)
	}
	switch len(rates) {
	case 0:
		return ""
	case 1:
		return rates[0].Id
	}
	return mkTaxGroup(t, env.app, fmt.Sprintf("Case %d group", index), rates...).Id
}

// cliRows is the rows of one line table in the order `show` prints them.
func cliRows(t *testing.T, app core.App, collection, parent, id string) []*core.Record {
	t.Helper()
	rows, err := app.FindRecordsByFilter(collection, parent+" = {:id}", "position,id", 0, 0, dbx.Params{"id": id})
	if err != nil {
		t.Fatalf("the rows of %s %s: %v", strings.TrimPrefix(collection, "books_"), id, err)
	}
	return rows
}
