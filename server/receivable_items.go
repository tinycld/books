package books

// receivableItemsCollection stores the rows of every receivable item: one row
// per posted Accounts receivable journal line (source line), one per
// application of a posted payment and two per application of a posted credit
// memo (source application). Only Books writes it, with raw SQL from the three
// queries below (receivableQueries), inside the transaction of the write
// that changes a row. settled is the day the balance of the row's customer
// and item becomes zero and stays zero, or receivableOpen while the item is
// open: the A/R Aging reads only the rows with settled after its As of day.
const (
	receivableItemsCollection   = "books_receivable_items"
	receivableSourceLine        = "line"
	receivableSourceApplication = "application"
	receivableOpen              = openItemDay
)

// receivableColumns are the columns the three queries give, in their order.
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

// receivableCreditApplicationsSQL is two rows per application of a posted
// credit memo, both at the apply date with the memo's customer, currency and
// entry: a credit of the amount on the invoice's item (the application's id)
// and a debit of the amount on the memo's item (the application's id in upper
// case: 15 characters, the same on every run, and never a PocketBase id, which
// is lower case). The memo's own line keeps its full credit at its date, so
// the memo's item is its unapplied rest from the apply date, and the two rows
// add to zero. It is wrapped, so a refresh adds " AND ca.entry = {:entry}" or
// " AND ca.item = {:invoice}" on its own columns; the extra credit_memo column
// is not stored (receivableItems.insert selects receivableColumns).
const receivableCreditApplicationsSQL = "SELECT * FROM (" +
	"SELECT ca.id AS id, '" + receivableSourceApplication + "' AS source, m.customer AS customer, m.entry AS entry, ca.date AS date, m.currency AS currency, " +
	"CAST(0 AS INTEGER) AS debit, ca.amount AS credit, CAST(ca.invoice AS TEXT) AS item, CAST('invoice' AS TEXT) AS item_kind, " +
	"CAST(ie.number AS TEXT) AS item_number, CAST(ie.sequence AS INTEGER) AS item_seq, CAST(i.due_date AS TEXT) AS due_date, ca.credit_memo AS credit_memo " +
	"FROM " + creditMemoApplicationsCollection + " ca JOIN books_credit_memos m ON m.id = ca.credit_memo " +
	"JOIN books_invoices i ON i.id = ca.invoice JOIN books_journal_entries ie ON ie.id = i.entry WHERE m.status = 'posted' " +
	"UNION ALL " +
	"SELECT UPPER(ca.id) AS id, '" + receivableSourceApplication + "' AS source, m.customer, m.entry, ca.date, m.currency, " +
	"ca.amount AS debit, CAST(0 AS INTEGER) AS credit, CAST(ca.credit_memo AS TEXT), CAST('credit_memo' AS TEXT), " +
	"CAST(me.number AS TEXT), CAST(me.sequence AS INTEGER), CAST(m.date AS TEXT), ca.credit_memo " +
	"FROM " + creditMemoApplicationsCollection + " ca JOIN books_credit_memos m ON m.id = ca.credit_memo " +
	"JOIN books_journal_entries me ON me.id = m.entry WHERE m.status = 'posted'" +
	") ca WHERE TRUE"

// receivableQueries are the three queries of the stored rows.
var receivableQueries = []string{receivableLinesSQL, receivableApplicationsSQL, receivableCreditApplicationsSQL}

// receivableItems is the stored receivable table: its rows, settled days,
// refresh, verify and rebuild are the open-items engine's (open_items.go).
var receivableItems = openItemsTable{
	Collection: receivableItemsCollection, Party: "customer", Columns: receivableColumns,
	Queries: receivableQueries, Open: receivableOpen, Noun: "receivable", ReadOnly: msgReceivableItemsReadOnly,
}
