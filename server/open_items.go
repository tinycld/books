package books

import (
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
)

// openItemsTable is one stored open-items table: one row per movement of an
// item of one party, written only by Books from Queries, with the day each
// item settles. receivableItems and payableItems are its two values.
type openItemsTable struct {
	Collection string   // the stored collection: books_receivable_items or books_payable_items
	Party      string   // the party column: customer or vendor
	Columns    string   // the columns every query gives, in their order
	Queries    []string // the row queries; each ends in its WHERE
	Open       string   // settled while the item is open
	Noun       string   // "receivable": names the table in error texts
	ReadOnly   string   // the refusal of a REST write
}

// openItemDay is settled while an item is open: after every As of day.
const openItemDay = "9999-12-31"

// itemPair names one item of one party: the unit settled is computed for. A
// blank Party is the rows with no party.
type itemPair struct {
	Party string `db:"party"`
	Item  string `db:"item"`
}

// itemPart is one of the queries narrowed to the rows a refresh writes again.
type itemPart struct{ query, where string }

// itemPairChunk bounds the pairs of one settle statement, under SQLite's
// limit of bound values.
const itemPairChunk = 500

// insert stores the rows query gives; where narrows it (" AND
// l.entry = {:entry}"). It returns how many rows it wrote.
func (t openItemsTable) insert(tx core.App, query, where string, params dbx.Params) (int64, error) {
	res, err := tx.DB().NewQuery("INSERT INTO " + t.Collection + " (" + t.Columns + ", settled) SELECT " +
		t.Columns + ", '" + t.Open + "' FROM (" + query + where + ")").Bind(params).Execute()
	if err != nil {
		return 0, fmt.Errorf("books: store %s rows: %w", t.Noun, err)
	}
	return res.RowsAffected()
}

// settledSQL gives, for each party and item of the stored rows (where: "" for
// all of them, or a WHERE on the stored rows that keeps or drops each party
// and item whole), the day its balance becomes zero and stays zero: the first
// day with no later day (itself included) whose end-of-day balance is not
// zero. An item whose last balance is not zero is open. The day is the same
// for either sign of the balance, so both tables read SUM(debit - credit).
func (t openItemsTable) settledSQL(where string) string {
	p := t.Party
	return `
	WITH d AS (
		SELECT ` + p + `, item, date, SUM(debit - credit) AS net
		FROM ` + t.Collection + ` ` + where + ` GROUP BY ` + p + `, item, date
	), r AS (
		SELECT ` + p + `, item, date,
		       SUM(net) OVER (PARTITION BY ` + p + `, item ORDER BY date) AS bal
		FROM d
	), z AS (
		SELECT ` + p + `, item, date,
		       SUM(bal != 0) OVER (PARTITION BY ` + p + `, item ORDER BY date
		                           ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS later
		FROM r
	)
	SELECT z.` + p + ` AS ` + p + `, z.item AS item,
	       COALESCE(MIN(CASE WHEN z.later = 0 THEN z.date END), '` + t.Open + `') AS settled
	FROM z
	GROUP BY z.` + p + `, z.item`
}

// settleSQL writes settled on the stored rows of the pairs that where (a WHERE
// on the stored rows, or "" for all) selects: only the rows whose day changes
// are written.
func (t openItemsTable) settleSQL(where string) string {
	c := t.Collection
	return "UPDATE " + c + " SET settled = s.settled FROM (" +
		t.settledSQL(where) + ") s WHERE s." + t.Party + " = " + c + "." + t.Party + " AND s.item = " +
		c + ".item AND s.settled != " + c + ".settled"
}

// settle writes settled on the stored rows of pairs (a blank party is the
// rows with no party), or of every item when pairs is nil. It returns how many
// rows it changed.
func (t openItemsTable) settle(tx core.App, pairs []itemPair) (int64, error) {
	update := func(where string, params dbx.Params) (int64, error) {
		res, err := tx.DB().NewQuery(t.settleSQL(where)).Bind(params).Execute()
		if err != nil {
			return 0, fmt.Errorf("books: settle %s items: %w", t.Noun, err)
		}
		return res.RowsAffected()
	}
	if pairs == nil {
		return update("", nil)
	}
	// A row with no party holds '' (PocketBase writes '' for an empty
	// relation), never NULL: a NULL would match neither the comparison nor the
	// join on the party, so the blank party here finds exactly those rows.
	var changed int64
	for start := 0; start < len(pairs); start += itemPairChunk {
		chunk := pairs[start:min(start+itemPairChunk, len(pairs))]
		params := dbx.Params{}
		terms := make([]string, len(chunk))
		for i, p := range chunk {
			c, it := fmt.Sprintf("c%d", i), fmt.Sprintf("i%d", i)
			terms[i], params[c], params[it] = "("+t.Party+" = {:"+c+"} AND item = {:"+it+"})", p.Party, p.Item
		}
		n, err := update("WHERE "+strings.Join(terms, " OR "), params)
		if err != nil {
			return 0, err
		}
		changed += n
	}
	return changed, nil
}

// rebuild makes the stored rows equal the queries over the whole book, for a
// book written past the hooks (a test's raw rows, a repair).
func (t openItemsTable) rebuild(tx core.App) error {
	if _, err := tx.DB().NewQuery("DELETE FROM " + t.Collection).Execute(); err != nil {
		return fmt.Errorf("books: clear %s rows: %w", t.Noun, err)
	}
	for _, query := range t.Queries {
		if _, err := t.insert(tx, query, "", nil); err != nil {
			return err
		}
	}
	if _, err := t.settle(tx, nil); err != nil {
		return err
	}
	changesignal.Touch(tx, t.Collection)
	return nil
}

// ItemDrift is one stored open-item row that disagrees with the book. Problem
// is "stale" (stored, and the queries give no such row), "missing" (the
// queries give it, and it is not stored so) or "settled" (its settled day is
// not the day its item's balance stays zero from).
type ItemDrift struct {
	ID      string `db:"id" json:"id"`
	Entry   string `db:"entry" json:"entry"`
	Item    string `db:"item" json:"item"`
	Problem string `db:"problem" json:"problem"`
}

// maxItemDriftsReported bounds the rows the rebuild route lists for one
// table; the route also answers the count of all of them.
const maxItemDriftsReported = 100

// verify compares the stored rows with the queries, both ways, and each row's
// settled with the day its item settles. Every write path refreshes the rows
// it changes, so a drift means one missed it.
func (t openItemsTable) verify(app core.App) ([]ItemDrift, error) {
	parts := make([]string, len(t.Queries))
	for i, query := range t.Queries {
		parts[i] = "SELECT " + t.Columns + " FROM (" + query + ")"
	}
	// One SELECT over the union: a bare compound would bind the EXCEPT below to
	// its first query only.
	computed := "SELECT " + t.Columns + " FROM (" + strings.Join(parts, " UNION ALL ") + ")"
	stored := "SELECT " + t.Columns + " FROM " + t.Collection
	drifts := []ItemDrift{}
	err := app.DB().NewQuery(`
		SELECT id, entry, item, problem FROM (
			SELECT id, entry, item, 'stale' AS problem FROM (` + stored + ` EXCEPT ` + computed + `)
			UNION ALL
			SELECT id, entry, item, 'missing' AS problem FROM (` + computed + ` EXCEPT ` + stored + `)
			UNION ALL
			SELECT t.id, t.entry, t.item, 'settled' AS problem FROM ` + t.Collection + ` t
			JOIN (` + t.settledSQL("") + `) s ON s.` + t.Party + ` = t.` + t.Party + ` AND s.item = t.item
			WHERE s.settled != t.settled
		) ORDER BY problem, id`).All(&drifts)
	if err != nil {
		return nil, fmt.Errorf("books: compare the %s rows with the book: %w", t.Noun, err)
	}
	return drifts, nil
}

// refresh replaces the stored rows that match stale (a condition on the
// table) with the rows parts give, then settles every party and item that
// lost or gained a row. stale must match every row parts can give, so no row
// is stored twice. It must run in the transaction of the write that changed
// the rows: a refresh outside one could commit without that write.
func (t openItemsTable) refresh(tx core.App, stale string, params dbx.Params, parts ...itemPart) error {
	if !tx.IsTransactional() {
		return errors.New("books: " + t.Noun + " rows are refreshed only inside the transaction of the write")
	}
	touched := map[itemPair]bool{}
	collect := func() error {
		var pairs []itemPair
		err := tx.DB().NewQuery("SELECT DISTINCT " + t.Party + " AS party, item FROM " + t.Collection + " WHERE " + stale).Bind(params).All(&pairs)
		if err != nil {
			return fmt.Errorf("books: read the items of %s rows: %w", t.Noun, err)
		}
		for _, p := range pairs {
			touched[p] = true
		}
		return nil
	}
	if err := collect(); err != nil {
		return err
	}
	res, err := tx.DB().NewQuery("DELETE FROM " + t.Collection + " WHERE " + stale).Bind(params).Execute()
	if err != nil {
		return fmt.Errorf("books: clear stale %s rows: %w", t.Noun, err)
	}
	changed, err := res.RowsAffected()
	if err != nil {
		return err
	}
	for _, part := range parts {
		n, err := t.insert(tx, part.query, part.where, params)
		if err != nil {
			return err
		}
		changed += n
	}
	if changed == 0 {
		return nil
	}
	if err := collect(); err != nil {
		return err
	}
	pairs := make([]itemPair, 0, len(touched))
	for p := range touched {
		pairs = append(pairs, p)
	}
	if _, err := t.settle(tx, pairs); err != nil {
		return err
	}
	changesignal.Touch(tx, t.Collection)
	return nil
}

// registerWriteGuard refuses every REST write of the stored rows, a
// superuser's too: the collection's rules stop everyone else, and a row a
// person wrote would disagree with the book until the next rebuild.
func (t openItemsTable) registerWriteGuard(app core.App) {
	refuseWrite := func(e *core.RecordRequestEvent) error { return refuse("%s", t.ReadOnly) }
	app.OnRecordCreateRequest(t.Collection).BindFunc(refuseWrite)
	app.OnRecordUpdateRequest(t.Collection).BindFunc(refuseWrite)
	app.OnRecordDeleteRequest(t.Collection).BindFunc(refuseWrite)
}

// repair rebuilds the stored rows when they disagree with the book.
func (t openItemsTable) repair(tx core.App) error {
	drifts, err := t.verify(tx)
	if err != nil || len(drifts) == 0 {
		return err
	}
	return t.rebuild(tx)
}

// bindItemRefresh binds refresh after each update of collection. Bind it
// after the collection's serialized guard: e.App is then the guard's
// transaction and the record is written.
func bindItemRefresh(app core.App, collection string, refresh func(tx core.App, r *core.Record) error) {
	app.OnRecordUpdate(collection).BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		return refresh(e.App, e.Record)
	})
}
