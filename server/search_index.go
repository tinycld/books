package books

import (
	"github.com/pocketbase/pocketbase"

	"tinycld.org/core/fts"
)

// The FTS5 tables Books search reads, created by
// pb-migrations/2100000006_create_books_search_index.js, the invoices' by
// 2100000010_create_books_invoices.js, and the sales receipts' by
// 2100000011_create_books_sales_receipts.js.
const (
	accountsIndex      = "fts_books_accounts"
	entriesIndex       = "fts_books_journal_entries"
	customersIndex     = "fts_books_customers"
	vendorsIndex       = "fts_books_vendors"
	productsIndex      = "fts_books_products"
	invoicesIndex      = "fts_books_invoices"
	salesReceiptsIndex = "fts_books_sales_receipts"
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
