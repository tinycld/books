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

// searchSource contributes accounts, journal entries, customers, vendors and
// products to core's federated /api/search. Each kind is read from its FTS5
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
	rows := interleave(accounts, entries, customers, vendors, products)
	total := accountTotal + entryTotal + customerTotal + vendorTotal + productTotal
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
// kind keeps a fixed order (by name, entries by date) rather than FTS rank:
// core ranks the merged rows by how well their visible text matches, and a
// fixed order keeps the pages of one query stable.
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
	ID     string `db:"id"`
	Number string `db:"number"`
	Memo   string `db:"memo"`
	Date   string `db:"date"`
	Status string `db:"status"`
}

// A void's reversal repeats the voided entry's number, and the voided entry
// is the one a person looks for, so reversals are left out.
var entriesQuery = indexQuery{
	index: entriesIndex, table: "books_journal_entries", where: "c.origin != 'void_reversal'",
	columns: "c.id, c.number, c.memo, c.date, c.status", order: "c.date DESC, c.id",
}

func searchEntries(ctx context.Context, app core.App, match string, window int) ([]search.Row, int, error) {
	var hits []entryHit
	total, err := entriesQuery.run(ctx, app, match, window, &hits)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		rows = append(rows, search.Row{
			ID:       "entry:" + h.ID,
			Title:    entryHitTitle(h),
			Subtitle: h.Memo,
			Meta:     h.Date,
			Fields:   map[string]any{"kind": "journal_entry", "status": h.Status},
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
		order:   "c.display_name, c.id",
	},
}

// A vendor's index also holds its legal name, never its tax ID; the hit shows
// neither.
var vendorSource = partySource{
	kind: "vendor", meta: "Vendor",
	query: indexQuery{
		index: vendorsIndex, table: "books_vendors",
		columns: "c.id, c.display_name, c.company, c.email, c.inactive, '' AS parent_name",
		order:   "c.display_name, c.id",
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
	columns: "c.id, c.name, c.sku, c.type, c.inactive", order: "c.name, c.id",
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

func entryHitTitle(h entryHit) string {
	switch {
	case h.Number == "":
		return "Draft journal entry"
	case h.Status == statusVoid:
		return "Journal entry " + h.Number + " (void)"
	}
	return "Journal entry " + h.Number
}

func page(rows []search.Row, offset, limit int) []search.Row {
	if offset >= len(rows) {
		return nil
	}
	end := min(offset+limit, len(rows))
	return rows[offset:end]
}
