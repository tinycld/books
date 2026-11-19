/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books receivable items: the open items of the A/R Aging report, as two views
// over the ledger. Each row is a part of one open item (`item`): the invoice,
// the payment's unapplied part, the credit memo, or the manual journal line it
// belongs to. Debit less credit is the row's share of the item in integer
// cents, so a credit is negative. item_number is the item's entry number as
// shown ("JE-10"); item_seq is the integer it formats (server/numbering.go),
// so items sort by number as an integer, not as text.
//
// - books_receivable_lines: one row per posted journal line on an
//   accounts-receivable account. A reversal's line belongs to the item of the
//   entry it reverses and ages from that item's due day. On the A/R line of a
//   posted payment's own entry, credit is the payment's credited (its
//   unapplied part); its applications are in the other view.
// - books_receivable_applications: one row per application of a posted
//   payment, a credit on the invoice it pays.
//
// Together the rows of a customer add up to its books_party_balances row: a
// payment's A/R line is split into its applications and its unapplied part.
// Nothing writes the views: Books registers them with core's change signal
// (server/receivable_items.go). Only the report engine reads them (the
// books.receivable_items source); no client collection backs them.
//
// Each view is one SELECT with joins: PocketBase's view parser refuses UNION
// ALL. Computed columns are cast so PocketBase types them as text or number;
// the relations customer and entry are bare columns and keep their type.
//
// The lines view reads the accounts first: CROSS JOIN keeps SQLite from
// reordering the join, so the lines are found by account through
// idx_books_jlines_account_date and the ledger is never scanned whole (the
// query-plan bars of the A/R Aging report, server/report_ar_aging_scale_test.go).
// The same migration indexes books_accounts on type, so the accounts-receivable
// accounts are found by that index.
//
// AUTHORIZATION. Every member with read access lists and views the rows; a
// view has no create, update or delete.
//
// The rule constants repeat 2100000012's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`

// A line's entry names its document (`e`), or the entry it reverses names it
// (`r`); a reversal carries the doc_type of what it reverses.
const IS_DOC =
    "COALESCE(e.doc_type, '') IN ('invoice', 'payment', 'credit_memo') AND COALESCE(NULLIF(e.document, ''), NULLIF(r.document, '')) IS NOT NULL"
const DOC_ID = "COALESCE(NULLIF(e.document, ''), r.document)"

// A manual line's item is the line itself; a reversal's line is the item of
// the reversed line at the same position.
const LINE_ITEM = `CASE WHEN ${IS_DOC} THEN ${DOC_ID} WHEN e.reverses != '' THEN COALESCE((SELECT rl.id FROM books_journal_lines rl WHERE rl.entry = e.reverses AND rl.position = l.position), l.id) ELSE l.id END`

const LINES_QUERY = [
    'SELECT l.id AS id, l.customer AS customer, l.entry AS entry, l.date AS date, l.currency AS currency, l.debit AS debit,',
    'CAST(CASE WHEN p.id IS NOT NULL AND l.credit > 0 THEN p.credited ELSE l.credit END AS INTEGER) AS credit,',
    `CAST(${LINE_ITEM} AS TEXT) AS item,`,
    `CAST(CASE WHEN ${IS_DOC} THEN e.doc_type ELSE 'entry' END AS TEXT) AS item_kind,`,
    'CAST(COALESCE(r.number, e.number) AS TEXT) AS item_number,',
    'CAST(COALESCE(r.sequence, e.sequence) AS INTEGER) AS item_seq,',
    `CAST(CASE WHEN ${IS_DOC} AND e.doc_type = 'invoice' THEN i.due_date ELSE COALESCE(r.date, e.date) END AS TEXT) AS due_date`,
    'FROM books_accounts a',
    'CROSS JOIN books_journal_lines l ON l.account = a.id',
    'JOIN books_journal_entries e ON e.id = l.entry',
    'LEFT JOIN books_journal_entries r ON r.id = e.reverses',
    "LEFT JOIN books_payments p ON p.id = e.document AND e.doc_type = 'payment' AND p.entry = e.id AND p.status = 'posted'",
    `LEFT JOIN books_invoices i ON e.doc_type = 'invoice' AND i.id = ${DOC_ID}`,
    "WHERE l.posted = TRUE AND a.type = 'accounts_receivable'",
].join(' ')

const APPLICATIONS_QUERY = [
    'SELECT pa.id AS id, p.customer AS customer, p.entry AS entry, p.date AS date, p.currency AS currency,',
    'CAST(0 AS INTEGER) AS debit, pa.amount AS credit,',
    'CAST(pa.invoice AS TEXT) AS item,',
    "CAST('invoice' AS TEXT) AS item_kind,",
    'CAST(ie.number AS TEXT) AS item_number,',
    'CAST(ie.sequence AS INTEGER) AS item_seq,',
    'i.due_date AS due_date',
    'FROM books_payment_applications pa',
    'JOIN books_payments p ON p.id = pa.payment',
    'JOIN books_invoices i ON i.id = pa.invoice',
    'JOIN books_journal_entries ie ON ie.id = i.entry',
    "WHERE p.status = 'posted'",
].join(' ')

const ACCOUNT_TYPE_INDEX = 'CREATE INDEX idx_books_accounts_type ON books_accounts (type)'

const VIEWS = [
    ['books_receivable_lines', LINES_QUERY],
    ['books_receivable_applications', APPLICATIONS_QUERY],
]

migrate(
    app => {
        const accounts = app.findCollectionByNameOrId('books_accounts')
        accounts.indexes.push(ACCOUNT_TYPE_INDEX)
        app.save(accounts)
        for (const [name, viewQuery] of VIEWS) {
            app.save(
                new Collection({
                    type: 'view',
                    name,
                    listRule: READ,
                    viewRule: READ,
                    viewQuery,
                })
            )
        }
    },
    app => {
        for (const [name] of VIEWS) {
            app.delete(app.findCollectionByNameOrId(name))
        }
        const accounts = app.findCollectionByNameOrId('books_accounts')
        accounts.indexes = accounts.indexes.filter(index => !index.includes('idx_books_accounts_type'))
        app.save(accounts)
    }
)
