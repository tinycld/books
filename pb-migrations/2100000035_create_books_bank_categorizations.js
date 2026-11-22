/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books bank categorizations (bank-categorize spec §4 Schema): one row for each
// bank transaction that was added to Books. A writer creates the row to
// categorize the transaction (one account or a split) or to record it as a
// transfer, and deletes it to undo.
//
// Its Go hooks (server/bank_categorize.go) stamp connection and created_by,
// refuse a bank transaction that is not For review and each line that cannot
// post, post a journal entry or a transfer for it, match the bank transaction
// to the entry's line on the connection's account (books_bank_matches) and
// stamp entry. The delete voids the entry, which returns the bank transaction
// to For review. A rule cannot read the other rows those checks need, which is
// why they live in Go. No one updates a categorization: to change one, undo it
// and categorize again.
//
// lines holds, for categorize, 1 to 50 objects { account, amount, memo }: the
// amount is integer minor units, signed for the bank transaction's own
// direction, never 0. For transfer it holds one such object whose amount is
// the bank amount without its sign.
//
// AUTHORIZATION. Every member with read access lists and views the rows; a
// writer creates and deletes one, and cannot send the fields Go stamps.
//
// The rule constants repeat 2100000008's: a migration cannot import another.
// It runs before the audit log view (2100000038), which reads none of its
// collections.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

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

migrate(
    app => {
        const transactions = app.findCollectionByNameOrId('books_bank_transactions')
        const connections = app.findCollectionByNameOrId('books_bank_connections')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const customers = app.findCollectionByNameOrId('books_customers')
        const vendors = app.findCollectionByNameOrId('books_vendors')
        app.save(
            new Collection({
                id: 'pbc_books_bank_ctgz',
                name: 'books_bank_categorizations',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset('connection', 'entry', 'created_by')}`,
                updateRule: null,
                deleteRule: WRITE,
                fields: [
                    relation('bank_transaction', transactions.id, true),
                    {
                        name: 'kind',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['categorize', 'transfer'],
                    },
                    // At most one of the two; the Go hook refuses both.
                    relation('customer', customers.id, false, false),
                    relation('vendor', vendors.id, false, false),
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'lines', type: 'json', maxSize: 65536 },
                    // Stamped by the Go hook: connection from the bank
                    // transaction, entry after it posts.
                    relation('connection', connections.id, true, false),
                    relation('entry', entries.id, false, false),
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
                    'CREATE UNIQUE INDEX idx_books_bank_categorizations_txn ON books_bank_categorizations (bank_transaction)',
                    "CREATE UNIQUE INDEX idx_books_bank_categorizations_entry ON books_bank_categorizations (entry) WHERE entry != ''",
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_bank_categorizations'))
    }
)
