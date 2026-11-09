package books

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// Go-only refusal texts of posting, voiding and correcting an invoice.
const (
	msgInvoiceCannotGo      = "%s cannot go from %s to %s."
	msgInvoiceEditMissing   = "The invoice being edited does not exist."
	msgInvoiceEditNotPosted = "%s is %s and cannot be edited."
	msgInvoiceNoEntry       = "%s has no journal entry."
	msgLineUnknownKind      = "Line %d: an invoice line is an item, description, subtotal or percent line."
	msgLineNoIncomeAccount  = "Line %d: %s has no income account. Choose one on the product or service."
	msgTaxAgencyNoAccount   = "%s has no liability account. Choose one on the tax agency."
	msgTaxComponentNoAgency = "%s has no tax agency. Choose one on the tax rate."
)

// replacingInvoiceKeyStart marks, in the app store, a posted invoice whose
// correction is posting.
const replacingInvoiceKeyStart = "books.invoice.replacing."

// markReplacing marks the posted invoice a correction is replacing, so its
// own update hook lets Books set it void with replaced_by while its entry is
// already voided by the correction's post (voidReplaced). The returned func
// clears the mark; the app store is shared by an app and its transactions.
func markReplacing(app core.App, invoiceID string) func() {
	app.Store().Set(replacingInvoiceKeyStart+invoiceID, true)
	return func() { app.Store().Remove(replacingInvoiceKeyStart + invoiceID) }
}

func isReplacing(app core.App, invoiceID string) bool {
	return app.Store().Has(replacingInvoiceKeyStart + invoiceID)
}

// invoiceName is how a refusal names an invoice: "Invoice 1001", or "This
// invoice" while it has no number.
func invoiceName(r *core.Record) string {
	noun, this, _ := entryNouns(docTypeInvoice)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return this
}

// postInvoice posts a draft invoice while its update moves it from draft to
// posted, inside the update's transaction: any refusal rolls back every row
// it wrote (the A/R account, the tax lines, the entry, the number). The
// header guards have already run on invoice. It refuses an inactive customer
// (a correction keeps its original's), a stored line its kind does not allow
// and a zero total, writes the tax snapshot, posts the journal entry through
// postDocument, and copies the entry's number. A correction voids its original.
func postInvoice(tx core.App, invoice *core.Record, now time.Time) error {
	original, err := correctedInvoice(tx, invoice)
	if err != nil {
		return err
	}
	if err := checkPostCustomer(tx, invoice); err != nil {
		return err
	}
	lines, err := invoiceLines(tx, invoice.Id)
	if err != nil {
		return err
	}
	if err := checkStoredLines(tx, lines); err != nil {
		return err
	}
	totals, err := invoiceTotals(tx, invoice, lineInputs(lines))
	if err != nil {
		return err
	}
	if err := checkInvoiceTotals(totals); err != nil {
		return err
	}
	if totals.Total == 0 {
		return refuse(msgZeroTotal)
	}
	if err := restateLineAmounts(tx, invoice.Id, lines, totals); err != nil {
		return err
	}
	setInvoiceTotals(invoice, totals)

	taxes, err := componentTaxes(tx, totals)
	if err != nil {
		return err
	}
	postingLines, err := invoicePostingLines(tx, lines, totals, taxes)
	if err != nil {
		return err
	}
	if err := writeTaxSnapshot(tx, invoice, totals, taxes); err != nil {
		return err
	}
	actor := invoice.GetString("posted_by")
	post := documentPost{
		DocType:    docTypeInvoice,
		DocumentID: invoice.Id,
		Date:       invoice.GetString("date"),
		Memo:       invoice.GetString("memo"),
		Actor:      actor,
		Customer:   invoice.GetString("customer"),
		Lines:      postingLines,
	}
	if original != nil {
		post.Replaces = original.GetString("entry")
	}
	entry, err := postDocument(tx, post)
	if err != nil {
		return err
	}
	invoice.Set("number", entry.GetString("number"))
	invoice.Set("sequence", entry.GetInt("sequence"))
	invoice.Set("entry", entry.Id)
	invoice.Set("posted_at", now)
	invoice.Set("sort_key", invoiceSortKey(invoice))
	if original == nil {
		return nil
	}
	return voidReplacedInvoice(tx, original, invoice.Id, actor, now)
}

// correctedInvoice is the posted invoice a correction replaces, nil for an
// invoice that replaces none. Only a posted invoice with its entry can be
// corrected: a void one is already replaced or voided.
func correctedInvoice(tx core.App, invoice *core.Record) (*core.Record, error) {
	id := invoice.GetString("replaces")
	if id == "" {
		return nil, nil
	}
	original, err := tx.FindRecordById("books_invoices", id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuse(msgInvoiceEditMissing)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the invoice being edited: %w", err)
	}
	if original.GetString("status") != statusPosted {
		return nil, refuse(msgInvoiceEditNotPosted, invoiceName(original), original.GetString("status"))
	}
	if original.GetString("entry") == "" {
		return nil, refuse(msgInvoiceNoEntry, invoiceName(original))
	}
	return original, nil
}

// checkPostCustomer refuses to post for an inactive customer, under the
// Customer field, before the journal line guard would refuse the entry's lines
// with no field (Q23). A correction keeps its original's customer.
func checkPostCustomer(tx core.App, invoice *core.Record) error {
	id := invoice.GetString("customer")
	customer, err := tx.FindRecordById("books_customers", id)
	if errors.Is(err, sql.ErrNoRows) {
		// The schema refuses a customer that does not exist.
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the invoice's customer: %w", err)
	}
	if !customer.GetBool("inactive") {
		return nil
	}
	keeps, err := keepsCorrectedCustomer(tx, invoice, id)
	if err != nil || keeps {
		return err
	}
	return refuseNamedField("customer", msgCustomerInactive, customer.GetString("display_name"))
}

// keepsCorrectedCustomer reports whether invoice corrects an invoice of the
// customer id: the user did not choose that customer again, so it may be
// inactive.
func keepsCorrectedCustomer(tx core.App, invoice *core.Record, id string) (bool, error) {
	replaces := invoice.GetString("replaces")
	if replaces == "" {
		return false, nil
	}
	original, err := tx.FindRecordById("books_invoices", replaces)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("books: read the invoice being edited: %w", err)
	}
	return original.GetString("customer") == id, nil
}

// checkStoredLines holds every stored line to its kind with the line guard's
// rules, so the entry is never built from a line the guard would refuse (one
// written past it). A bundle on a line is refused too.
func checkStoredLines(tx core.App, lines []*core.Record) error {
	for i, line := range lines {
		n := i + 1
		switch line.GetString("kind") {
		case lineKindItem, lineKindDescription, lineKindSubtotal, lineKindPercent:
		default:
			return refuse(msgLineUnknownKind, n)
		}
		if err := checkLineCells(line, n); err != nil {
			return err
		}
	}
	return nil
}

// restateLineAmounts writes each line's computed amount where the stored one
// differs, so the stored lines match the entry they post. The line guard lets
// an amount through while the invoice is marked restating.
func restateLineAmounts(tx core.App, invoiceID string, lines []*core.Record, totals documentTotalsResult) error {
	done := markRestating(tx, invoiceID)
	defer done()
	for i, line := range lines {
		if int64(line.GetInt("amount")) == totals.Amounts[i] {
			continue
		}
		line.Set("amount", totals.Amounts[i])
		if err := tx.Save(line); err != nil {
			return err
		}
	}
	return nil
}

// componentTax is one tax component of the header rate with the agency it is
// owed to and that agency's liability account.
type componentTax struct {
	documentTaxLine
	agency, account string
}

func componentTaxes(tx core.App, totals documentTotalsResult) ([]componentTax, error) {
	out := make([]componentTax, len(totals.TaxLines))
	for i, tl := range totals.TaxLines {
		rate, err := tx.FindRecordById("books_tax_rates", tl.ComponentID)
		if err != nil {
			return nil, fmt.Errorf("books: read the tax rate of the invoice: %w", err)
		}
		if rate.GetString("agency") == "" {
			return nil, refuseNamed(msgTaxComponentNoAgency, rate.GetString("name"))
		}
		agency, err := tx.FindRecordById("books_tax_agencies", rate.GetString("agency"))
		if err != nil {
			return nil, fmt.Errorf("books: read the tax agency of %s: %w", rate.GetString("name"), err)
		}
		if agency.GetString("account") == "" {
			return nil, refuseNamed(msgTaxAgencyNoAccount, agency.GetString("name"))
		}
		out[i] = componentTax{documentTaxLine: tl, agency: agency.Id, account: agency.GetString("account")}
	}
	return out, nil
}

// invoicePostingLines are the entry's lines: Accounts receivable debited for
// the total; each income account credited with the sum of the item and
// percent amounts of the products that name it (a sum below zero is a debit,
// a zero sum no line), in account number order; each tax component credited
// to its agency's liability account, in the rate's order (a zero tax no line).
func invoicePostingLines(tx core.App, lines []*core.Record, totals documentTotalsResult, taxes []componentTax) ([]postingLine, error) {
	receivable, err := ensureReceivables(tx)
	if err != nil {
		return nil, err
	}
	out := []postingLine{{Account: receivable.Id, Debit: totals.Total}}

	income, err := incomeByAccount(tx, lines, totals)
	if err != nil {
		return nil, err
	}
	out = append(out, income...)
	for _, t := range taxes {
		if t.Amount != 0 {
			out = append(out, signedLine(t.account, t.Amount))
		}
	}
	return out, nil
}

// signedLine credits a positive amount and debits a negative one.
func signedLine(account string, amount int64) postingLine {
	if amount < 0 {
		return postingLine{Account: account, Debit: -amount}
	}
	return postingLine{Account: account, Credit: amount}
}

func incomeByAccount(tx core.App, lines []*core.Record, totals documentTotalsResult) ([]postingLine, error) {
	sums := map[string]int64{}
	for i, line := range lines {
		if !totals.HasAmount[i] {
			continue
		}
		kind := line.GetString("kind")
		if kind != lineKindItem && kind != lineKindPercent {
			continue
		}
		product, err := tx.FindRecordById("books_products", line.GetString("product"))
		if err != nil {
			return nil, fmt.Errorf("books: read the product of line %d: %w", i+1, err)
		}
		if product.GetString("type") == "bundle" {
			return nil, refuse(msgLineBundle, i+1)
		}
		account := product.GetString("income_account")
		if account == "" {
			return nil, refuseNamed(msgLineNoIncomeAccount, i+1, product.GetString("name"))
		}
		sums[account] += totals.Amounts[i]
	}
	type incomeAccount struct {
		id, number string
		amount     int64
	}
	accounts := make([]incomeAccount, 0, len(sums))
	for id, amount := range sums {
		if amount == 0 {
			continue
		}
		account, err := tx.FindRecordById("books_accounts", id)
		if err != nil {
			return nil, fmt.Errorf("books: read an income account of the invoice: %w", err)
		}
		accounts = append(accounts, incomeAccount{id: id, number: account.GetString("number"), amount: amount})
	}
	slices.SortFunc(accounts, func(a, b incomeAccount) int {
		return compareChartOrder(a.number, a.id, b.number, b.id)
	})
	out := make([]postingLine, len(accounts))
	for i, a := range accounts {
		out[i] = signedLine(a.id, a.amount)
	}
	return out, nil
}

// writeTaxSnapshot stores the posted tax of each component of the header rate
// (the tax-rates contract): a later change to a rate never changes what a
// posted invoice charged.
func writeTaxSnapshot(tx core.App, invoice *core.Record, totals documentTotalsResult, taxes []componentTax) error {
	col, err := tx.FindCachedCollectionByNameOrId("books_invoice_tax_lines")
	if err != nil {
		return err
	}
	for i, t := range taxes {
		r := core.NewRecord(col)
		r.Set("invoice", invoice.Id)
		r.Set("rate", invoice.GetString("tax_rate"))
		r.Set("component", t.ComponentID)
		r.Set("agency", t.agency)
		r.Set("rate_ppm", t.Ppm)
		r.Set("taxable_amount", totals.TaxableTotal)
		r.Set("amount", t.Amount)
		r.Set("position", i)
		if err := tx.Save(r); err != nil {
			return fmt.Errorf("books: write the invoice's tax line: %w", err)
		}
	}
	return nil
}

// voidReplacedInvoice sets the original of a posted correction void with
// replaced_by. Its entry is already void: the correction's entry replaced it.
func voidReplacedInvoice(tx core.App, original *core.Record, correctionID, actor string, now time.Time) error {
	done := markReplacing(tx, original.Id)
	defer done()
	fresh, err := tx.FindRecordById("books_invoices", original.Id)
	if err != nil {
		return err
	}
	fresh.Set("status", statusVoid)
	fresh.Set("replaced_by", correctionID)
	fresh.Set("voided_by", actor)
	fresh.Set("voided_at", now)
	return tx.Save(fresh)
}

// voidInvoice voids a posted invoice's entry while the invoice moves from
// posted to void, inside the update's transaction: the entry's own hook posts
// the void reversal in the original period under the same number (voidEntry),
// and the close date applies to it as to any post.
func voidInvoice(tx core.App, invoice *core.Record, now time.Time) error {
	entryID := invoice.GetString("entry")
	if entryID == "" {
		return refuse(msgInvoiceNoEntry, invoiceName(invoice))
	}
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the invoice's journal entry: %w", err)
	}
	entry.Set("status", statusVoid)
	entry.Set("voided_by", invoice.GetString("voided_by"))
	if err := tx.Save(entry); err != nil {
		return err
	}
	invoice.Set("voided_at", now)
	return nil
}
