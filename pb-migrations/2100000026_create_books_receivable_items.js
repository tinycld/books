/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books receivable items: the rows of the A/R Aging report, stored. Each row
// is a part of one item (`item`): the invoice, the payment's unapplied part,
// the credit memo, or the manual journal line it belongs to. Debit less credit
// is the row's share of the item in integer cents, so a credit is negative.
// item_number is the item's entry number as shown ("JE-10"); item_seq is the
// integer it formats (server/numbering.go), so items sort by number as an
// integer, not as text.
//
// `source` says what a row is:
// - line: one row per posted journal line on an accounts-receivable account.
//   A reversal's line belongs to the item of the entry it reverses and ages
//   from that item's due day. On the A/R line of a posted payment's own
//   entry, credit is the payment's credited (its unapplied part).
// - application: one row per application of a posted payment, a credit on the
//   invoice it pays.
//
// Together the rows of a customer add up to its books_party_balances row: a
// payment's A/R line is split into its applications and its unapplied part.
//
// `settled` is the day the balance of the row's customer and item becomes
// zero and stays zero, 9999-12-31 while it is open. A report of one day reads
// the rows with settled after that day, so it never reads the paid history.
//
// Only Books writes the rows. The two queries in server/receivable_items.go
// are the one definition of a row; server/receivable_refresh.go runs them
// inside the transaction of each write that changes a row and touches core's
// change signal. Only the report engine reads the rows (the
// books.receivable_items source); no client collection backs them. No
// backfill: a new install has an empty ledger.
//
// Indexes. entry and item find the rows a refresh replaces. (customer, item,
// date) serves the settle of one customer and the report's family lookup.
// (settled, date) serves the report's filter. The same migration indexes
// books_accounts on type: the whole-book rebuild and the verify find the
// accounts-receivable accounts by it and then the lines by account
// (idx_books_jlines_account_date), so the ledger is never scanned whole.
//
// AUTHORIZATION. Every member with read access lists and views the rows.
// Nobody creates, updates or deletes a row over REST: the rules are null, and
// server/receivable_refresh.go refuses a superuser's write too.
//
// The rule constants repeat 2100000012's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`

const ITEMS = 'books_receivable_items'

const itemsCollection = app =>
    new Collection({
        id: 'pbc_books_receivable_items',
        name: ITEMS,
        type: 'base',
        listRule: READ,
        viewRule: READ,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            { name: 'source', type: 'select', required: true, maxSelect: 1, values: ['line', 'application'] },
            {
                name: 'customer',
                type: 'relation',
                collectionId: app.findCollectionByNameOrId('books_customers').id,
                cascadeDelete: false,
                maxSelect: 1,
            },
            {
                name: 'entry',
                type: 'relation',
                required: true,
                collectionId: app.findCollectionByNameOrId('books_journal_entries').id,
                cascadeDelete: false,
                maxSelect: 1,
            },
            { name: 'date', type: 'text', required: true },
            { name: 'currency', type: 'text' },
            { name: 'debit', type: 'number', onlyInt: true },
            { name: 'credit', type: 'number', onlyInt: true },
            { name: 'item', type: 'text', required: true },
            { name: 'item_kind', type: 'text', required: true },
            { name: 'item_number', type: 'text' },
            { name: 'item_seq', type: 'number', onlyInt: true },
            { name: 'due_date', type: 'text' },
            { name: 'settled', type: 'text', required: true },
        ],
        indexes: [
            `CREATE INDEX idx_books_receivable_items_entry ON ${ITEMS} (entry)`,
            `CREATE INDEX idx_books_receivable_items_item ON ${ITEMS} (item)`,
            `CREATE INDEX idx_books_receivable_items_customer ON ${ITEMS} (customer, item, date)`,
            `CREATE INDEX idx_books_receivable_items_settled ON ${ITEMS} (settled, date)`,
        ],
    })

const ACCOUNT_TYPE_INDEX = 'CREATE INDEX idx_books_accounts_type ON books_accounts (type)'

migrate(
    app => {
        const accounts = app.findCollectionByNameOrId('books_accounts')
        accounts.indexes.push(ACCOUNT_TYPE_INDEX)
        app.save(accounts)
        app.save(itemsCollection(app))
    },
    app => {
        app.delete(app.findCollectionByNameOrId(ITEMS))
        const accounts = app.findCollectionByNameOrId('books_accounts')
        accounts.indexes = accounts.indexes.filter(index => !index.includes('idx_books_accounts_type'))
        app.save(accounts)
    }
)
