package books

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/reports"
)

// reportSources are the Books collections core's report engine reads (spec
// §5). Books stores days as YYYY-MM-DD text, so its days are TextDay dates.
// No source sets Currency: each money field names its row's currency column,
// which posting stamps from the Books currency setting. Json columns, sort and
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
	}
	for i := range sources {
		sources[i].FiscalStartMonth = booksFiscalStart
		sources[i].Heading = booksHeading
		sources[i].Watch = []string{"books_settings"}
	}
	return sources
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
// them in the register.
func entryDocTypeOptions() []reports.Option {
	return []reports.Option{
		{Value: docTypeJournal, Label: entryTypeLabels.Origins["manual"]},
		{Value: docTypeTransfer, Label: entryTypeLabels.Transfer},
		{Value: docTypeInvoice, Label: invoiceDocTypeLabel},
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
