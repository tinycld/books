package books

import (
	"context"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/fts"
	"tinycld.org/core/search"
)

// searchSource contributes accounts, journal entries, customers, vendors,
// products, invoices, sales receipts, estimates and bills to core's federated
// /api/search. Each kind is read from its FTS5
// index (server/search_index.go). Rows are shaped here so the palette and the
// CLI show the same thing; the client adapter
// (tinycld/books/search-adapter.ts) only navigates.
func searchSource() search.Source {
	return search.Source{
		Slug:  "books",
		Label: "Books",
		// Mirrors manifest.ts nav.order, the cross-package ranking tie-break.
		Order:  30,
		Scopes: []string{scopeRead},
		Search: searchBooks,
	}
}

const defaultSearchLimit = 20

func searchBooks(app core.App, userID string, q search.Query) (search.Result, error) {
	// A direct query: the collection rules do not run here, so the level
	// they read is checked first.
	level, err := levelForUser(app, userID)
	if err != nil {
		return search.Result{}, err
	}
	// fts owns the FTS5 quoting. It returns "" when the include text leaves
	// FTS5 nothing to quote (only operator characters such as " * - ( ^), and
	// FTS5 refuses an empty MATCH, so that finds nothing. A term of other
	// symbols (such as %) is quoted as a prefix term that matches no indexed
	// word: it also finds nothing and raises no error.
	match := fts.SanitizeQueryWithExclusions(strings.Join(q.Include, " "), strings.Join(q.Exclude, " "))
	if !level.CanRead() || match == "" {
		return search.Result{}, nil
	}
	limit := q.Limit
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	offset := max(q.Offset, 0)
	window := offset + limit
	ctx := q.Context()

	accounts, accountTotal, err := searchAccounts(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	entries, entryTotal, err := searchEntries(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	customers, customerTotal, err := searchParties(ctx, app, match, window, customerSource)
	if err != nil {
		return search.Result{}, err
	}
	vendors, vendorTotal, err := searchParties(ctx, app, match, window, vendorSource)
	if err != nil {
		return search.Result{}, err
	}
	products, productTotal, err := searchProducts(ctx, app, match, window)
	if err != nil {
		return search.Result{}, err
	}
	invoices, invoiceTotal, err := searchSalesDocs(ctx, app, invoiceSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	receipts, receiptTotal, err := searchSalesDocs(ctx, app, salesReceiptSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	estimates, estimateTotal, err := searchSalesDocs(ctx, app, estimateSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	bills, billTotal, err := searchSalesDocs(ctx, app, billSearch, q.Include, q.Exclude, window)
	if err != nil {
		return search.Result{}, err
	}
	rows := interleave(accounts, entries, customers, vendors, products, invoices, receipts, estimates, bills)
	total := accountTotal + entryTotal + customerTotal + vendorTotal + productTotal + invoiceTotal + receiptTotal +
		estimateTotal + billTotal
	return search.Result{Rows: page(rows, offset, limit), Total: total}, nil
}

// interleave takes one row from each list in turn, then what is left of the
// longer lists, so a query that matches many of one kind (a number matches
// account numbers and entry numbers) still shows the others on its first
// page. Each list holds its first window hits in order, so the first window
// rows here are the same whichever page asks.
func interleave(lists ...[]search.Row) []search.Row {
	size, longest := 0, 0
	for _, l := range lists {
		size += len(l)
		longest = max(longest, len(l))
	}
	rows := make([]search.Row, 0, size)
	for i := range longest {
		for _, l := range lists {
			if i < len(l) {
				rows = append(rows, l[i])
			}
		}
	}
	return rows
}

// indexQuery reads one search source from its FTS5 index: the index rows that
// match, joined to their records (aliased c), narrowed by where, in order.
// Every identifier is a constant of this file; only the match and the window
// are bound. A record deleted behind a stale index row drops out at the join.
type indexQuery struct {
	index, table, joins, where, columns, order string
}

// run counts every hit and loads the first window of them into hits. Each
// kind keeps a fixed order rather than FTS rank: core ranks the merged rows by
// how well their visible text matches, and a fixed order keeps the pages of
// one query stable. Customers, vendors and products order by sort_key, as
// their lists do (case and accents folded, each sub-customer under its
// parent); accounts by name, entries by date.
func (iq indexQuery) run(ctx context.Context, app core.App, match string, window int, hits any) (int, error) {
	from := " FROM " + iq.index + " JOIN " + iq.table + " c ON c.id = " + iq.index + ".record_id" + iq.joins +
		" WHERE " + iq.index + " MATCH {:match}"
	if iq.where != "" {
		from += " AND " + iq.where
	}
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*)" + from).WithContext(ctx).
		Bind(dbx.Params{"match": match}).Row(&total); err != nil {
		return 0, fmt.Errorf("books: count %s hits: %w", iq.table, err)
	}
	if err := app.DB().NewQuery("SELECT " + iq.columns + from + " ORDER BY " + iq.order + " LIMIT {:window}").
		WithContext(ctx).Bind(dbx.Params{"match": match, "window": window}).All(hits); err != nil {
		return 0, fmt.Errorf("books: search %s: %w", iq.table, err)
	}
	return total, nil
}

type accountHit struct {
	ID       string `db:"id"`
	Name     string `db:"name"`
	Number   string `db:"number"`
	Type     string `db:"type"`
	Inactive bool   `db:"inactive"`
}

var accountsQuery = indexQuery{
	index: accountsIndex, table: "books_accounts",
	columns: "c.id, c.name, c.number, c.type, c.inactive", order: "c.name, c.id",
}

func searchAccounts(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []accountHit
	total, err := accountsQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := typeLabel(h.Type)
		if h.Number != "" {
			subtitle = h.Number + " · " + subtitle
		}
		rows = append(rows, search.Row{
			ID:       "account:" + h.ID,
			Title:    h.Name,
			Subtitle: subtitle,
			Meta:     "Account",
			Fields:   map[string]any{"kind": "account", "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

type entryHit struct {
	ID      string `db:"id"`
	Number  string `db:"number"`
	Memo    string `db:"memo"`
	Date    string `db:"date"`
	Status  string `db:"status"`
	DocType string `db:"doc_type"`
}

// A void's reversal repeats the voided entry's number, and the voided entry
// is the one a person looks for, so reversals are left out. A document's entry
// is left out too: its document's own row (an invoice hit) stands for it.
var entriesQuery = indexQuery{
	index: entriesIndex, table: "books_journal_entries", where: "c.origin NOT IN ('void_reversal', 'document')",
	columns: "c.id, c.number, c.memo, c.date, c.status, c.doc_type", order: "c.date DESC, c.id",
}

func searchEntries(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []entryHit
	total, err := entriesQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		// A transfer hit opens the transfer screen, so the client adapter needs
		// its own id prefix and kind.
		prefix, kind := "entry:", "journal_entry"
		if h.DocType == docTypeTransfer {
			prefix, kind = "transfer:", "transfer"
		}
		rows = append(rows, search.Row{
			ID:       prefix + h.ID,
			Title:    entryHitTitle(h),
			Subtitle: h.Memo,
			Meta:     h.Date,
			Fields:   map[string]any{"kind": kind, "status": h.Status},
		})
	}
	return rows, total, nil
}

type partyHit struct {
	ID          string `db:"id"`
	DisplayName string `db:"display_name"`
	Company     string `db:"company"`
	Email       string `db:"email"`
	Inactive    bool   `db:"inactive"`
	ParentName  string `db:"parent_name"`
}

// partySource names a kind of party (a person or company the books deal
// with): the row id prefix and kind, the Meta label, and its index query.
type partySource struct {
	kind, meta string
	query      indexQuery
}

// The parent join only labels a customer hit ("Parent : Child"): the match
// stays on the child's own index row, and the LEFT JOIN on the unique parent
// id adds or drops no rows, so the count and the rows agree.
var customerSource = partySource{
	kind: "customer", meta: "Customer",
	query: indexQuery{
		index: customersIndex, table: "books_customers",
		joins:   " LEFT JOIN books_customers p ON p.id = c.parent",
		columns: "c.id, c.display_name, c.company, c.email, c.inactive, COALESCE(p.display_name, '') AS parent_name",
		order:   "c.sort_key, c.id",
	},
}

// A vendor's index also holds its legal name, never its tax ID; the hit shows
// neither.
var vendorSource = partySource{
	kind: "vendor", meta: "Vendor",
	query: indexQuery{
		index: vendorsIndex, table: "books_vendors",
		columns: "c.id, c.display_name, c.company, c.email, c.inactive, '' AS parent_name",
		order:   "c.sort_key, c.id",
	},
}

// partyHitTitle uses the client's "Parent : Child" label form, so two rows of
// the same name under different parents are told apart.
func partyHitTitle(h partyHit) string {
	if h.ParentName == "" {
		return h.DisplayName
	}
	return h.ParentName + " : " + h.DisplayName
}

func searchParties(ctx context.Context, app core.App, match string, window int, src partySource) ([]search.Row, int, error) {
	var hits []partyHit
	total, err := src.query.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := h.Company
		if subtitle == "" {
			subtitle = h.Email
		}
		rows = append(rows, search.Row{
			ID:       src.kind + ":" + h.ID,
			Title:    partyHitTitle(h),
			Subtitle: subtitle,
			Meta:     src.meta,
			Fields:   map[string]any{"kind": src.kind, "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

type productHit struct {
	ID       string `db:"id"`
	Name     string `db:"name"`
	Sku      string `db:"sku"`
	Type     string `db:"type"`
	Inactive bool   `db:"inactive"`
}

// The index holds the sales description but not the purchase one: the sales
// text is what a customer reads and what a person recalls an item by.
var productsQuery = indexQuery{
	index: productsIndex, table: "books_products",
	columns: "c.id, c.name, c.sku, c.type, c.inactive", order: "c.sort_key, c.id",
}

func searchProducts(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []productHit
	total, err := productsQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := h.Sku
		if subtitle == "" {
			subtitle = productTypeLabel(h.Type)
		}
		rows = append(rows, search.Row{
			ID:       "product:" + h.ID,
			Title:    h.Name,
			Subtitle: subtitle,
			Meta:     "Product or service",
			Fields:   map[string]any{"kind": "product", "inactive": h.Inactive},
		})
	}
	return rows, total, nil
}

type salesDocHit struct {
	ID        string `db:"id"`
	Number    string `db:"number"`
	Memo      string `db:"memo"`
	Date      string `db:"date"`
	Status    string `db:"status"`
	PartyName string `db:"party_name"`
}

// salesDocSearch is one kind of document of the sales document layer (the
// purchase documents use it too) as a search source: its table, its FTS5
// index, its doc type (for the title's nouns), its row id prefix and kind
// (what the client adapter opens), and its party: the header column that
// names it, the party's table and the party's FTS5 index.
type salesDocSearch struct {
	table, index, docType, kind      string
	partyField, partyTable, partyIdx string
}

var invoiceSearch = salesDocSearch{
	table: "books_invoices", index: invoicesIndex, docType: docTypeInvoice, kind: "invoice",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

var salesReceiptSearch = salesDocSearch{
	table: "books_sales_receipts", index: salesReceiptsIndex, docType: docTypeSalesReceipt, kind: "sales_receipt",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

// estimateSearch lists every estimate: an estimate has its number from its
// first save, so its title is always "Estimate 1001 · Customer".
var estimateSearch = salesDocSearch{
	table: "books_estimates", index: estimatesIndex, docType: docTypeEstimate, kind: "estimate",
	partyField: "customer", partyTable: "books_customers", partyIdx: customersIndex,
}

// billSearch names its vendor: "Bill 1003 · Pacific Power" / "Draft bill ·
// Pacific Power". A word matches the bill's number, vendor's bill no. and
// memo, or the vendor's display name, company, email and legal name.
var billSearch = salesDocSearch{
	table: billKind.Collection, index: billsIndex, docType: docTypeBill, kind: "bill",
	partyField: "vendor", partyTable: "books_vendors", partyIdx: vendorsIndex,
}

// salesDocTermMatch is true when one query word matches a document's own
// index row (number, memo, message; a sales receipt's reference no. and a
// bill's vendor's bill no. too) or its party's (a customer's display name,
// company, email; a vendor's legal name too). Reading the party's row at
// query time lets a renamed party find its documents with no reindex. %[1]s
// is the bound word, %[2]s the document's index, %[3]s the party column and
// %[4]s the party's index.
const salesDocTermMatch = `(c.id IN (SELECT record_id FROM %[2]s WHERE %[2]s MATCH {:%[1]s})
	OR c.%[3]s IN (SELECT record_id FROM %[4]s WHERE %[4]s MATCH {:%[1]s}))`

// from builds the FROM and WHERE of a sales document search. The words are
// matched one by one and ANDed, so "Harborview 1003" finds invoice 1003 of
// Harborview although its number and the customer's name are in two index
// rows; each word is a prefix term, as in every other source. An excluded
// word drops a document when it matches either row. Drafts are included:
// search is how a person reopens a draft (spec Q13). A void document stays
// findable, as a void entry does. The party is a LEFT JOIN: a sales receipt
// may have no customer (an invoice always has one and a bill a vendor, so
// their rows are the same as an inner join's). Only the bound words vary;
// every identifier is a constant of this file.
func (s salesDocSearch) from(include, exclude []string) (string, dbx.Params) {
	params := dbx.Params{}
	var conds []string
	add := func(prefix string, words []string, negate bool) {
		for _, word := range words {
			term := fts.SanitizeQuery(word)
			if term == "" {
				continue
			}
			name := fmt.Sprintf("%s%d", prefix, len(params))
			params[name] = term
			cond := fmt.Sprintf(salesDocTermMatch, name, s.index, s.partyField, s.partyIdx)
			if negate {
				cond = "NOT " + cond
			}
			conds = append(conds, cond)
		}
	}
	add("t", queryWords(include), false)
	add("x", queryWords(exclude), true)
	from := ` FROM ` + s.table + ` c LEFT JOIN ` + s.partyTable + ` pa ON pa.id = c.` + s.partyField +
		` WHERE ` + strings.Join(conds, " AND ")
	return from, params
}

// queryWords splits the query's parts into words, as the FTS match of the
// other sources does.
func queryWords(parts []string) []string {
	return strings.Fields(strings.Join(parts, " "))
}

// searchSalesDocs counts every hit of one sales document kind and returns the
// first window of them, newest first, as entries are ordered. The title is
// "Invoice 1003 · Customer" / "Draft sales receipt · Customer" / "Bill 1003 ·
// Vendor", with no "· <party>" when the document has none. The caller has
// checked that the include words leave FTS5 a term, so the WHERE is never
// empty.
func searchSalesDocs(ctx context.Context, app core.App, s salesDocSearch, include, exclude []string, window int) ([]search.Row, int, error) {
	from, params := s.from(include, exclude)
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*)" + from).WithContext(ctx).
		Bind(params).Row(&total); err != nil {
		return nil, 0, fmt.Errorf("books: count %s hits: %w", s.table, err)
	}
	params["window"] = window
	var hits []salesDocHit
	if err := app.DB().NewQuery("SELECT c.id, c.number, c.memo, c.date, c.status, COALESCE(pa.display_name, '') AS party_name" +
		from + " ORDER BY c.date DESC, c.id LIMIT {:window}").
		WithContext(ctx).Bind(params).All(&hits); err != nil {
		return nil, 0, fmt.Errorf("books: search %s: %w", s.table, err)
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		title := entryHitTitle(entryHit{Number: h.Number, Status: h.Status, DocType: s.docType})
		if h.PartyName != "" {
			title += " · " + h.PartyName
		}
		rows = append(rows, search.Row{
			ID:       s.kind + ":" + h.ID,
			Title:    title,
			Subtitle: h.Memo,
			Meta:     h.Date,
			Fields:   map[string]any{"kind": s.kind, "status": h.Status},
		})
	}
	return rows, total, nil
}

func entryHitTitle(h entryHit) string {
	noun, _, draft := entryNouns(h.DocType)
	switch {
	case h.Number == "":
		return draft
	case h.Status == statusVoid:
		return noun + " " + h.Number + " (void)"
	}
	return noun + " " + h.Number
}

func page(rows []search.Row, offset, limit int) []search.Row {
	if offset >= len(rows) {
		return nil
	}
	end := min(offset+limit, len(rows))
	return rows[offset:end]
}
