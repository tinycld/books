package books

import (
	"database/sql"
	"errors"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// reportSources are the Books collections core's report engine reads (spec
// §5). Books stores days as YYYY-MM-DD text, so its days are TextDay dates.
// Each money field names its row's currency column, which posting stamps from
// the Books currency setting. A source with money fields also sets Currency to
// that setting; core uses it only for the rows a report makes when it reads
// no rows (an empty book's totals and computed rows). Json columns, sort and
// name keys, form links, close overrides, user relations and the vendors' terms,
// account number, expense account, 1099 and tax id fields are left out.
func reportSources() []reports.Source {
	sources := []reports.Source{
		{
			Key: "books.accounts", Collection: "books_accounts", Label: "Accounts",
			Fields: []reports.Field{
				{Key: "name", Label: "Name", Type: reports.Text, Aggregates: reports.MinMax},
				{Key: "full_name", Label: "Full name", Type: reports.Text, Aggregates: reports.MinMax},
				{Key: "number", Label: "Number", Type: reports.Text, Aggregates: reports.MinMax},
				{Key: "type", Label: "Type", Type: reports.Select, Options: accountTypeSelectOptions()},
				{Key: "detail_type", Label: "Detail type", Type: reports.Text},
				{Key: "description", Label: "Description", Type: reports.Text},
				{Key: "currency", Label: "Currency", Type: reports.Text},
				{Key: "inactive", Label: "Inactive", Type: reports.Bool},
			},
			Links: []reports.Link{
				{Key: "parent", Label: "Parent account", Target: "books.accounts", Cardinality: reports.ToOne, Field: "parent"},
				{Key: "sub_accounts", Label: "Sub-accounts", Target: "books.accounts", Cardinality: reports.ToMany, BackField: "parent"},
				{Key: "lines", Label: "Journal lines", Target: "books.journal_lines", Cardinality: reports.ToMany, BackField: "account"},
				{Key: "balances", Label: "Monthly balances", Target: "books.account_balances", Cardinality: reports.ToMany, BackField: "account"},
			},
		},
		{
			Key: "books.journal_entries", Collection: "books_journal_entries", Label: "Journal entries",
			Fields: []reports.Field{
				{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
				{Key: "status", Label: "Status", Type: reports.Select, Options: []reports.Option{
					{Value: "draft", Label: "Draft"},
					{Value: "posted", Label: "Posted"},
					{Value: "void", Label: "Void"},
				}},
				{Key: "origin", Label: "Origin", Type: reports.Select, Options: []reports.Option{
					{Value: "manual", Label: "Manual"},
					{Value: "reversal", Label: "Reversal"},
					{Value: "auto_reversal", Label: "Auto-reversal"},
					{Value: "void_reversal", Label: "Void reversal"},
					{Value: "opening_balance", Label: "Opening balance"},
				}},
				{Key: "doc_type", Label: "Document type", Type: reports.Select, Options: entryDocTypeOptions()},
				{Key: "number", Label: "Number", Type: reports.Text, Aggregates: reports.MinMax},
				// The posting order behind number, which sorts as text.
				{Key: "sequence", Label: "Sequence", Type: reports.Number},
				{Key: "memo", Label: "Memo", Type: reports.Text},
				{Key: "total", Label: "Total", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
				{Key: "currency", Label: "Currency", Type: reports.Text},
				{Key: "auto_reverse_on", Label: "Auto-reverse on", Type: reports.Date, TextDay: true},
				{Key: "posted_at", Label: "Posted at", Type: reports.DateTime, Aggregates: reports.MinMax},
				// The id of the document the entry posts (empty for other
				// entries), so a line opens its document's screen.
				{Key: "document", Label: "Document", Type: reports.Text},
			},
			Links: []reports.Link{
				{Key: "lines", Label: "Lines", Target: "books.journal_lines", Cardinality: reports.ToMany, BackField: "entry"},
				{Key: "reverses", Label: "Reverses", Target: "books.journal_entries", Cardinality: reports.ToOne, Field: "reverses"},
				{Key: "replaces", Label: "Replaces", Target: "books.journal_entries", Cardinality: reports.ToOne, Field: "replaces"},
			},
		},
		{
			Key: "books.journal_lines", Collection: "books_journal_lines", Label: "Journal lines",
			Fields: []reports.Field{
				{Key: "debit", Label: "Debit", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
				{Key: "credit", Label: "Credit", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
				{Key: "memo", Label: "Memo", Type: reports.Text},
				{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
				{Key: "posted", Label: "Posted", Type: reports.Bool},
				{Key: "currency", Label: "Currency", Type: reports.Text},
				// The line's order in its entry: the General Ledger's last sort key.
				{Key: "position", Label: "Position", Type: reports.Number},
			},
			Links: []reports.Link{
				{Key: "entry", Label: "Entry", Target: "books.journal_entries", Cardinality: reports.ToOne, Field: "entry"},
				{Key: "account", Label: "Account", Target: "books.accounts", Cardinality: reports.ToOne, Field: "account"},
				{Key: "customer", Label: "Customer", Target: "books.customers", Cardinality: reports.ToOne, Field: "customer"},
				{Key: "vendor", Label: "Vendor", Target: "books.vendors", Cardinality: reports.ToOne, Field: "vendor"},
			},
		},
		{
			Key: "books.account_balances", Collection: "books_account_balances", Label: "Monthly account balances",
			Fields: []reports.Field{
				{Key: "period", Label: "Month", Type: reports.Text, Aggregates: reports.MinMax},
				{Key: "debit_total", Label: "Debit total", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
				{Key: "credit_total", Label: "Credit total", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
				{Key: "currency", Label: "Currency", Type: reports.Text},
			},
			Links: []reports.Link{
				{Key: "account", Label: "Account", Target: "books.accounts", Cardinality: reports.ToOne, Field: "account"},
			},
		},
		{
			Key: "books.customers", Collection: "books_customers", Label: "Customers",
			Fields: []reports.Field{
				{Key: "display_name", Label: "Display name", Type: reports.Text, Aggregates: reports.MinMax},
				{Key: "company", Label: "Company", Type: reports.Text},
				{Key: "first_name", Label: "First name", Type: reports.Text},
				{Key: "last_name", Label: "Last name", Type: reports.Text},
				{Key: "email", Label: "Email", Type: reports.Text},
				{Key: "phone", Label: "Phone", Type: reports.Text},
				{Key: "mobile", Label: "Mobile", Type: reports.Text},
				{Key: "website", Label: "Website", Type: reports.Text},
				{Key: "notes", Label: "Notes", Type: reports.Text},
				{Key: "inactive", Label: "Inactive", Type: reports.Bool},
			},
			Links: []reports.Link{
				{Key: "parent", Label: "Parent customer", Target: "books.customers", Cardinality: reports.ToOne, Field: "parent"},
				{Key: "sub_customers", Label: "Sub-customers", Target: "books.customers", Cardinality: reports.ToMany, BackField: "parent"},
			},
		},
		{
			// The customers source's shape. Left out: address, terms,
			// account_number, expense_account, track_1099, legal_name,
			// tax_id_type, tax_id, form, fields, name_key and sort_key.
			Key: "books.vendors", Collection: "books_vendors", Label: "Vendors",
			Fields: []reports.Field{
				{Key: "display_name", Label: "Display name", Type: reports.Text, Aggregates: reports.MinMax},
				{Key: "company", Label: "Company", Type: reports.Text},
				{Key: "first_name", Label: "First name", Type: reports.Text},
				{Key: "last_name", Label: "Last name", Type: reports.Text},
				{Key: "email", Label: "Email", Type: reports.Text},
				{Key: "phone", Label: "Phone", Type: reports.Text},
				{Key: "mobile", Label: "Mobile", Type: reports.Text},
				{Key: "website", Label: "Website", Type: reports.Text},
				{Key: "notes", Label: "Notes", Type: reports.Text},
				{Key: "inactive", Label: "Inactive", Type: reports.Bool},
			},
		},
		{
			Key: "books.tax_agencies", Collection: "books_tax_agencies", Label: "Tax agencies",
			Fields: []reports.Field{
				{Key: "name", Label: "Name", Type: reports.Text, Aggregates: reports.MinMax},
				{Key: "inactive", Label: "Inactive", Type: reports.Bool},
			},
		},
		{
			Key: "books.tax_rates", Collection: "books_tax_rates", Label: "Tax rates",
			Fields: []reports.Field{
				{Key: "type", Label: "Type", Type: reports.Select, Options: []reports.Option{
					{Value: "rate", Label: "Rate"},
					{Value: "group", Label: "Group"},
				}},
				{Key: "name", Label: "Name", Type: reports.Text, Aggregates: reports.MinMax},
				{Key: "rate_ppm", Label: "Rate (ppm)", Type: reports.Number},
				{Key: "inactive", Label: "Inactive", Type: reports.Bool},
			},
			Links: []reports.Link{
				{Key: "agency", Label: "Agency", Target: "books.tax_agencies", Cardinality: reports.ToOne, Field: "agency"},
			},
		},
		basisLinesSource(),
		salesDocumentsSource(),
		salesTaxLinesSource(),
		auditLogSource(),
	}
	for i := range sources {
		sources[i].FiscalStartMonth = booksFiscalStart
		sources[i].Heading = booksHeading
		sources[i].Watch = []string{"books_settings"}
		if hasMoney(sources[i]) {
			sources[i].Currency = booksCurrency
		}
	}
	return sources
}

// auditLogSource is the books_audit_log view (migration 2100000025): one row
// per audit row of a Books record. The view's computed columns are text, so
// event, record_type and parent_type are Selects over text columns. The JSON
// columns (changes, snapshot) are left out; it has no money, so no Currency.
func auditLogSource() reports.Source {
	return reports.Source{
		Key: auditLogKey, Collection: "books_audit_log", Label: "Audit log",
		Fields: []reports.Field{
			{Key: "created", Label: "Date changed", Type: reports.DateTime, Aggregates: reports.MinMax},
			{Key: "actor", Label: "User ID", Type: reports.Text},
			{Key: "actor_name", Label: "User", Type: reports.Text, Aggregates: reports.MinMax},
			{Key: "event", Label: "Event", Type: reports.Select, Options: auditEvents()},
			{Key: "record_type", Label: "Record type", Type: reports.Select, Options: auditRecordTypeOptions()},
			{Key: "record_id", Label: "Record ID", Type: reports.Text},
			{Key: "record_label", Label: "Record", Type: reports.Text},
			{Key: "parent_type", Label: "Document type", Type: reports.Select, Options: auditRecordTypeOptions()},
			{Key: "parent_id", Label: "Document ID", Type: reports.Text},
			{Key: "history_type", Label: "History type", Type: reports.Text},
			{Key: "history_id", Label: "History ID", Type: reports.Text},
		},
	}
}

// basisLineColumns are the columns journal lines and cash-basis rows share,
// by the same name in both collections.
var basisLineColumns = []string{
	"debit", "credit", "memo", "date", "posted", "currency", "position", "entry", "account", "customer", "vendor",
}

// basisLinesSource is the journal lines by basis (pay-bills spec §3.10), one
// union of the posted ledger lines and the cash-basis rows (core SourcePart):
// the fields and links of books.journal_lines, and layer, each part's
// constant. A statement on it reads the ledger alone on Accrual and both
// parts on Cash (basisFilter), where the cash rows take out what a bill or an
// invoice posted and bring back each payment's share.
func basisLinesSource() reports.Source {
	return reports.Source{
		Key: "books.basis_lines", Label: "Journal lines by basis",
		Parts: []reports.SourcePart{
			{Collection: "books_journal_lines", Columns: sameNames(basisLineColumns...), Values: map[string]any{"layer": "ledger"}},
			{Collection: "books_cash_basis_lines", Columns: sameNames(basisLineColumns...), Values: map[string]any{"layer": "cash"}},
		},
		Fields: []reports.Field{
			{Key: "debit", Label: "Debit", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "credit", Label: "Credit", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "memo", Label: "Memo", Type: reports.Text},
			{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
			{Key: "posted", Label: "Posted", Type: reports.Bool},
			{Key: "currency", Label: "Currency", Type: reports.Text},
			{Key: "position", Label: "Position", Type: reports.Number},
			{Key: "layer", Label: "Layer", Type: reports.Select, Options: []reports.Option{
				{Value: "ledger", Label: "Ledger"},
				{Value: "cash", Label: "Cash basis"},
			}},
		},
		Links: []reports.Link{
			{Key: "entry", Label: "Entry", Target: "books.journal_entries", Cardinality: reports.ToOne, Field: "entry"},
			{Key: "account", Label: "Account", Target: "books.accounts", Cardinality: reports.ToOne, Field: "account"},
			{Key: "customer", Label: "Customer", Target: "books.customers", Cardinality: reports.ToOne, Field: "customer"},
			{Key: "vendor", Label: "Vendor", Target: "books.vendors", Cardinality: reports.ToOne, Field: "vendor"},
		},
	}
}

// salesDocumentColumns are the columns invoices, sales receipts and credit
// memos share, by the same name in each collection.
var salesDocumentColumns = []string{
	"date", "status", "number", "sequence", "subtotal", "tax_total", "total", "currency", "customer", "entry",
}

// sameNames maps each key to the column of the same name.
func sameNames(keys ...string) map[string]string {
	out := make(map[string]string, len(keys))
	for _, k := range keys {
		out[k] = k
	}
	return out
}

// salesDocumentsSource is every invoice, sales receipt and credit memo, one
// union of the three collections (core SourcePart); kind is each part's
// constant, so a report can tell them apart and label a row by its kind. A
// credit memo's figures are stored positive (credit memo spec Q19): a report
// that adds totals across kinds filters by kind.
func salesDocumentsSource() reports.Source {
	return reports.Source{
		Key: "books.sales_documents", Label: "Sales documents",
		Parts: []reports.SourcePart{
			{Collection: "books_invoices", Columns: sameNames(salesDocumentColumns...), Values: map[string]any{"kind": "invoice"}},
			{Collection: "books_sales_receipts", Columns: sameNames(salesDocumentColumns...), Values: map[string]any{"kind": "sales_receipt"}},
			{Collection: "books_credit_memos", Columns: sameNames(salesDocumentColumns...), Values: map[string]any{"kind": "credit_memo"}},
		},
		Fields: []reports.Field{
			{Key: "kind", Label: "Kind", Type: reports.Select, Options: []reports.Option{
				{Value: "invoice", Label: "Invoice"},
				{Value: "sales_receipt", Label: "Sales receipt"},
				{Value: "credit_memo", Label: "Credit memo"},
			}},
			{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
			{Key: "status", Label: "Status", Type: reports.Select, Options: []reports.Option{
				{Value: statusDraft, Label: "Draft"},
				{Value: statusPosted, Label: "Posted"},
				{Value: statusVoid, Label: "Void"},
			}},
			{Key: "number", Label: "Number", Type: reports.Text, Aggregates: reports.MinMax},
			// The posting order behind number, which sorts as text.
			{Key: "sequence", Label: "Sequence", Type: reports.Number},
			{Key: "subtotal", Label: "Subtotal", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "tax_total", Label: "Tax", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "total", Label: "Total", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "currency", Label: "Currency", Type: reports.Text},
		},
		Links: []reports.Link{
			{Key: "customer", Label: "Customer", Target: "books.customers", Cardinality: reports.ToOne, Field: "customer"},
			{Key: "entry", Label: "Entry", Target: "books.journal_entries", Cardinality: reports.ToOne, Field: "entry"},
		},
	}
}

// salesTaxLinesSource is every tax line posting wrote and the invoices' and
// credit memos' cash-basis tax rows (pay-bills spec §3.10, Q3), one union of
// four parts: the invoice, sales receipt and credit memo tax lines (layer
// "ledger") and books_cash_basis_tax_lines (layer "cash"). Each row is one
// document and tax component with its stored figures and its own day: a
// ledger line's is the document date, a cash row's the day it takes out or
// brings back. The document link reads each ledger part's own parent column,
// and the cash part's document column, which names an invoice or a credit
// memo. The payment entry link reads the cash part's payment_entry column:
// the entry that brings tax back, empty on a row that takes it out; the ledger
// parts do not map it, so it is empty there. A credit memo's ledger lines are
// below zero. A report on it reads the ledger alone on Accrual and both layers
// on Cash (basisFilter).
func salesTaxLinesSource() reports.Source {
	shared := []string{"gross_amount", "taxable_amount", "amount", "rate_ppm", "currency", "rate", "component", "agency", "date"}
	part := func(collection, parent, layer string) reports.SourcePart {
		columns := sameNames(shared...)
		columns["document"] = parent
		return reports.SourcePart{Collection: collection, Columns: columns, Values: map[string]any{"layer": layer}}
	}
	cash := part(cashTaxLinesCollection, "document", "cash")
	cash.Columns["payment_entry"] = "payment_entry"
	return reports.Source{
		Key: "books.sales_tax_lines", Label: "Sales tax lines",
		Parts: []reports.SourcePart{
			part("books_invoice_tax_lines", "invoice", "ledger"),
			part("books_sales_receipt_tax_lines", "sales_receipt", "ledger"),
			part("books_credit_memo_tax_lines", "credit_memo", "ledger"),
			cash,
		},
		Fields: []reports.Field{
			{Key: "gross_amount", Label: "Gross total", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "taxable_amount", Label: "Taxable amount", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "amount", Label: "Tax amount", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "rate_ppm", Label: "Rate (ppm)", Type: reports.Number},
			{Key: "currency", Label: "Currency", Type: reports.Text},
			{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
			{Key: "layer", Label: "Layer", Type: reports.Select, Options: []reports.Option{
				{Value: "ledger", Label: "Ledger"},
				{Value: "cash", Label: "Cash basis"},
			}},
		},
		Links: []reports.Link{
			{Key: "document", Label: "Document", Target: "books.sales_documents", Cardinality: reports.ToOne, Field: "document"},
			{Key: "rate", Label: "Tax rate", Target: "books.tax_rates", Cardinality: reports.ToOne, Field: "rate"},
			{Key: "component", Label: "Component rate", Target: "books.tax_rates", Cardinality: reports.ToOne, Field: "component"},
			{Key: "agency", Label: "Agency", Target: "books.tax_agencies", Cardinality: reports.ToOne, Field: "agency"},
			{Key: "payment_entry", Label: "Payment entry", Target: "books.journal_entries", Cardinality: reports.ToOne, Field: "payment_entry"},
		},
	}
}

func hasMoney(src reports.Source) bool {
	return slices.ContainsFunc(src.Fields, func(f reports.Field) bool { return f.Type == reports.Money })
}

// accountTypeSelectOptions lists the account types in account_types.json
// order, so a report sorted or grouped by type follows the chart.
func accountTypeSelectOptions() []reports.Option {
	out := make([]reports.Option, len(accountTypes))
	for i, t := range accountTypes {
		out[i] = reports.Option{Value: t.Key, Label: t.Label}
	}
	return out
}

// entryDocTypeOptions are the entry document types, in the migration's select
// order (report_sources_test.go compares the two), labelled as a reader sees
// them in the register (entry_type_labels.json; a journal entry has no doc type
// label of its own, so it reads the manual origin's).
func entryDocTypeOptions() []reports.Option {
	return []reports.Option{
		{Value: docTypeJournal, Label: entryTypeLabels.Origins["manual"]},
		{Value: docTypeTransfer, Label: entryTypeLabels.DocTypes[docTypeTransfer]},
		{Value: docTypeInvoice, Label: entryTypeLabels.DocTypes[docTypeInvoice]},
		{Value: docTypeSalesReceipt, Label: entryTypeLabels.DocTypes[docTypeSalesReceipt]},
		{Value: docTypeBill, Label: entryTypeLabels.DocTypes[docTypeBill]},
		{Value: docTypeExpense, Label: entryTypeLabels.DocTypes[docTypeExpense]},
		{Value: docTypePayment, Label: entryTypeLabels.DocTypes[docTypePayment]},
		{Value: docTypeBillPayment, Label: entryTypeLabels.DocTypes[docTypeBillPayment]},
		{Value: docTypeCreditMemo, Label: entryTypeLabels.DocTypes[docTypeCreditMemo]},
		{Value: docTypeVendorCredit, Label: entryTypeLabels.DocTypes[docTypeVendorCredit]},
		{Value: docTypeVendorRefund, Label: entryTypeLabels.DocTypes[docTypeVendorRefund]},
	}
}

// booksFiscalStart is the Books fiscal start month. Core calls it with the
// app, not under the reader's rules, so the settings row is read through its
// view rule: a reader who may not view books_settings must not learn the
// fiscal month. That reader, or a book with no settings row, gets a calendar
// year, and so does a fault, so the report still runs.
func booksFiscalStart(app core.App, reader *core.RequestInfo) int {
	r, err := reports.FindViewableRecord(app, reader, "books_settings", settingsID)
	if errors.Is(err, sql.ErrNoRows) {
		return 1
	}
	if err != nil {
		log.Warn("report fiscal start month falls back to January", "error", err)
		return 1
	}
	month := r.GetInt("fiscal_year_start_month")
	if month < 1 || month > 12 {
		return 1
	}
	return month
}

// booksHeading is the Books business name. Core calls it with the app, not
// under the reader's rules, so the settings row is read through its view
// rule: a reader who may not view books_settings must not learn the business
// name. "" lets core print the organization's name.
func booksHeading(app core.App, reader *core.RequestInfo) string {
	r, err := reports.FindViewableRecord(app, reader, "books_settings", settingsID)
	if errors.Is(err, sql.ErrNoRows) {
		return ""
	}
	if err != nil {
		log.Warn("report heading falls back to the organization name", "error", err)
		return ""
	}
	return strings.TrimSpace(r.GetString("business_name"))
}

// booksCurrency is the Books currency, the one posting stamps on every money
// row. Core calls it with the app, not under the reader's rules, so the
// settings row is read through its view rule: a reader who may not view
// books_settings, a book with no settings row, or a fault gets "", and an
// empty report's figures then show no currency sign. Core may call it on any
// run, but the rows a run reads keep their own currency.
func booksCurrency(app core.App, reader *core.RequestInfo) string {
	r, err := reports.FindViewableRecord(app, reader, "books_settings", settingsID)
	if errors.Is(err, sql.ErrNoRows) {
		return ""
	}
	if err != nil {
		log.Warn("report currency falls back to none", "error", err)
		return ""
	}
	return r.GetString("currency")
}
