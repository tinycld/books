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
				// The A/R Aging's family level reads it (arGroups): which
				// sub-customers have a receivable row, settled or not.
				{Key: "receivable_items", Label: "Receivable items", Target: "books.receivable_items", Cardinality: reports.ToMany, BackField: "customer"},
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
		receivableItemsSource(),
		salesDocumentsSource(),
		salesTaxLinesSource(),
		salesLinesSource(),
		productsSource(),
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

// auditLogSource is the books_audit_log view (migration 2100000032): one row
// per audit row of a Books record. The view's computed columns are text, so
// event, event_shown, record_type and parent_type are Selects over text
// columns. event is what the Event filter matches; event_shown is what the
// Event column shows (a credit memo application reads Credit applied or
// Credit removed, not Added or Deleted). The JSON
// columns (changes, snapshot) are left out; it has no money, so no Currency.
func auditLogSource() reports.Source {
	return reports.Source{
		Key: auditLogKey, Collection: "books_audit_log", Label: "Audit log",
		Fields: []reports.Field{
			{Key: "created", Label: "Date changed", Type: reports.DateTime, Aggregates: reports.MinMax},
			{Key: "actor", Label: "User ID", Type: reports.Text},
			{Key: "actor_name", Label: "User", Type: reports.Text, Aggregates: reports.MinMax},
			{Key: "event", Label: "Event", Type: reports.Select, Options: auditEvents()},
			{Key: "event_shown", Label: "Event shown", Type: reports.Select, Options: auditShownEvents()},
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

// receivableItemsSource is every part of every receivable item (A/R Aging
// spec §4), the stored rows of books_receivable_items: the posted A/R lines,
// with a payment's own line at its unapplied part, and the applications of
// posted payments. item is the item a row belongs to; a report groups by it
// to add up an item's open amount. settled is the day the item's balance
// stays zero from (9999-12-31 while it is open): a report of one day reads
// the rows with settled after that day and never the paid history.
func receivableItemsSource() reports.Source {
	return reports.Source{
		Key: "books.receivable_items", Collection: receivableItemsCollection, Label: "Receivable items",
		Fields: []reports.Field{
			{Key: "date", Label: "Date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
			{Key: "due_date", Label: "Due date", Type: reports.Date, TextDay: true, Aggregates: reports.MinMax},
			// Text, not Date: the engine compares a text field as the bare
			// column, so idx_books_receivable_items_settled serves the filter.
			// A Date field is wrapped in substr and NULLIF, which no index serves.
			{Key: "settled", Label: "Settled", Type: reports.Text},
			{Key: "debit", Label: "Debit", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "credit", Label: "Credit", Type: reports.Money, Aggregates: reports.SumAll, Currency: "currency"},
			{Key: "currency", Label: "Currency", Type: reports.Text},
			{Key: "item", Label: "Item", Type: reports.Text},
			{Key: "item_kind", Label: "Item type", Type: reports.Select, Options: []reports.Option{
				{Value: "invoice", Label: "Invoice"},
				{Value: "payment", Label: "Payment"},
				{Value: "credit_memo", Label: "Credit memo"},
				{Value: "entry", Label: "Journal entry"},
			}},
			{Key: "item_number", Label: "Number", Type: reports.Text, Aggregates: reports.MinMax},
			// The integer item_number formats (server/numbering.go): items sort
			// by it, since "JE-10" sorts before "JE-9" as text.
			{Key: "item_seq", Label: "Sequence", Type: reports.Number, Aggregates: reports.MinMax},
		},
		Links: []reports.Link{
			{Key: "customer", Label: "Customer", Target: "books.customers", Cardinality: reports.ToOne, Field: "customer"},
			{Key: "entry", Label: "Entry", Target: "books.journal_entries", Cardinality: reports.ToOne, Field: "entry"},
		},
	}
}

// salesDocumentColumns are the columns invoices, sales receipts, credit memos
// and refund receipts share, by the same name in each collection. A refund
// receipt's refund_from is no shared column.
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

// salesDocumentsSource is every invoice, sales receipt, credit memo and
// refund receipt, one union of the four collections (core SourcePart); kind
// is each part's constant, so a report can tell them apart and label a row by
// its kind. A credit memo's and a refund receipt's figures are stored
// positive (credit memo spec Q19, refund receipt spec Q10): a report that
// adds totals across kinds filters by kind.
func salesDocumentsSource() reports.Source {
	return reports.Source{
		Key: "books.sales_documents", Label: "Sales documents",
		Parts: []reports.SourcePart{
			{Collection: "books_invoices", Columns: sameNames(salesDocumentColumns...), Values: map[string]any{"kind": "invoice"}},
			{Collection: "books_sales_receipts", Columns: sameNames(salesDocumentColumns...), Values: map[string]any{"kind": "sales_receipt"}},
			{Collection: "books_credit_memos", Columns: sameNames(salesDocumentColumns...), Values: map[string]any{"kind": "credit_memo"}},
			{Collection: "books_refund_receipts", Columns: sameNames(salesDocumentColumns...), Values: map[string]any{"kind": "refund_receipt"}},
		},
		Fields: []reports.Field{
			{Key: "kind", Label: "Kind", Type: reports.Select, Options: []reports.Option{
				{Value: "invoice", Label: "Invoice"},
				{Value: "sales_receipt", Label: "Sales receipt"},
				{Value: "credit_memo", Label: "Credit memo"},
				{Value: "refund_receipt", Label: "Refund receipt"},
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
			// The back link of books.sales_lines' document, for the builder.
			{Key: "lines", Label: "Lines", Target: "books.sales_lines", Cardinality: reports.ToMany, BackField: "document"},
		},
	}
}

// salesLineColumns are the columns invoice, sales receipt, credit memo and
// refund receipt lines share, by the same name in each collection.
var salesLineColumns = []string{
	"kind", "description", "quantity", "rate", "amount", "taxable", "position", "product",
}

// salesLinesSource is every invoice, sales receipt and credit memo line and
// every plain refund receipt's line, one union of four parts (core
// SourcePart; sales-reports spec §5). The refund part is the view
// books_refund_receipt_sale_lines, which leaves out a payout's lines: the
// credit memo it pays out counted them already (refund receipt spec Q10). The
// document link reads each part's own parent column, and sign is each part's
// constant: 1 on an invoice and a sales receipt, -1 on a credit memo and a
// refund receipt, whose line amounts and quantities are stored positive. The
// lines have no currency column, so the money fields name none and read the
// source's Currency (the Books currency, which posting stamps on every
// document).
func salesLinesSource() reports.Source {
	part := func(collection, parent string, sign int) reports.SourcePart {
		columns := sameNames(salesLineColumns...)
		columns["document"] = parent
		return reports.SourcePart{Collection: collection, Columns: columns, Values: map[string]any{"sign": sign}}
	}
	return reports.Source{
		Key: "books.sales_lines", Label: "Sales lines",
		Parts: []reports.SourcePart{
			part("books_invoice_lines", "invoice", 1),
			part("books_sales_receipt_lines", "sales_receipt", 1),
			part("books_credit_memo_lines", "credit_memo", -1),
			part("books_refund_receipt_sale_lines", "refund_receipt", -1),
		},
		Fields: []reports.Field{
			{Key: "kind", Label: "Kind", Type: reports.Select, Options: []reports.Option{
				{Value: "item", Label: "Item"},
				{Value: "description", Label: "Description"},
				{Value: "subtotal", Label: "Subtotal"},
				{Value: "percent", Label: "Percent"},
			}},
			{Key: "description", Label: "Description", Type: reports.Text},
			{Key: "quantity", Label: "Quantity", Type: reports.Number, Aggregates: reports.SumAll},
			{Key: "rate", Label: "Rate", Type: reports.Money},
			{Key: "amount", Label: "Amount", Type: reports.Money, Aggregates: reports.SumAll},
			{Key: "taxable", Label: "Taxable", Type: reports.Bool},
			// The line's order in its document: the last sort key of a
			// document's lines.
			{Key: "position", Label: "Position", Type: reports.Number},
			{Key: "sign", Label: "Sign", Type: reports.Number},
		},
		Links: []reports.Link{
			{Key: "document", Label: "Document", Target: "books.sales_documents", Cardinality: reports.ToOne, Field: "document"},
			{Key: "product", Label: "Product/Service", Target: "books.products", Cardinality: reports.ToOne, Field: "product"},
		},
	}
}

// productsSource is the products and services. Left out: the purchase fields
// (purchases, purchase_description, cost, expense_account), the form columns
// (form, fields) and the name and sort keys.
func productsSource() reports.Source {
	return reports.Source{
		Key: "books.products", Collection: "books_products", Label: "Products and services",
		Fields: []reports.Field{
			{Key: "name", Label: "Name", Type: reports.Text, Aggregates: reports.MinMax},
			{Key: "sku", Label: "SKU", Type: reports.Text},
			{Key: "type", Label: "Type", Type: reports.Select, Options: []reports.Option{
				{Value: "service", Label: "Service"},
				{Value: "non_inventory", Label: "Non-inventory"},
				{Value: "bundle", Label: "Bundle"},
			}},
			{Key: "sales_description", Label: "Sales description", Type: reports.Text},
			{Key: "price", Label: "Price", Type: reports.Money, Currency: "currency"},
			{Key: "currency", Label: "Currency", Type: reports.Text},
			{Key: "inactive", Label: "Inactive", Type: reports.Bool},
		},
		Links: []reports.Link{
			{Key: "income_account", Label: "Income account", Target: "books.accounts", Cardinality: reports.ToOne, Field: "income_account"},
			// The back link of books.sales_lines' product, for the builder.
			{Key: "sales_lines", Label: "Sales lines", Target: "books.sales_lines", Cardinality: reports.ToMany, BackField: "product"},
		},
	}
}

// salesTaxLinesSource is every tax line posting wrote and the invoices' and
// credit memos' cash-basis tax rows (pay-bills spec §3.10, Q3), one union of
// five parts: the invoice, sales receipt, credit memo and refund receipt tax
// lines (layer "ledger") and books_cash_basis_tax_lines (layer "cash"). A
// payout refund writes no tax lines, so only a plain refund's rows are here.
// Each row is one
// document and tax component with its stored figures and its own day: a
// ledger line's is the document date, a cash row's the day it takes out or
// brings back. The document link reads each ledger part's own parent column,
// and the cash part's document column, which names an invoice or a credit
// memo. The payment entry link reads the cash part's payment_entry column:
// the entry that brings tax back, empty on a row that takes it out; the ledger
// parts do not map it, so it is empty there. A credit memo's and a refund
// receipt's ledger lines are below zero. A report on it reads the ledger alone on Accrual and both layers
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
			part("books_refund_receipt_tax_lines", "refund_receipt", "ledger"),
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
		{Value: docTypeRefundReceipt, Label: entryTypeLabels.DocTypes[docTypeRefundReceipt]},
		{Value: docTypeWriteOff, Label: entryTypeLabels.DocTypes[docTypeWriteOff]},
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
