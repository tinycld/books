/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books reconciliations (reconcile spec §4): a reconciliation compares one bank
// or credit card account with one bank statement. A writer starts one, clears
// the posted lines that are on the statement, and finishes it at a difference
// of $0.00. Nothing here posts or changes a balance.
//
// books_reconciliations is one row for each reconciliation. Its Go hooks
// (server/reconcile.go) stamp who started it, the account's currency and the
// beginning balance (the statement balance of the account's last finished
// one), refuse an account that cannot be reconciled, a second one in progress
// and a statement date on or before the last finished one, and at the finish
// check the difference from the stored cleared rows and stamp the sums. The
// rules pin every field the server stamps, keep the account fixed after the
// create, and leave a finished row alone.
//
// books_reconciliation_lines is one row for each cleared line: a press creates
// it and a second press deletes it. Go stamps the line's account, entry, date
// and amounts and sets finished at the finish. The unique index on line is
// what makes "a line is cleared once" hold under two presses. Nobody updates a
// row, and a finished one is never deleted.
//
// books_reconcile_lines is a view: one row for each posted journal line on a
// bank or credit card account whose entry is posted and is not a void
// reversal, with its memo (the line's, else the entry's), its payee, the
// reconciliation that holds it and whether a bank match holds it. One SELECT:
// PocketBase's view parser refuses UNION ALL. Each computed column is cast so
// the view parser gives it a type. Books registers the view with core's change
// signal (server/register.go).
//
// AUTHORIZATION. Every member with read access lists and views the three; a
// writer creates, updates and deletes a reconciliation in progress and creates
// and deletes its cleared rows.
//
// The rule constants repeat 2100000008's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

// The ledger migration's MAX_AMOUNT: money is integer minor units.
const MAX_AMOUNT = 1000000000000000
const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const ID = '^[a-z0-9]{15}$'

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

const user = name => ({
    name,
    type: 'relation',
    collectionId: '_pb_users_auth_',
    cascadeDelete: false,
    maxSelect: 1,
})

const amount = name => ({ name, type: 'number', onlyInt: true, min: 0, max: MAX_AMOUNT })
const signed = name => ({ name, type: 'number', onlyInt: true, min: -MAX_AMOUNT, max: MAX_AMOUNT })

// The fields of a reconciliation that only the server writes.
const STAMPED = [
    'beginning_balance',
    'cleared_out',
    'cleared_in',
    'cleared_out_count',
    'cleared_in_count',
    'created_by',
    'finished_by',
    'finished_at',
    'currency',
]

const LINE_STAMPED = ['account', 'entry', 'date', 'debit', 'credit', 'finished']

const LINES_VIEW = `SELECT l.id AS id, l.id AS line, l.account AS account, l.entry AS entry, l.date AS date,
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
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const reconciliations = new Collection({
            id: 'pbc_books_reconcil',
            name: 'books_reconciliations',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: `${WRITE} && @request.body.status = "in_progress" && ${unset(...STAMPED)}`,
            updateRule: `${WRITE} && status = "in_progress" && ${unset('account', ...STAMPED)}`,
            deleteRule: `${WRITE} && status = "in_progress"`,
            fields: [
                relation('account', accounts.id, false),
                { name: 'statement_date', type: 'text', required: true, max: 10, pattern: DAY },
                // In the account's own balance sense: money in the account for a
                // bank account, the amount owed for a credit card account.
                signed('statement_balance'),
                { name: 'has_statement_totals', type: 'bool' },
                // _out is the credit side and _in the debit side, here and in
                // cleared_out / cleared_in.
                amount('statement_out'),
                amount('statement_in'),
                {
                    name: 'status',
                    type: 'select',
                    required: true,
                    maxSelect: 1,
                    values: ['in_progress', 'finished'],
                },
                // Stamped by the Go hooks: at the create, and at the finish.
                signed('beginning_balance'),
                amount('cleared_out'),
                amount('cleared_in'),
                amount('cleared_out_count'),
                amount('cleared_in_count'),
                user('created_by'),
                user('finished_by'),
                { name: 'finished_at', type: 'date' },
                { name: 'currency', type: 'text', max: 3 },
                ...AUTODATES,
            ],
            indexes: [
                "CREATE UNIQUE INDEX idx_books_reconciliations_open ON books_reconciliations (account) WHERE status = 'in_progress'",
                'CREATE INDEX idx_books_reconciliations_account_date ON books_reconciliations (account, statement_date)',
            ],
        })
        app.save(reconciliations)
        app.save(
            new Collection({
                id: 'pbc_books_recn_lin',
                name: 'books_reconciliation_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset(...LINE_STAMPED)}`,
                updateRule: null,
                deleteRule: `${WRITE} && finished = false`,
                fields: [
                    relation('reconciliation', reconciliations.id, true),
                    // The journal line's id. A text field, not a relation: a
                    // relation adds a cascade lookup to every journal line
                    // delete. The Go hook refuses an id that is no line.
                    { name: 'line', type: 'text', required: true, min: 15, max: 15, pattern: ID },
                    // Stamped from the line by the Go hook.
                    relation('account', accounts.id, false, false),
                    relation('entry', entries.id, false, false),
                    { name: 'date', type: 'text', max: 10 },
                    amount('debit'),
                    amount('credit'),
                    { name: 'finished', type: 'bool' },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_reconciliation_lines_line ON books_reconciliation_lines (line)',
                    'CREATE INDEX idx_books_reconciliation_lines_recon ON books_reconciliation_lines (reconciliation)',
                    'CREATE INDEX idx_books_reconciliation_lines_entry ON books_reconciliation_lines (entry)',
                ],
            })
        )
        app.save(
            new Collection({
                id: 'pbc_books_recn_viw',
                type: 'view',
                name: 'books_reconcile_lines',
                listRule: READ,
                viewRule: READ,
                viewQuery: LINES_VIEW,
            })
        )
    },
    app => {
        for (const name of ['books_reconcile_lines', 'books_reconciliation_lines', 'books_reconciliations']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
