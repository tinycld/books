package books

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/audit"
)

// auditedCollections are the Books collections a person writes. Left out:
// books_account_balances, which only Books writes, and the books_access view,
// which nobody writes. Core's audit hooks are request hooks, so they log what
// a person asked for (a post, a void); the reversal Books writes inside it is
// part of that same logged update. The auto-reverse sweep makes no request,
// so it writes its own row (logAutoReversal, auto_reverse.go).
// registrations_test.go fails when a new collection is neither here nor
// declared server-only.
//
// books_bank_transactions is here because a person may move a transaction's status
// between For review and Excluded; Go writes every other part of it.
//
// It takes the app because five labels read another row: an admin grant is
// labeled by the user it grants, a line by its account, a bundle row by its
// bundle and product, a bank connection by its account, and a bank import by its file.
//
// A tax ID (an SSN for a sole proprietor) is redacted: it must not stay
// readable in the audit log after it is corrected or the vendor is deleted.
// The labels read no redacted field, because core does not redact the label.
func auditedCollections(app core.App) map[string]*audit.CollectionConfig {
	return map[string]*audit.CollectionConfig{
		"books_accounts":        {ExtractLabel: auditAccountLabel},
		"books_customers":       {ExtractLabel: audit.LabelFromField("display_name"), Redact: []string{"sort_key"}},
		"books_vendors":         {ExtractLabel: audit.LabelFromField("display_name"), Redact: []string{"tax_id", "sort_key"}},
		"books_products":        {ExtractLabel: audit.LabelFromField("name"), Redact: []string{"sort_key"}},
		"books_bundle_items":    {ExtractLabel: func(r *core.Record) string { return bundleItemLabel(app, r) }},
		"books_tax_agencies":    {ExtractLabel: audit.LabelFromField("name"), Redact: []string{"sort_key"}},
		"books_tax_rates":       {ExtractLabel: audit.LabelFromField("name"), Redact: []string{"sort_key"}},
		"books_journal_entries": {ExtractLabel: entryLabel},
		"books_journal_lines":   {ExtractLabel: func(r *core.Record) string { return lineLabel(app, r) }},
		"books_invoices":        {ExtractLabel: invoiceLabel, Redact: []string{"sort_key"}},
		"books_invoice_lines":   {ExtractLabel: func(r *core.Record) string { return invoiceLineLabel(app, r) }},
		"books_sales_receipts":  {ExtractLabel: salesReceiptLabel, Redact: []string{"sort_key"}},
		"books_sales_receipt_lines": {
			ExtractLabel: func(r *core.Record) string { return salesReceiptLineLabel(app, r) },
		},
		"books_estimates": {ExtractLabel: estimateLabel, Redact: []string{"sort_key"}},
		"books_estimate_lines": {
			ExtractLabel: func(r *core.Record) string { return estimateLineLabel(app, r) },
		},
		"books_bills": {ExtractLabel: billLabel, Redact: []string{"sort_key"}},
		"books_bill_lines": {
			ExtractLabel: func(r *core.Record) string { return billLineLabel(app, r) },
		},
		"books_settings": {
			ExtractLabel: func(*core.Record) string { return "Books settings" },
			Redact:       []string{"tax_id"},
		},
		"books_doc_sequences":   {ExtractLabel: audit.LabelFromField("doc_type")},
		"books_close_overrides": {ExtractLabel: audit.LabelFromField("reason")},
		"books_admins":          {ExtractLabel: func(r *core.Record) string { return userLabel(app, r.GetString("user")) }},
		"books_bank_connections": {
			ExtractLabel: func(r *core.Record) string { return bankConnectionLabel(app, r) },
		},
		"books_bank_files": {ExtractLabel: audit.LabelFromField("name")},
		"books_bank_imports": {
			ExtractLabel: func(r *core.Record) string { return bankImportLabel(app, r) },
		},
		"books_bank_transactions": {ExtractLabel: bankTransactionLabel},
	}
}

func registerAudit(app *pocketbase.PocketBase) {
	audited := auditedCollections(app)
	for _, name := range slices.Sorted(maps.Keys(audited)) {
		audit.RegisterCollection(app, name, audited[name])
	}
}

var auditAccountLabel = audit.LabelFromFields("number", "name")

func entryLabel(r *core.Record) string {
	noun, _, draft := entryNouns(r.GetString("doc_type"))
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft + " " + r.GetString("date")
}

// lineLabel names a line by its account and side: "1010:Petty Cash debit
// 25.50". A missing account (a lookup error) falls back to its id, so the
// audit row is still written.
func lineLabel(app core.App, r *core.Record) string {
	account := r.GetString("account")
	if acc, err := app.FindRecordById("books_accounts", account); err == nil {
		account = auditAccountLabel(acc)
	}
	if debit := r.GetInt("debit"); debit > 0 {
		return account + " debit " + formatMinor(debit)
	}
	return account + " credit " + formatMinor(r.GetInt("credit"))
}

// invoiceLabel names an invoice by its number: "Invoice 1001". A draft has no
// number: "Draft invoice".
func invoiceLabel(r *core.Record) string {
	if n := r.GetString("number"); n != "" {
		return "Invoice " + n
	}
	return "Draft invoice"
}

// invoiceLineLabel names a line by its invoice and its place on it: "Invoice
// 1001: line 2". An invoice that cannot be read (deleted with its lines)
// falls back to its id, so the audit row is still written.
func invoiceLineLabel(app core.App, r *core.Record) string {
	invoice := r.GetString("invoice")
	if inv, err := app.FindRecordById("books_invoices", invoice); err == nil {
		invoice = invoiceLabel(inv)
	}
	return fmt.Sprintf("%s: line %d", invoice, r.GetInt("position")+1)
}

// salesReceiptLabel names a sales receipt by its number: "Sales receipt
// 1004". A draft has no number: "Draft sales receipt".
func salesReceiptLabel(r *core.Record) string {
	if n := r.GetString("number"); n != "" {
		return "Sales receipt " + n
	}
	return "Draft sales receipt"
}

// salesReceiptLineLabel is invoiceLineLabel for a sales receipt's line:
// "Sales receipt 1004: line 2".
func salesReceiptLineLabel(app core.App, r *core.Record) string {
	receipt := r.GetString("sales_receipt")
	if rec, err := app.FindRecordById("books_sales_receipts", receipt); err == nil {
		receipt = salesReceiptLabel(rec)
	}
	return fmt.Sprintf("%s: line %d", receipt, r.GetInt("position")+1)
}

// estimateLabel names an estimate by its number: "Estimate 1001". An estimate
// is numbered when it is created, so it has no draft label.
func estimateLabel(r *core.Record) string {
	noun, _, _ := entryNouns(docTypeEstimate)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return noun
}

// estimateLineLabel is invoiceLineLabel for an estimate's line: "Estimate
// 1001: line 2".
func estimateLineLabel(app core.App, r *core.Record) string {
	estimate := r.GetString("estimate")
	if rec, err := app.FindRecordById("books_estimates", estimate); err == nil {
		estimate = estimateLabel(rec)
	}
	return fmt.Sprintf("%s: line %d", estimate, r.GetInt("position")+1)
}

// billLabel names a bill by its number: "Bill 1003". A draft has no number:
// "Draft bill".
func billLabel(r *core.Record) string {
	noun, _, draft := entryNouns(docTypeBill)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}

// billLineLabel names a bill's line as the form and the refusals do, by its
// table and its place among that table's lines: "Bill 1003: Account line 2".
// r is placed among the bill's stored lines, so a deleted line keeps its
// place. Lines that cannot be read fall back to the line's position, so the
// audit row is still written.
func billLineLabel(app core.App, r *core.Record) string {
	bill := r.GetString("bill")
	if rec, err := app.FindRecordById("books_bills", bill); err == nil {
		bill = billLabel(rec)
	}
	lines, err := salesDocLines(app, billKind, r.GetString("bill"))
	if err != nil {
		return fmt.Sprintf("%s: line %d", bill, r.GetInt("position")+1)
	}
	return bill + ": " + lineRowLabel(billKind, withLine(lines, r), r)
}

// bundleItemLabel names a bundle row by its bundle and product: "Home office
// setup kit: Wireless access point". A product that cannot be read falls back
// to its id, so the audit row is still written.
func bundleItemLabel(app core.App, r *core.Record) string {
	return productName(app, r.GetString("bundle")) + ": " + productName(app, r.GetString("product"))
}

func productName(app core.App, id string) string {
	if p, err := app.FindRecordById("books_products", id); err == nil {
		return p.GetString("name")
	}
	return id
}

// userLabel names a user as "Name <email>" (users require both). A user that
// cannot be read falls back to the id, so the audit row is still written.
func userLabel(app core.App, userID string) string {
	u, err := app.FindRecordById("users", userID)
	if err != nil {
		return userID
	}
	return u.GetString("name") + " <" + u.Email() + ">"
}

// bankImportLabel names an import by the file it read. A file that cannot be
// read gives "", so the audit row is still written.
func bankImportLabel(app core.App, r *core.Record) string {
	file, err := app.FindRecordById("books_bank_files", r.GetString("file"))
	if err != nil {
		return ""
	}
	return file.GetString("name")
}

// bankTransactionLabel names a transaction by its day and description: "2026-10-27
// CHECK 1050". A person excludes or moves back a transaction by the row they see in
// the For review list, so the audit log names it the same way.
func bankTransactionLabel(r *core.Record) string {
	return strings.TrimSpace(r.GetString("date") + " " + r.GetString("description"))
}
