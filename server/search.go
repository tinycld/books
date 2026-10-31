package books

import (
	"context"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/search"
)

// searchSource contributes accounts, journal entries, customers, vendors and
// products to core's federated /api/search. Rows are shaped here so the
// palette and the CLI show the same thing; the client adapter
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
	if !level.CanRead() || len(q.Include) == 0 {
		return search.Result{}, nil
	}
	limit := q.Limit
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	offset := max(q.Offset, 0)
	window := offset + limit
	ctx := q.Context()

	accounts, accountTotal, err := searchAccounts(ctx, app, q, window)
	if err != nil {
		return search.Result{}, err
	}
	entries, entryTotal, err := searchEntries(ctx, app, q, window)
	if err != nil {
		return search.Result{}, err
	}
	customers, customerTotal, err := searchCustomers(ctx, app, q, window)
	if err != nil {
		return search.Result{}, err
	}
	vendors, vendorTotal, err := searchVendors(ctx, app, q, window)
	if err != nil {
		return search.Result{}, err
	}
	products, productTotal, err := searchProducts(ctx, app, q, window)
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

type accountHit struct {
	ID       string `db:"id"`
	Name     string `db:"name"`
	Number   string `db:"number"`
	Type     string `db:"type"`
	Inactive bool   `db:"inactive"`
}

func searchAccounts(ctx context.Context, app core.App, q search.Query, window int) ([]search.Row, int, error) {
	where, params := likeWhere([]string{"name", "number", "description"}, q)
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM books_accounts WHERE " + where).
		WithContext(ctx).Bind(params).Row(&total); err != nil {
		return nil, 0, fmt.Errorf("books: count account hits: %w", err)
	}
	params["window"] = window
	var hits []accountHit
	if err := app.DB().NewQuery("SELECT id, name, number, type, inactive FROM books_accounts WHERE " + where +
		" ORDER BY name, id LIMIT {:window}").WithContext(ctx).Bind(params).All(&hits); err != nil {
		return nil, 0, fmt.Errorf("books: search accounts: %w", err)
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

// searchEntries leaves out a void's reversal: it repeats the voided entry's
// number, and the voided entry is the one a person looks for.
func searchEntries(ctx context.Context, app core.App, q search.Query, window int) ([]search.Row, int, error) {
	match, params := likeWhere([]string{"number", "memo"}, q)
	where := "origin != 'void_reversal' AND (" + match + ")"
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM books_journal_entries WHERE " + where).
		WithContext(ctx).Bind(params).Row(&total); err != nil {
		return nil, 0, fmt.Errorf("books: count entry hits: %w", err)
	}
	params["window"] = window
	var hits []entryHit
	if err := app.DB().NewQuery("SELECT id, number, memo, date, status FROM books_journal_entries WHERE " + where +
		" ORDER BY date DESC, id LIMIT {:window}").WithContext(ctx).Bind(params).All(&hits); err != nil {
		return nil, 0, fmt.Errorf("books: search entries: %w", err)
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

// partySource names a table of parties (people and companies the books deal
// with) and how its hits read: the row id prefix and kind, the Meta label,
// and whether a row may have a parent row in the same table.
type partySource struct {
	table, kind, meta string
	withParent        bool
	// matchColumns are the columns a term may match, qualified with c.: a
	// vendor's legal name, never its tax ID.
	matchColumns []string
}

var customerSource = partySource{
	table: "books_customers", kind: "customer", meta: "Customer", withParent: true,
	matchColumns: []string{"c.display_name", "c.company", "c.email"},
}

var vendorSource = partySource{
	table: "books_vendors", kind: "vendor", meta: "Vendor", withParent: false,
	matchColumns: []string{"c.display_name", "c.company", "c.email", "c.legal_name"},
}

// partyHitTitle uses the client's "Parent : Child" label form, so two rows of
// the same name under different parents are told apart.
func partyHitTitle(h partyHit) string {
	if h.ParentName == "" {
		return h.DisplayName
	}
	return h.ParentName + " : " + h.DisplayName
}

func searchCustomers(ctx context.Context, app core.App, q search.Query, window int) ([]search.Row, int, error) {
	return searchParties(ctx, app, q, window, customerSource)
}

// searchVendors has no parent join, so a vendor's title is its display name.
func searchVendors(ctx context.Context, app core.App, q search.Query, window int) ([]search.Row, int, error) {
	return searchParties(ctx, app, q, window, vendorSource)
}

func searchParties(ctx context.Context, app core.App, q search.Query, window int, src partySource) ([]search.Row, int, error) {
	// Qualified with c. in both forms, so the query with no parent join and
	// the one with it share one match clause.
	where, params := likeWhere(src.matchColumns, q)
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM " + src.table + " c WHERE " + where).
		WithContext(ctx).Bind(params).Row(&total); err != nil {
		return nil, 0, fmt.Errorf("books: count %s hits: %w", src.kind, err)
	}
	params["window"] = window
	parentName := " '' AS parent_name"
	from := " FROM " + src.table + " c"
	if src.withParent {
		// Qualified with c.: the parent self-join makes bare names ambiguous,
		// and the match stays on the child's own columns. The count uses the
		// same alias and the LEFT JOIN on the unique parent id adds or drops
		// no rows, so both queries match the same rows.
		parentName = " COALESCE(p.display_name, '') AS parent_name"
		from += " LEFT JOIN " + src.table + " p ON p.id = c.parent"
	}
	var hits []partyHit
	if err := app.DB().NewQuery("SELECT c.id, c.display_name, c.company, c.email, c.inactive," +
		parentName + from + " WHERE " + where +
		" ORDER BY c.display_name, c.id LIMIT {:window}").WithContext(ctx).Bind(params).All(&hits); err != nil {
		return nil, 0, fmt.Errorf("books: search %ss: %w", src.kind, err)
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

// searchProducts matches the sales description but not the purchase one: the
// sales text is what a customer reads and what a person recalls an item by.
func searchProducts(ctx context.Context, app core.App, q search.Query, window int) ([]search.Row, int, error) {
	where, params := likeWhere([]string{"name", "sku", "sales_description"}, q)
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM books_products WHERE " + where).
		WithContext(ctx).Bind(params).Row(&total); err != nil {
		return nil, 0, fmt.Errorf("books: count product hits: %w", err)
	}
	params["window"] = window
	var hits []productHit
	if err := app.DB().NewQuery("SELECT id, name, sku, type, inactive FROM books_products WHERE " + where +
		" ORDER BY name, id LIMIT {:window}").WithContext(ctx).Bind(params).All(&hits); err != nil {
		return nil, 0, fmt.Errorf("books: search products: %w", err)
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

// likeWhere builds "every include term matches some column, and no exclude
// term matches any". SQLite's LIKE is case-insensitive for ASCII.
func likeWhere(columns []string, q search.Query) (string, dbx.Params) {
	params := dbx.Params{}
	var parts []string
	for i, term := range q.Include {
		key := fmt.Sprintf("i%d", i)
		params[key] = "%" + escapeLike(term) + "%"
		parts = append(parts, "("+anyColumnLike(columns, key)+")")
	}
	for i, term := range q.Exclude {
		key := fmt.Sprintf("x%d", i)
		params[key] = "%" + escapeLike(term) + "%"
		parts = append(parts, "NOT ("+anyColumnLike(columns, key)+")")
	}
	return strings.Join(parts, " AND "), params
}

func anyColumnLike(columns []string, key string) string {
	ors := make([]string, len(columns))
	for i, c := range columns {
		ors[i] = fmt.Sprintf(`%s LIKE {:%s} ESCAPE '\'`, c, key)
	}
	return strings.Join(ors, " OR ")
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func page(rows []search.Row, offset, limit int) []search.Row {
	if offset >= len(rows) {
		return nil
	}
	end := min(offset+limit, len(rows))
	return rows[offset:end]
}
