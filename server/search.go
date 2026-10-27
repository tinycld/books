package books

import (
	"context"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/search"
)

// searchSource contributes accounts, journal entries and customers to core's
// federated /api/search. Rows are shaped here so the palette and the CLI show
// the same thing; the client adapter (tinycld/books/search-adapter.ts) only
// navigates.
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
	rows := interleave(accounts, entries, customers)
	return search.Result{Rows: page(rows, offset, limit), Total: accountTotal + entryTotal + customerTotal}, nil
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

type customerHit struct {
	ID          string `db:"id"`
	DisplayName string `db:"display_name"`
	Company     string `db:"company"`
	Email       string `db:"email"`
	Inactive    bool   `db:"inactive"`
	ParentName  string `db:"parent_name"`
}

// customerHitTitle uses the "Parent : Child" form of the client's
// customerLabel, so two sub-customers of the same name under different
// parents are told apart.
func customerHitTitle(h customerHit) string {
	if h.ParentName == "" {
		return h.DisplayName
	}
	return h.ParentName + " : " + h.DisplayName
}

func searchCustomers(ctx context.Context, app core.App, q search.Query, window int) ([]search.Row, int, error) {
	// Qualified with c.: the parent self-join below makes bare names
	// ambiguous, and the match stays on the child's own columns. The count
	// uses the same alias and the LEFT JOIN on the unique parent id adds or
	// drops no rows, so both queries match the same rows.
	where, params := likeWhere([]string{"c.display_name", "c.company", "c.email"}, q)
	var total int
	if err := app.DB().NewQuery("SELECT COUNT(*) FROM books_customers c WHERE " + where).
		WithContext(ctx).Bind(params).Row(&total); err != nil {
		return nil, 0, fmt.Errorf("books: count customer hits: %w", err)
	}
	params["window"] = window
	var hits []customerHit
	if err := app.DB().NewQuery("SELECT c.id, c.display_name, c.company, c.email, c.inactive," +
		" COALESCE(p.display_name, '') AS parent_name" +
		" FROM books_customers c LEFT JOIN books_customers p ON p.id = c.parent WHERE " + where +
		" ORDER BY c.display_name, c.id LIMIT {:window}").WithContext(ctx).Bind(params).All(&hits); err != nil {
		return nil, 0, fmt.Errorf("books: search customers: %w", err)
	}
	rows := make([]search.Row, 0, len(hits))
	for _, h := range hits {
		subtitle := h.Company
		if subtitle == "" {
			subtitle = h.Email
		}
		rows = append(rows, search.Row{
			ID:       "customer:" + h.ID,
			Title:    customerHitTitle(h),
			Subtitle: subtitle,
			Meta:     "Customer",
			Fields:   map[string]any{"kind": "customer", "inactive": h.Inactive},
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
