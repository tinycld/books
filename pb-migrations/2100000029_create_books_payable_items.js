/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books payable items: the rows of the A/P Aging report, stored. Each row is a
// part of one item (`item`): the bill, the vendor credit, or the manual journal
// line it belongs to. Credit less debit is the row's share of what the business
// owes on the item, in integer cents, so a vendor credit is negative.
// item_number is the item's entry number as shown ("JE-10"); item_seq is the
// integer it formats (server/numbering.go), so items sort by number as an
// integer, not as text.
//
// `source` says what a row is:
// - line: one row per posted journal line on an accounts-payable account,
//   except the lines of a bill payment's or a vendor refund's own entry and of
//   their reversals (their parts are the rows below). A reversal's line
//   belongs to the item of the entry it reverses and ages from that item's due
//   day.
// - payment_line: one row per line of a posted bill payment, a debit on the
//   bill it pays.
// - refund_line: one row per line of a posted vendor refund, a credit on the
//   vendor credit it refunds.
// - application_bill and application_credit: two rows per vendor credit
//   application of a posted credit, at the apply date: a debit on the bill
//   (id the application's) and a credit on the vendor credit (id the
//   application's followed by "c": 16 characters, never a PocketBase id).
//
// Together the rows of a vendor add up to its books_party_balances row: the
// lines of a bill payment add up to the Accounts payable debits of its entry,
// the lines of a vendor refund to the Accounts payable credits of its entry,
// and the two rows of an application add up to zero.
//
// `settled` is the day the balance of the row's vendor and item becomes zero
// and stays zero, 9999-12-31 while it is open. A report of one day reads the
// rows with settled after that day, so it never reads the paid history.
//
// Only Books writes the rows. The four queries in server/payable_items.go are
// the one definition of a row; server/payable_refresh.go runs them inside the
// transaction of each write that changes a row and touches core's change
// signal. Only the report engine reads the rows (the books.payable_items
// source); no client collection backs them. No backfill: a new install has an
// empty ledger.
//
// Indexes. entry and item find the rows a refresh replaces. (vendor, item,
// date) serves the settle of one vendor and item. (settled, date) serves the
// report's filter. books_accounts (type) exists since 2100000028.
//
// AUTHORIZATION. Every member with read access lists and views the rows.
// Nobody creates, updates or deletes a row over REST: the rules are null, and
// server/open_items.go (registerWriteGuard) refuses a superuser's write too.
//
// The rule constants repeat 2100000012's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`

const ITEMS = 'books_payable_items'

const itemsCollection = app =>
    new Collection({
        id: 'pbc_books_payable_items',
        name: ITEMS,
        type: 'base',
        listRule: READ,
        viewRule: READ,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            {
                name: 'source',
                type: 'select',
                required: true,
                maxSelect: 1,
                values: ['line', 'payment_line', 'refund_line', 'application_bill', 'application_credit'],
            },
            {
                name: 'vendor',
                type: 'relation',
                collectionId: app.findCollectionByNameOrId('books_vendors').id,
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
            `CREATE INDEX idx_books_payable_items_entry ON ${ITEMS} (entry)`,
            `CREATE INDEX idx_books_payable_items_item ON ${ITEMS} (item)`,
            `CREATE INDEX idx_books_payable_items_vendor_item_date ON ${ITEMS} (vendor, item, date)`,
            `CREATE INDEX idx_books_payable_items_settled_date ON ${ITEMS} (settled, date)`,
        ],
    })

migrate(
    app => {
        app.save(itemsCollection(app))
    },
    app => {
        app.delete(app.findCollectionByNameOrId(ITEMS))
    }
)
