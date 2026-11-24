package books

import (
	"database/sql"
	"fmt"
	"slices"

	"github.com/pocketbase/pocketbase/core"
)

// recordsByID reads the rows of collection that ids name in one query, keyed
// by id: a read for each line or move of a post would make its statements grow
// with its lines. An id with no row is not in the map; recordOf answers
// sql.ErrNoRows for it, as FindRecordById does.
func recordsByID(tx core.App, collection string, ids []string) (map[string]*core.Record, error) {
	ids = slices.Compact(slices.Sorted(slices.Values(ids)))
	if len(ids) == 0 {
		return nil, nil
	}
	found, err := tx.FindRecordsByIds(collection, ids)
	if err != nil {
		return nil, fmt.Errorf("books: read the rows of %s: %w", collection, err)
	}
	rows := make(map[string]*core.Record, len(found))
	for _, r := range found {
		rows[r.Id] = r
	}
	return rows, nil
}

// recordOf is the row of rows with id, or sql.ErrNoRows.
func recordOf(rows map[string]*core.Record, id string) (*core.Record, error) {
	if r, ok := rows[id]; ok {
		return r, nil
	}
	return nil, sql.ErrNoRows
}

// lineProducts reads the products the item and percent lines name, in one
// query (recordsByID).
func lineProducts(tx core.App, lines []*core.Record) (map[string]*core.Record, error) {
	var ids []string
	for _, line := range lines {
		kind, id := line.GetString("kind"), line.GetString("product")
		if (kind == lineKindItem || kind == lineKindPercent) && id != "" {
			ids = append(ids, id)
		}
	}
	return recordsByID(tx, "books_products", ids)
}

// accountReader reads an account by id: findAccount on a line's own save, a
// map of one recordsByID read when a post checks all its lines.
type accountReader func(id string) (*core.Record, error)

func findAccount(tx core.App) accountReader {
	return func(id string) (*core.Record, error) { return tx.FindRecordById("books_accounts", id) }
}

// lineAccountIDs are the accounts the account lines name.
func lineAccountIDs(lines []*core.Record) []string {
	var ids []string
	for _, line := range lines {
		if id := line.GetString("account"); line.GetString("kind") == lineKindAccount && id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}
