package books

import (
	"slices"
	"strings"
	"sync"
	"testing"
)

// Plan D11 item 3 (human, 2026-11-21; finding cp3-rebuild-cash-basis.md): the
// payer reads of the cash basis (postedPaymentsOf, applicationsOf) drive from
// the payer-line table by its document index. With no statistics (what a
// Books database has) the planner took idx_books_je_status_date for
// `pe.status = 'posted'`, so each document's read walked every posted entry of
// the book and the whole-book rebuild was quadratic.
func TestCashBasisPayerReadsDriveFromTheirLines(t *testing.T) {
	b := newAPBook(t)
	v := apVendor(t, b, "Plan Supply Co")
	bill := apBill(t, b, v, "2026-10-01", "2026-10-31", 10000)
	apPayBills(t, b, v, "2026-10-10", map[string]int{bill.Id: 3000})
	applied := apVendorCredit(t, b, v, "2026-10-06", 2000)
	apApply(t, b, applied, bill, "2026-10-12", 1000)
	refunded := apVendorCredit(t, b, v, "2026-10-07", 5000)
	apRefund(t, b, v, "2026-10-25", map[string]int{refunded.Id: 2000})

	// Each payer read sends one statement; it names its payer-line table and
	// binds the document on that table's line field.
	type payer struct{ table, field, entryField string }
	reads := []struct {
		d     cashDeferral
		docID string
	}{
		{billCashDeferral, bill.Id},
		{vendorCreditCashDeferral, applied.Id},
		{vendorCreditCashDeferral, refunded.Id},
	}
	var mu sync.Mutex
	var statements []string
	recordStatements(t, b.app, func(statement string) {
		if !strings.Contains(statement, "JOIN books_journal_entries pe ON pe.document") {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		statements = append(statements, strings.TrimSpace(statement))
	}, func() {
		for _, r := range reads {
			payments, err := documentPayments(b.app, r.d, r.docID)
			if err != nil {
				t.Fatalf("documentPayments(%s %s): %v", r.d.Kind, r.docID, err)
			}
			if len(payments) == 0 {
				t.Fatalf("documentPayments(%s %s) found no payment; the book must have one", r.d.Kind, r.docID)
			}
		}
	})

	payerOf := func(statement string) (payer, bool) {
		for _, d := range []cashDeferral{billCashDeferral, vendorCreditCashDeferral} {
			for _, p := range d.Balance.Payers {
				if p.NoCash {
					continue
				}
				if strings.Contains(statement, "FROM "+p.LinesCollection+" ") &&
					(strings.Contains(statement, "pl."+p.LineField+" = ") || strings.Contains(statement, "a."+p.LineField+" = ")) {
					return payer{p.LinesCollection, p.LineField, p.EntryField}, true
				}
			}
		}
		return payer{}, false
	}

	want := []payer{
		{billPaymentLinesCollection, "bill", ""},
		{vendorCreditApplicationsCollection, "bill", "vendor_credit"},
		{vendorCreditApplicationsCollection, "vendor_credit", "vendor_credit"},
		{vendorRefundLinesCollection, "vendor_credit", ""},
	}
	var seen []payer
	steps := explainStatements(t, b.app, statements)
	for i, statement := range statements {
		p, ok := payerOf(statement)
		if !ok {
			t.Errorf("statement %d names no payer of the bill or the vendor credit: %s", i, statement)
			continue
		}
		seen = append(seen, p)
		var plan []planStep
		for _, s := range steps {
			if s.Statement == i {
				plan = append(plan, s)
			}
		}
		var details []string
		for _, s := range plan {
			details = append(details, s.Detail)
		}
		for _, s := range plan {
			if strings.Contains(s.Detail, "idx_books_je_status_date") {
				t.Errorf("%s by %s: a step uses idx_books_je_status_date: %q\nplan: %q", p.table, p.field, s.Detail, details)
			}
		}
		first := slices.IndexFunc(plan, func(s planStep) bool {
			verb, _ := stepVerb(s.Detail)
			return verb == "SCAN" || verb == "SEARCH"
		})
		if first < 0 {
			t.Errorf("%s by %s: no step reads a table; plan: %q", p.table, p.field, details)
			continue
		}
		lead := plan[first]
		byLines := slices.Contains(lead.Tables, p.table) && strings.HasPrefix(lead.Detail, "SEARCH ") &&
			strings.Contains(lead.Detail, "USING ") && strings.Contains(lead.Detail, "("+p.field+"=?")
		// A vendor credit's own applications join its entry on the field they
		// bind (pe.document = a.vendor_credit = the credit), so the planner may
		// look up that one document's entry first: a bound read of one
		// document, not a walk of the posted entries.
		byDocument := p.field == p.entryField && strings.HasPrefix(lead.Detail, "SEARCH ") &&
			slices.Contains(lead.Tables, "books_journal_entries") &&
			strings.Contains(lead.Detail, "idx_books_je_document (document=?")
		if !byLines && !byDocument {
			t.Errorf("%s by %s: the first step is %q (tables %v), want a SEARCH of %s by its %s index\nplan: %q",
				p.table, p.field, lead.Detail, lead.Tables, p.table, p.field, details)
		}
	}
	for _, p := range want {
		if !slices.Contains(seen, p) {
			t.Errorf("no recorded read of %s by %s; recorded %v", p.table, p.field, seen)
		}
	}
}
