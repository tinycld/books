package books

import (
	"github.com/pocketbase/pocketbase"

	"tinycld.org/core/fts"
)

// The FTS5 tables Books search reads, created by
// pb-migrations/2100000006_create_books_search_index.js, the invoices' by
// 2100000010_create_books_invoices.js, the sales receipts' by
// 2100000011_create_books_sales_receipts.js, the estimates' by
// 2100000012_create_books_estimates.js, the bills' by
// 2100000013_create_books_bills.js, the expenses' by
// 2100000017_create_books_expenses.js, the payments' by
// 2100000019_create_books_payments.js, the bill payments' by
// 2100000021_create_books_bill_payments.js, the credit memos' by
// 2100000022_create_books_credit_memos.js, the vendor credits' by
// 2100000023_create_books_vendor_credits.js, the vendor refunds' by
// 2100000024_create_books_vendor_refunds.js, the refund receipts' by
// 2100000025_create_books_refund_receipts.js, and the write-offs' by
// 2100000027_create_books_write_offs.js.
const (
	accountsIndex       = "fts_books_accounts"
	entriesIndex        = "fts_books_journal_entries"
	customersIndex      = "fts_books_customers"
	vendorsIndex        = "fts_books_vendors"
	productsIndex       = "fts_books_products"
	invoicesIndex       = "fts_books_invoices"
	salesReceiptsIndex  = "fts_books_sales_receipts"
	estimatesIndex      = "fts_books_estimates"
	billsIndex          = "fts_books_bills"
	expensesIndex       = "fts_books_expenses"
	paymentsIndex       = "fts_books_payments"
	billPaymentsIndex   = "fts_books_bill_payments"
	creditMemosIndex    = "fts_books_credit_memos"
	vendorCreditsIndex  = "fts_books_vendor_credits"
	vendorRefundsIndex  = "fts_books_vendor_refunds"
	refundReceiptsIndex = "fts_books_refund_receipts"
	writeOffsIndex      = "fts_books_write_offs"
)

// searchIndexes keep each FTS row in step with its record. The columns repeat
// the migration's. Scope is left out: Books never calls fts.Search, whose
// scopes are per record; searchBooks checks the person's Books level first, as
// every Books read does.
var searchIndexes = []fts.Config{
	{Slug: "books", Collection: "books_accounts", Table: accountsIndex, Columns: ftsColumns("name", "number", "description")},
	{Slug: "books", Collection: "books_journal_entries", Table: entriesIndex, Columns: ftsColumns("number", "memo")},
	{Slug: "books", Collection: "books_customers", Table: customersIndex, Columns: ftsColumns("display_name", "company", "email")},
	{Slug: "books", Collection: "books_vendors", Table: vendorsIndex, Columns: ftsColumns("display_name", "company", "email", "legal_name")},
	{Slug: "books", Collection: "books_products", Table: productsIndex, Columns: ftsColumns("name", "sku", "sales_description")},
	{Slug: "books", Collection: "books_invoices", Table: invoicesIndex, Columns: ftsColumns("number", "memo", "message")},
	{Slug: "books", Collection: "books_sales_receipts", Table: salesReceiptsIndex, Columns: ftsColumns("number", "reference_no", "memo", "message")},
	{Slug: "books", Collection: "books_estimates", Table: estimatesIndex, Columns: ftsColumns("number", "memo", "message")},
	{Slug: "books", Collection: "books_bills", Table: billsIndex, Columns: ftsColumns("number", "ref_no", "memo")},
	{Slug: "books", Collection: expensesCollection, Table: expensesIndex, Columns: ftsColumns("number", "reference_no", "memo")},
	{Slug: "books", Collection: paymentsCollection, Table: paymentsIndex, Columns: ftsColumns("number", "reference_no", "memo")},
	{Slug: "books", Collection: billPaymentsCollection, Table: billPaymentsIndex, Columns: ftsColumns("number", "reference_no")},
	{Slug: "books", Collection: "books_credit_memos", Table: creditMemosIndex, Columns: ftsColumns("number", "memo", "message")},
	{Slug: "books", Collection: vendorCreditsCollection, Table: vendorCreditsIndex, Columns: ftsColumns("number", "ref_no", "memo")},
	{Slug: "books", Collection: vendorRefundsCollection, Table: vendorRefundsIndex, Columns: ftsColumns("number", "reference_no", "memo")},
	{Slug: "books", Collection: "books_refund_receipts", Table: refundReceiptsIndex, Columns: ftsColumns("number", "reference_no", "memo", "message")},
	{Slug: "books", Collection: writeOffsCollection, Table: writeOffsIndex, Columns: ftsColumns("number", "memo")},
}

// ftsColumns indexes each field under its own name.
func ftsColumns(fields ...string) []fts.Column {
	cols := make([]fts.Column, len(fields))
	for i, f := range fields {
		cols[i] = fts.Column{FTS: f, Field: f}
	}
	return cols
}

// registerSearchIndex binds the index-sync hooks only. fts.Register would also
// mount GET /api/books/search, and Books has no in-app search box to serve:
// core's federated /api/search is the one reader.
func registerSearchIndex(app *pocketbase.PocketBase) {
	for _, cfg := range searchIndexes {
		fts.RegisterSync(app, cfg)
	}
}
