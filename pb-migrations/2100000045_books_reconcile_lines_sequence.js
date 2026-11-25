/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Adds the entry's sequence to the books_reconcile_lines view (2100000039). A line's link
// opens its transaction by number (`books/invoices/1005`, lib/record-key.ts), and the
// number of a posted entry is its document's too. The view keeps only posted entries that
// are not a void reversal, so every row's sequence is a number of its own.

const LINES_VIEW = `SELECT l.id AS id, l.id AS line, l.account AS account, l.entry AS entry, l.date AS date,
       l.debit AS debit, l.credit AS credit,
       CAST(CASE WHEN l.memo != '' THEN l.memo ELSE e.memo END AS TEXT) AS memo,
       e.number AS number, e.sequence AS sequence, e.doc_type AS doc_type, e.origin AS origin,
       e.document AS document,
       CAST(COALESCE(c.display_name, v.display_name, '') AS TEXT) AS payee,
       CAST(COALESCE(rl.reconciliation, '') AS TEXT) AS reconciliation,
       CAST(COALESCE(rl.finished, FALSE) AS BOOLEAN) AS finished,
       CAST(EXISTS (SELECT 1 FROM books_bank_match_lines m WHERE m.line = l.id) AS BOOLEAN) AS bank_matched
FROM books_journal_lines l
JOIN books_accounts a ON a.id = l.account AND a.type IN ('bank', 'credit_card')
JOIN books_journal_entries e ON e.id = l.entry AND e.status = 'posted' AND e.origin != 'void_reversal'
LEFT JOIN books_customers c ON c.id = l.customer
LEFT JOIN books_vendors v ON v.id = l.vendor
LEFT JOIN books_reconciliation_lines rl ON rl.line = l.id
WHERE l.posted = TRUE`

const PREVIOUS_VIEW = `SELECT l.id AS id, l.id AS line, l.account AS account, l.entry AS entry, l.date AS date,
       l.debit AS debit, l.credit AS credit,
       CAST(CASE WHEN l.memo != '' THEN l.memo ELSE e.memo END AS TEXT) AS memo,
       e.number AS number, e.doc_type AS doc_type, e.origin AS origin, e.document AS document,
       CAST(COALESCE(c.display_name, v.display_name, '') AS TEXT) AS payee,
       CAST(COALESCE(rl.reconciliation, '') AS TEXT) AS reconciliation,
       CAST(COALESCE(rl.finished, FALSE) AS BOOLEAN) AS finished,
       CAST(EXISTS (SELECT 1 FROM books_bank_match_lines m WHERE m.line = l.id) AS BOOLEAN) AS bank_matched
FROM books_journal_lines l
JOIN books_accounts a ON a.id = l.account AND a.type IN ('bank', 'credit_card')
JOIN books_journal_entries e ON e.id = l.entry AND e.status = 'posted' AND e.origin != 'void_reversal'
LEFT JOIN books_customers c ON c.id = l.customer
LEFT JOIN books_vendors v ON v.id = l.vendor
LEFT JOIN books_reconciliation_lines rl ON rl.line = l.id
WHERE l.posted = TRUE`

migrate(
    app => {
        const view = app.findCollectionByNameOrId('books_reconcile_lines')
        view.viewQuery = LINES_VIEW
        app.save(view)
    },
    app => {
        const view = app.findCollectionByNameOrId('books_reconcile_lines')
        view.viewQuery = PREVIOUS_VIEW
        app.save(view)
    }
)
