package books

import (
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/changesignal"
)

// receivableItemsCollection stores the rows of every receivable item: one row
// per posted Accounts receivable journal line (source line) and one per
// application of a posted payment (source application). Only Books writes it,
// with raw SQL from the two queries below, inside the transaction of the write
// that changes a row. settled is the day the balance of the row's customer
// and item becomes zero and stays zero, or receivableOpen while the item is
// open: the A/R Aging reads only the rows with settled after its As of day.
const (
	receivableItemsCollection   = "books_receivable_items"
	receivableSourceLine        = "line"
	receivableSourceApplication = "application"
	receivableOpen              = "9999-12-31"
)

// receivableColumns are the columns the two queries give, in their order.
const receivableColumns = "id, source, customer, entry, date, currency, debit, credit, item, item_kind, item_number, item_seq, due_date"

// A line's entry names its document (e), or the entry it reverses names it
// (r); a reversal carries the doc_type of what it reverses.
const (
	receivableIsDoc = "COALESCE(e.doc_type, '') IN ('invoice', 'payment', 'credit_memo') AND COALESCE(NULLIF(e.document, ''), NULLIF(r.document, '')) IS NOT NULL"
	receivableDocID = "COALESCE(NULLIF(e.document, ''), r.document)"
	// A write-off (w) and its void reversal change the invoice they name (wi,
	// whose entry is wie): their line is a row of that invoice's item.
	receivableIsWriteOff = "w.id IS NOT NULL"
	// A manual line's item is the line itself; a reversal's line is the item
	// of the reversed line at the same position.
	receivableLineItem = "CASE WHEN " + receivableIsWriteOff + " THEN w.invoice WHEN " + receivableIsDoc + " THEN " + receivableDocID +
		" WHEN e.reverses != '' THEN COALESCE((SELECT rl.id FROM books_journal_lines rl WHERE rl.entry = e.reverses AND rl.position = l.position), l.id) ELSE l.id END"
)

// receivableLinesSQL is one row per posted journal line on an
// accounts-receivable account. A reversal's line belongs to the item of the
// entry it reverses and ages from that item's due day. A write-off's line and
// its void reversal's belong to the invoice it writes off, with that invoice's
// number and due day, so the write-off settles the invoice. On the A/R line of
// a posted payment's own entry, credit is the payment's credited (its
// unapplied part); its applications are the other query's rows. It ends in its
// WHERE, so a refresh adds " AND l.entry = {:entry}".
const receivableLinesSQL = "SELECT l.id AS id, '" + receivableSourceLine + "' AS source, l.customer AS customer, l.entry AS entry, l.date AS date, l.currency AS currency, l.debit AS debit, " +
	"CAST(CASE WHEN p.id IS NOT NULL AND l.credit > 0 THEN p.credited ELSE l.credit END AS INTEGER) AS credit, " +
	"CAST(" + receivableLineItem + " AS TEXT) AS item, " +
	"CAST(CASE WHEN " + receivableIsWriteOff + " THEN 'invoice' WHEN " + receivableIsDoc + " THEN e.doc_type ELSE 'entry' END AS TEXT) AS item_kind, " +
	"CAST(CASE WHEN " + receivableIsWriteOff + " THEN wie.number ELSE COALESCE(r.number, e.number) END AS TEXT) AS item_number, " +
	"CAST(CASE WHEN " + receivableIsWriteOff + " THEN wie.sequence ELSE COALESCE(r.sequence, e.sequence) END AS INTEGER) AS item_seq, " +
	"CAST(CASE WHEN " + receivableIsWriteOff + " THEN wi.due_date WHEN " + receivableIsDoc + " AND e.doc_type = 'invoice' THEN i.due_date ELSE COALESCE(r.date, e.date) END AS TEXT) AS due_date " +
	"FROM books_journal_lines l " +
	"JOIN books_accounts a ON a.id = l.account " +
	"JOIN books_journal_entries e ON e.id = l.entry " +
	"LEFT JOIN books_journal_entries r ON r.id = e.reverses " +
	"LEFT JOIN books_payments p ON p.id = e.document AND e.doc_type = 'payment' AND p.entry = e.id AND p.status = 'posted' " +
	"LEFT JOIN books_invoices i ON e.doc_type = 'invoice' AND i.id = " + receivableDocID + " " +
	"LEFT JOIN books_write_offs w ON e.doc_type = 'write_off' AND w.id = " + receivableDocID + " " +
	"LEFT JOIN books_invoices wi ON wi.id = w.invoice " +
	"LEFT JOIN books_journal_entries wie ON wie.id = wi.entry " +
	"WHERE l.posted = TRUE AND a.type = 'accounts_receivable'"

// receivableApplicationsSQL is one row per application of a posted payment, a
// credit on the invoice it pays. It ends in its WHERE, so a refresh adds
// " AND pa.payment = {:payment}" or " AND pa.invoice = {:invoice}".
const receivableApplicationsSQL = "SELECT pa.id AS id, '" + receivableSourceApplication + "' AS source, p.customer AS customer, p.entry AS entry, p.date AS date, p.currency AS currency, " +
	"CAST(0 AS INTEGER) AS debit, pa.amount AS credit, " +
	"CAST(pa.invoice AS TEXT) AS item, " +
	"CAST('invoice' AS TEXT) AS item_kind, " +
	"CAST(ie.number AS TEXT) AS item_number, " +
	"CAST(ie.sequence AS INTEGER) AS item_seq, " +
	"i.due_date AS due_date " +
	"FROM books_payment_applications pa " +
	"JOIN books_payments p ON p.id = pa.payment " +
	"JOIN books_invoices i ON i.id = pa.invoice " +
	"JOIN books_journal_entries ie ON ie.id = i.entry " +
	"WHERE p.status = 'posted'"

// receivableSettledSQL gives, for each customer and item of the stored rows
// (%s: "" for all of them, or a WHERE on the stored rows that keeps or drops
// each customer and item whole), the day its balance becomes zero and stays zero: the
// first day with no later day (itself included) whose end-of-day balance is
// not zero. An item whose last balance is not zero is open.
const receivableSettledSQL = `
	WITH d AS (
		SELECT customer, item, date, SUM(debit - credit) AS net
		FROM books_receivable_items %s GROUP BY customer, item, date
	), r AS (
		SELECT customer, item, date,
		       SUM(net) OVER (PARTITION BY customer, item ORDER BY date) AS bal
		FROM d
	), z AS (
		SELECT customer, item, date,
		       SUM(bal != 0) OVER (PARTITION BY customer, item ORDER BY date
		                           ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS later
		FROM r
	)
	SELECT z.customer AS customer, z.item AS item,
	       COALESCE(MIN(CASE WHEN z.later = 0 THEN z.date END), '` + receivableOpen + `') AS settled
	FROM z
	GROUP BY z.customer, z.item`

// insertReceivables stores the rows query gives; where narrows it (" AND
// l.entry = {:entry}"). It returns how many rows it wrote.
func insertReceivables(tx core.App, query, where string, params dbx.Params) (int64, error) {
	res, err := tx.DB().NewQuery("INSERT INTO " + receivableItemsCollection + " (" + receivableColumns + ", settled) SELECT " +
		receivableColumns + ", '" + receivableOpen + "' FROM (" + query + where + ")").Bind(params).Execute()
	if err != nil {
		return 0, fmt.Errorf("books: store receivable rows: %w", err)
	}
	return res.RowsAffected()
}

// receivablePair names one item of one customer: the unit settled is computed
// for. A blank Customer is the rows with no customer.
type receivablePair struct {
	Customer string `db:"customer"`
	Item     string `db:"item"`
}

// receivablePairChunk bounds the pairs of one settle statement, under SQLite's
// limit of bound values.
const receivablePairChunk = 500

// settleReceivablesSQL writes settled on the stored rows of the pairs that
// where (a WHERE on the stored rows, or "" for all) selects: only the rows whose
// day changes are written.
func settleReceivablesSQL(where string) string {
	t := receivableItemsCollection
	return "UPDATE " + t + " SET settled = s.settled FROM (" +
		fmt.Sprintf(receivableSettledSQL, where) + ") s WHERE s.customer = " + t + ".customer AND s.item = " +
		t + ".item AND s.settled != " + t + ".settled"
}

// settleReceivables writes settled on the stored rows of pairs (a blank customer
// is the rows with no customer), or of every item when pairs is nil. It
// returns how many rows it changed.
func settleReceivables(tx core.App, pairs []receivablePair) (int64, error) {
	update := func(where string, params dbx.Params) (int64, error) {
		res, err := tx.DB().NewQuery(settleReceivablesSQL(where)).Bind(params).Execute()
		if err != nil {
			return 0, fmt.Errorf("books: settle receivable items: %w", err)
		}
		return res.RowsAffected()
	}
	if pairs == nil {
		return update("", nil)
	}
	// A row with no customer holds '' (PocketBase writes '' for an empty
	// relation), never NULL: a NULL would match neither the comparison nor the
	// join on customer, so the blank customer here finds exactly those rows.
	var changed int64
	for start := 0; start < len(pairs); start += receivablePairChunk {
		chunk := pairs[start:min(start+receivablePairChunk, len(pairs))]
		params := dbx.Params{}
		terms := make([]string, len(chunk))
		for i, p := range chunk {
			c, it := fmt.Sprintf("c%d", i), fmt.Sprintf("i%d", i)
			terms[i], params[c], params[it] = "(customer = {:"+c+"} AND item = {:"+it+"})", p.Customer, p.Item
		}
		n, err := update("WHERE "+strings.Join(terms, " OR "), params)
		if err != nil {
			return 0, err
		}
		changed += n
	}
	return changed, nil
}

// rebuildReceivables makes the stored rows equal the two queries over the
// whole book, for a book written past the hooks (a test's raw rows, a repair).
func rebuildReceivables(tx core.App) error {
	if _, err := tx.DB().NewQuery("DELETE FROM " + receivableItemsCollection).Execute(); err != nil {
		return fmt.Errorf("books: clear receivable rows: %w", err)
	}
	for _, query := range []string{receivableLinesSQL, receivableApplicationsSQL} {
		if _, err := insertReceivables(tx, query, "", nil); err != nil {
			return err
		}
	}
	if _, err := settleReceivables(tx, nil); err != nil {
		return err
	}
	changesignal.Touch(tx, receivableItemsCollection)
	return nil
}

// ReceivableDrift is one stored receivable row that disagrees with the book.
// Problem is "stale" (stored, and the queries give no such row), "missing"
// (the queries give it, and it is not stored so) or "settled" (its settled day
// is not the day its item's balance stays zero from).
type ReceivableDrift struct {
	ID      string `db:"id" json:"id"`
	Entry   string `db:"entry" json:"entry"`
	Item    string `db:"item" json:"item"`
	Problem string `db:"problem" json:"problem"`
}

// maxReceivableDriftsReported bounds the rows the rebuild route lists; the
// route also answers the count of all of them.
const maxReceivableDriftsReported = 100

// verifyReceivables compares the stored rows with the two queries, both ways,
// and each row's settled with the day its item settles. Every write path
// refreshes the rows it changes, so a drift means one missed it.
func verifyReceivables(app core.App) ([]ReceivableDrift, error) {
	computed := "SELECT " + receivableColumns + " FROM (" + receivableLinesSQL + " UNION ALL " + receivableApplicationsSQL + ")"
	stored := "SELECT " + receivableColumns + " FROM " + receivableItemsCollection
	drifts := []ReceivableDrift{}
	err := app.DB().NewQuery(`
		SELECT id, entry, item, problem FROM (
			SELECT id, entry, item, 'stale' AS problem FROM (` + stored + ` EXCEPT ` + computed + `)
			UNION ALL
			SELECT id, entry, item, 'missing' AS problem FROM (` + computed + ` EXCEPT ` + stored + `)
			UNION ALL
			SELECT t.id, t.entry, t.item, 'settled' AS problem FROM ` + receivableItemsCollection + ` t
			JOIN (` + fmt.Sprintf(receivableSettledSQL, "") + `) s ON s.customer = t.customer AND s.item = t.item
			WHERE s.settled != t.settled
		) ORDER BY problem, id`).All(&drifts)
	if err != nil {
		return nil, fmt.Errorf("books: compare the receivable rows with the book: %w", err)
	}
	return drifts, nil
}
