package books

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/audit"
	"tinycld.org/core/reports"
)

// auditedCollections are the Books collections a person writes. Left out:
// books_account_balances, which only Books writes, and the books_access and
// books_party_balances views, which nobody writes. Core's audit hooks are
// request hooks, so they log what a person asked for (a post, a void); the reversal Books writes inside it is
// part of that same logged update. The auto-reverse sweep makes no request,
// so it writes its own row (logAutoReversal, auto_reverse.go).
// registrations_test.go fails when a new collection is neither here nor
// declared server-only.
//
// books_bank_transactions is here because a person may move a transaction's status
// between For review and Excluded; Go writes every other part of it.
//
// It takes the app because these labels read another row: an admin grant is
// labeled by the user it grants, a line by its account or its document, a
// bundle row by its bundle and product, a bank connection by its account, a
// bank import by its file, a customer's response by its estimate, a vendor
// credit application by its credit and its bill, a vendor refund line by its
// refund and its credit, and an attachment by its
// bill, expense or vendor credit.
//
// A tax ID (an SSN for a sole proprietor) is redacted: it must not stay
// readable in the audit log after it is corrected or the vendor is deleted.
// An estimate's public_token is redacted too: it is the credential of the
// customer link, and a copy in the log would be a second key to it. The labels
// read no redacted field, because core does not redact the label.
func auditedCollections(app core.App) map[string]*audit.CollectionConfig {
	return map[string]*audit.CollectionConfig{
		"books_accounts":        {ExtractLabel: auditAccountLabel},
		"books_customers":       {ExtractLabel: audit.LabelFromField("display_name"), Redact: []string{"sort_key"}},
		"books_vendors":         {ExtractLabel: audit.LabelFromField("display_name"), Redact: []string{"tax_id", "sort_key"}},
		"books_products":        {ExtractLabel: audit.LabelFromField("name"), Redact: []string{"sort_key"}},
		"books_party_contacts":  {ExtractLabel: audit.LabelFromField("name")},
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
		"books_estimates": {ExtractLabel: estimateLabel, Redact: []string{"sort_key", "public_token"}},
		"books_estimate_lines": {
			ExtractLabel: func(r *core.Record) string { return estimateLineLabel(app, r) },
		},
		"books_estimate_responses": {
			ExtractLabel: func(r *core.Record) string { return estimateResponseLabel(app, r) },
		},
		"books_credit_memos": {ExtractLabel: creditMemoLabel, Redact: []string{"sort_key"}},
		"books_credit_memo_lines": {
			ExtractLabel: func(r *core.Record) string { return creditMemoLineLabel(app, r) },
		},
		"books_bills": {ExtractLabel: billLabel, Redact: []string{"sort_key"}},
		"books_bill_lines": {
			ExtractLabel: func(r *core.Record) string { return billLineLabel(app, r) },
		},
		"books_expenses": {ExtractLabel: expenseLabel, Redact: []string{"sort_key"}},
		"books_expense_lines": {
			ExtractLabel: func(r *core.Record) string { return expenseLineLabel(app, r) },
		},
		vendorCreditsCollection: {ExtractLabel: vendorCreditLabel, Redact: []string{"sort_key"}},
		vendorCreditLinesCollection: {
			ExtractLabel: func(r *core.Record) string { return vendorCreditLineLabel(app, r) },
		},
		vendorCreditApplicationsCollection: {
			ExtractLabel: func(r *core.Record) string { return vendorCreditApplicationLabel(app, r) },
		},
		"books_payments": {ExtractLabel: paymentLabel, Redact: []string{"sort_key"}},
		"books_payment_applications": {
			ExtractLabel: func(r *core.Record) string { return paymentApplicationLabel(app, r) },
		},
		billPaymentsCollection: {ExtractLabel: billPaymentLabel, Redact: []string{"sort_key"}},
		billPaymentLinesCollection: {
			ExtractLabel: func(r *core.Record) string { return billPaymentLineLabel(app, r) },
		},
		vendorRefundsCollection: {ExtractLabel: vendorRefundName, Redact: []string{"sort_key"}},
		vendorRefundLinesCollection: {
			ExtractLabel: func(r *core.Record) string { return vendorRefundLineLabel(app, r) },
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
		"books_attachments": {
			ExtractLabel: func(r *core.Record) string { return attachmentLabel(app, r) },
		},
	}
}

// auditParentFields maps each line collection to the field that names its
// document. The books_audit_log view (migration 2100000025) reads the same
// collections to give a line's audit row its document, and Register declares them
// as the view's sources, because a line write can change that document.
var auditParentFields = map[string]string{
	"books_journal_lines":              "entry",
	"books_invoice_lines":              "invoice",
	"books_sales_receipt_lines":        "sales_receipt",
	"books_estimate_lines":             "estimate",
	"books_credit_memo_lines":          "credit_memo",
	"books_bill_lines":                 "bill",
	"books_expense_lines":              "expense",
	"books_bundle_items":               "bundle",
	"books_estimate_responses":         "estimate",
	"books_payment_applications":       "payment",
	billPaymentLinesCollection:         "payment",
	vendorCreditLinesCollection:        "vendor_credit",
	vendorCreditApplicationsCollection: "vendor_credit",
	vendorRefundLinesCollection:        "refund",
}

// auditLineCollections are the keys of auditParentFields in name order.
func auditLineCollections() []string {
	return slices.Sorted(maps.Keys(auditParentFields))
}

// auditRecordTypeOptions labels each audited collection for the Audit Log's
// Record type param, in the order the param lists them: documents, lines,
// lists, banking, then settings and access. The fixture's
// AUDIT_RECORD_TYPE_OPTIONS holds the same list (testdata/audit_log_spec.json
// pins both).
func auditRecordTypeOptions() []reports.Option {
	return []reports.Option{
		{Value: "books_invoices", Label: "Invoice"},
		{Value: "books_sales_receipts", Label: "Sales receipt"},
		{Value: "books_estimates", Label: "Estimate"},
		{Value: "books_estimate_responses", Label: "Estimate response"},
		{Value: "books_credit_memos", Label: "Credit memo"},
		{Value: "books_bills", Label: "Bill"},
		{Value: "books_expenses", Label: "Expense"},
		{Value: vendorCreditsCollection, Label: "Vendor credit"},
		{Value: "books_payments", Label: "Payment"},
		{Value: billPaymentsCollection, Label: "Bill payment"},
		{Value: vendorRefundsCollection, Label: "Vendor refund"},
		{Value: "books_journal_entries", Label: "Journal entry"},
		{Value: "books_invoice_lines", Label: "Invoice line"},
		{Value: "books_sales_receipt_lines", Label: "Sales receipt line"},
		{Value: "books_estimate_lines", Label: "Estimate line"},
		{Value: "books_credit_memo_lines", Label: "Credit memo line"},
		{Value: "books_bill_lines", Label: "Bill line"},
		{Value: "books_expense_lines", Label: "Expense line"},
		{Value: vendorCreditLinesCollection, Label: "Vendor credit line"},
		{Value: "books_payment_applications", Label: "Payment application"},
		{Value: billPaymentLinesCollection, Label: "Bill payment line"},
		{Value: vendorCreditApplicationsCollection, Label: "Vendor credit application"},
		{Value: vendorRefundLinesCollection, Label: "Vendor refund line"},
		{Value: "books_journal_lines", Label: "Journal line"},
		{Value: "books_attachments", Label: "Attachment"},
		{Value: "books_accounts", Label: "Account"},
		{Value: "books_customers", Label: "Customer"},
		{Value: "books_vendors", Label: "Vendor"},
		{Value: "books_party_contacts", Label: "Contact"},
		{Value: "books_products", Label: "Product or service"},
		{Value: "books_bundle_items", Label: "Bundle item"},
		{Value: "books_tax_agencies", Label: "Tax agency"},
		{Value: "books_tax_rates", Label: "Tax rate"},
		{Value: "books_bank_connections", Label: "Bank connection"},
		{Value: "books_bank_files", Label: "Bank file"},
		{Value: "books_bank_imports", Label: "Bank import"},
		{Value: "books_bank_transactions", Label: "Bank transaction"},
		{Value: "books_settings", Label: "Books settings"},
		{Value: "books_doc_sequences", Label: "Document numbering"},
		{Value: "books_close_overrides", Label: "Close date override"},
		{Value: "books_admins", Label: "Books admin"},
	}
}

// auditEvents are the Audit Log's events, as the books_audit_log view writes
// them, in the order the Event param lists them.
func auditEvents() []reports.Option {
	return []reports.Option{
		{Value: "added", Label: "Added"},
		{Value: "changed", Label: "Changed"},
		{Value: "posted", Label: "Posted"},
		{Value: "voided", Label: "Voided"},
		{Value: "deleted", Label: "Deleted"},
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

// creditMemoLabel names a credit memo by its number: "Credit memo 1001". A
// draft has no number: "Draft credit memo".
func creditMemoLabel(r *core.Record) string {
	noun, _, draft := entryNouns(docTypeCreditMemo)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}

// creditMemoLineLabel is invoiceLineLabel for a credit memo's line: "Credit
// memo 1001: line 2".
func creditMemoLineLabel(app core.App, r *core.Record) string {
	memo := r.GetString("credit_memo")
	if rec, err := app.FindRecordById("books_credit_memos", memo); err == nil {
		memo = creditMemoLabel(rec)
	}
	return fmt.Sprintf("%s: line %d", memo, r.GetInt("position")+1)
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

// expenseLabel names an expense by its number: "Expense 1004". A draft has no
// number: "Draft expense".
func expenseLabel(r *core.Record) string {
	noun, _, draft := entryNouns(docTypeExpense)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}

// expenseLineLabel is billLineLabel for an expense's line: "Expense 1004:
// Account line 2".
func expenseLineLabel(app core.App, r *core.Record) string {
	expense := r.GetString("expense")
	if rec, err := app.FindRecordById(expensesCollection, expense); err == nil {
		expense = expenseLabel(rec)
	}
	lines, err := salesDocLines(app, expenseKind, r.GetString("expense"))
	if err != nil {
		return fmt.Sprintf("%s: line %d", expense, r.GetInt("position")+1)
	}
	return expense + ": " + lineRowLabel(expenseKind, withLine(lines, r), r)
}

// vendorCreditLabel names a vendor credit by its number: "Vendor credit 1002".
// A draft has no number: "Draft vendor credit".
func vendorCreditLabel(r *core.Record) string {
	noun, _, draft := entryNouns(docTypeVendorCredit)
	if n := r.GetString("number"); n != "" {
		return noun + " " + n
	}
	return draft
}

// vendorCreditLineLabel is billLineLabel for a vendor credit's line: "Vendor
// credit 1002: Account line 2".
func vendorCreditLineLabel(app core.App, r *core.Record) string {
	credit := r.GetString("vendor_credit")
	if rec, err := app.FindRecordById(vendorCreditsCollection, credit); err == nil {
		credit = vendorCreditLabel(rec)
	}
	lines, err := salesDocLines(app, vendorCreditKind, r.GetString("vendor_credit"))
	if err != nil {
		return fmt.Sprintf("%s: line %d", credit, r.GetInt("position")+1)
	}
	return credit + ": " + lineRowLabel(vendorCreditKind, withLine(lines, r), r)
}

// vendorCreditApplicationLabel names an application by its vendor credit and
// its bill: "Vendor credit 1002: Bill 1003". A credit or a bill that cannot be
// read falls back to its id, so the audit row is still written.
func vendorCreditApplicationLabel(app core.App, r *core.Record) string {
	credit := r.GetString("vendor_credit")
	if rec, err := app.FindRecordById(vendorCreditsCollection, credit); err == nil {
		credit = vendorCreditLabel(rec)
	}
	bill := r.GetString("bill")
	if b, err := app.FindRecordById("books_bills", bill); err == nil {
		bill = billLabel(b)
	}
	return credit + ": " + bill
}

// vendorRefundLineLabel names a refund line by its refund and the vendor
// credit it refunds: "Vendor refund 1001: Vendor credit 1002". A refund or a
// credit that cannot be read (deleted with a draft refund) falls back to its
// id, so the audit row is still written.
func vendorRefundLineLabel(app core.App, r *core.Record) string {
	refund := r.GetString("refund")
	if rec, err := app.FindRecordById(vendorRefundsCollection, refund); err == nil {
		refund = vendorRefundName(rec)
	}
	credit := r.GetString("vendor_credit")
	if rec, err := app.FindRecordById(vendorCreditsCollection, credit); err == nil {
		credit = vendorCreditLabel(rec)
	}
	return refund + ": " + credit
}

// paymentLabel names a payment by its number: "Payment 1004". A draft has no
// number: "Draft payment".
func paymentLabel(r *core.Record) string {
	return paymentName(r)
}

// paymentApplicationLabel names an application by its payment and its
// invoice: "Payment 1004: Invoice 1009". A payment or an invoice that cannot be
// read (deleted with its applications) falls back to its id, so the audit row
// is still written.
func paymentApplicationLabel(app core.App, r *core.Record) string {
	payment := r.GetString("payment")
	if p, err := app.FindRecordById(paymentsCollection, payment); err == nil {
		payment = paymentLabel(p)
	}
	invoice := r.GetString("invoice")
	if inv, err := app.FindRecordById("books_invoices", invoice); err == nil {
		invoice = invoiceLabel(inv)
	}
	return payment + ": " + invoice
}

// billPaymentLabel names a bill payment by its number: "Bill payment 1004".
func billPaymentLabel(r *core.Record) string {
	return billPaymentName(r)
}

// billPaymentLineLabel names a bill payment line by its payment and its bill:
// "Bill payment 1004: Bill 1003". A payment or a bill that cannot be read
// falls back to its id, so the audit row is still written.
func billPaymentLineLabel(app core.App, r *core.Record) string {
	payment := r.GetString("payment")
	if p, err := app.FindRecordById(billPaymentsCollection, payment); err == nil {
		payment = billPaymentLabel(p)
	}
	bill := r.GetString("bill")
	if b, err := app.FindRecordById("books_bills", bill); err == nil {
		bill = billLabel(b)
	}
	return payment + ": " + bill
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
