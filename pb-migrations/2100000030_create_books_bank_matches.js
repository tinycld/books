/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books bank matches (bank-match spec §4): a match says that one imported bank
// transaction and one or more posted journal lines on its connection's account
// are the same money movement. A match posts nothing and changes no balance.
//
// books_bank_matches is the row a writer creates to match and deletes to undo.
// Its Go hooks (server/bank_match.go) stamp connection and created_by, refuse
// a bank transaction that is not For review and each line that cannot be
// matched, refuse a sum that is not the bank amount, write one
// books_bank_match_lines row for each line and move the bank transaction to
// reviewed; the delete moves it back to for_review. A rule cannot read the
// other rows those checks need, which is why they live in Go. No one updates a
// match: to change one, undo it and match again.
//
// books_bank_match_lines is written only by Go, inside the match's
// transaction. Its unique index on line is what makes "a line is matched once"
// hold under two concurrent matches. Deleting a match or its bank transaction
// deletes its rows (cascadeDelete).
//
// books_bank_match_suggestions is a view: one row for each For review bank
// transaction and each posted journal line on its connection's account that
// fits its side, has exactly its amount, is dated from 90 days before to 7
// days after it, belongs to a posted entry that is not a void reversal, and is
// not matched. One SELECT: PocketBase's view parser refuses UNION ALL. Both
// dates are 10-character days, so they compare as text and the two new line
// indexes can seek on them. Books registers the view with core's change signal
// (server/register.go).
//
// AUTHORIZATION. Every member with read access lists and views the three; a
// writer creates and deletes a match.
//
// The rule constants repeat 2100000008's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

// The ledger migration's MAX_AMOUNT: money is integer minor units.
const MAX_AMOUNT = 1000000000000000
// lib/bank-match.ts MATCH_MAX_LINES.
const MAX_LINES = 50

const AUTODATES = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]

const relation = (name, collectionId, cascadeDelete, required = true) => ({
    name,
    type: 'relation',
    required,
    collectionId,
    cascadeDelete,
    maxSelect: 1,
})

const LINE_INDEXES = [
    'CREATE INDEX idx_books_jlines_match_debit ON books_journal_lines (account, debit, date) WHERE posted = TRUE',
    'CREATE INDEX idx_books_jlines_match_credit ON books_journal_lines (account, credit, date) WHERE posted = TRUE',
]

const SUGGESTIONS = `SELECT (t.id || l.id) AS id, t.id AS bank_transaction, t.connection AS connection,
       l.id AS line, l.entry AS entry, l.date AS date,
       CAST(ABS(julianday(l.date) - julianday(t.date)) AS INTEGER) AS days_apart
FROM books_bank_transactions t
JOIN books_bank_connections c ON c.id = t.connection
JOIN books_journal_lines l ON l.account = c.account AND l.posted = TRUE
     AND ((t.amount > 0 AND l.debit = t.amount) OR (t.amount < 0 AND l.credit = -t.amount))
     AND l.date >= date(t.date, '-90 days')
     AND l.date <= date(t.date, '+7 days')
JOIN books_journal_entries e ON e.id = l.entry AND e.status = 'posted' AND e.origin != 'void_reversal'
WHERE t.status = 'for_review'
  AND NOT EXISTS (SELECT 1 FROM books_bank_match_lines m WHERE m.line = l.id)`

migrate(
    app => {
        const transactions = app.findCollectionByNameOrId('books_bank_transactions')
        const connections = app.findCollectionByNameOrId('books_bank_connections')
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const matches = new Collection({
            id: 'pbc_books_bank_mtch',
            name: 'books_bank_matches',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: `${WRITE} && ${unset('connection', 'created_by')}`,
            updateRule: null,
            deleteRule: WRITE,
            fields: [
                relation('bank_transaction', transactions.id, true),
                {
                    name: 'lines',
                    type: 'relation',
                    required: true,
                    collectionId: lines.id,
                    cascadeDelete: false,
                    maxSelect: MAX_LINES,
                },
                // Stamped from the bank transaction by the Go hook.
                relation('connection', connections.id, true, false),
                {
                    name: 'created_by',
                    type: 'relation',
                    collectionId: '_pb_users_auth_',
                    cascadeDelete: false,
                    maxSelect: 1,
                },
                ...AUTODATES,
            ],
            indexes: [
                'CREATE UNIQUE INDEX idx_books_bank_matches_txn ON books_bank_matches (bank_transaction)',
            ],
        })
        app.save(matches)
        app.save(
            new Collection({
                id: 'pbc_books_bank_mlns',
                name: 'books_bank_match_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('match', matches.id, true),
                    relation('bank_transaction', transactions.id, true),
                    relation('line', lines.id, false),
                    relation('entry', entries.id, false),
                    // The line's debit or credit: positive minor units.
                    { name: 'amount', type: 'number', onlyInt: true, min: 0, max: MAX_AMOUNT },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bank_match_lines_line ON books_bank_match_lines (line)',
                    'CREATE INDEX idx_books_bank_match_lines_entry ON books_bank_match_lines (entry)',
                    'CREATE INDEX idx_books_bank_match_lines_txn ON books_bank_match_lines (bank_transaction)',
                ],
            })
        )
        lines.indexes.push(...LINE_INDEXES)
        app.save(lines)
        app.save(
            new Collection({
                type: 'view',
                name: 'books_bank_match_suggestions',
                listRule: READ,
                viewRule: READ,
                viewQuery: SUGGESTIONS,
            })
        )
    },
    app => {
        for (const name of ['books_bank_match_suggestions', 'books_bank_match_lines', 'books_bank_matches']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        lines.indexes = lines.indexes.filter(index => !index.includes('idx_books_jlines_match_'))
        app.save(lines)
    }
)
