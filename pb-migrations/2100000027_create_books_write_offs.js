/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books write-offs: the open balance of a posted invoice moved to an expense
// account, in one posted, numbered document that can be voided. Posting
// debits the chosen account and credits the Accounts receivable account the
// invoice's entry debited, and lowers the invoice's balance by the amount
// (server/write_offs.go, server/write_off_posting.go).
//
// AUTHORIZATION. The rules are the received payment's (2100000019) for a
// Books reader and writer: every member with read access lists and views
// write-offs, and a writer creates one and moves a posted one to void. There
// is no draft: a write-off is created posted, so the create rule admits only
// status "posted" and the update rule only posted -> void. Nobody deletes a
// write-off: there is no delete rule. The Go hooks decide whether the write is
// valid: the invoice is posted with an open balance and the amount is that
// balance, the date is a real day on or after the invoice date, the account is
// an active expense or other expense account, and the memo is at most 4000
// characters.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`, as on
// the received payment: the customer (from the invoice), the number and
// sequence (assigned at posting), the currency, the journal entry, the close
// override, who and when, and sort_key.
//
// INVOICE. books_invoices.written_off (2100000010) holds the sum of the
// invoice's posted write-offs; only Books writes it, with balance.
//
// CASH BASIS. A write-off is no payment: books_cash_basis_lines gains the
// document kind write_off, so the write-off's own entry is taken out of the
// cash layer (server/cash_basis.go).
//
// MONEY is integer minor units (onlyInt), at most 2^53-1, the largest integer
// a number field (float64) stores exactly. DATES are YYYY-MM-DD text, as on
// journal entries.
//
// The rule constants repeat 2100000019's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'
// 2^53-1: the largest whole number of cents a number field stores exactly.
const MAX_STORED = 9007199254740991

const WRITE_OFF_SERVER_FIELDS = [
    'customer',
    'number',
    'sequence',
    'currency',
    'entry',
    'close_override',
    'posted_by',
    'posted_at',
    'voided_by',
    'voided_at',
    'sort_key',
]

const AUTODATES = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]
const userRef = name => ({
    name,
    type: 'relation',
    collectionId: '_pb_users_auth_',
    cascadeDelete: false,
    maxSelect: 1,
})
const relation = (name, collectionId, extra = {}) => ({
    name,
    type: 'relation',
    collectionId,
    cascadeDelete: false,
    maxSelect: 1,
    ...extra,
})

const CASH_LINE_KINDS_BEFORE = ['bill', 'invoice', 'credit_memo', 'vendor_credit']

migrate(
    app => {
        const invoices = app.findCollectionByNameOrId('books_invoices')
        const customers = app.findCollectionByNameOrId('books_customers')
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const entries = app.findCollectionByNameOrId('books_journal_entries')

        app.save(
            new Collection({
                id: 'pbc_books_writeoffs',
                name: 'books_write_offs',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "posted" && ${unset(...WRITE_OFF_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...WRITE_OFF_SERVER_FIELDS)} && status = "posted" && @request.body.status = "void"`,
                deleteRule: null,
                fields: [
                    relation('invoice', invoices.id, { required: true }),
                    relation('customer', customers.id),
                    {
                        name: 'status',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['posted', 'void'],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    relation('account', accounts.id, { required: true }),
                    {
                        name: 'amount',
                        type: 'number',
                        required: true,
                        onlyInt: true,
                        min: 1,
                        max: MAX_STORED,
                    },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    relation('entry', entries.id),
                    relation('close_override', 'pbc_books_closeov'),
                    { name: 'posted_at', type: 'date' },
                    userRef('posted_by'),
                    { name: 'voided_at', type: 'date' },
                    userRef('voided_by'),
                    { name: 'sort_key', type: 'text', hidden: true, max: 200 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_write_offs_invoice ON books_write_offs (invoice)',
                    'CREATE INDEX idx_books_write_offs_customer ON books_write_offs (customer)',
                    'CREATE INDEX idx_books_write_offs_status_date ON books_write_offs (status, date)',
                    // The account delete guard counts the write-offs of an account.
                    'CREATE INDEX idx_books_write_offs_account ON books_write_offs (account)',
                ],
            })
        )
        const writeOffs = app.findCollectionByNameOrId('books_write_offs')

        const cashLines = app.findCollectionByNameOrId('books_cash_basis_lines')
        cashLines.fields.getByName('document_kind').values = [...CASH_LINE_KINDS_BEFORE, 'write_off']
        cashLines.fields.add(
            new RelationField({
                name: 'write_off',
                collectionId: writeOffs.id,
                cascadeDelete: true,
                maxSelect: 1,
            })
        )
        cashLines.indexes = [
            ...cashLines.indexes,
            'CREATE INDEX idx_books_cash_basis_lines_write_off ON books_cash_basis_lines (write_off)',
        ]
        app.save(cashLines)

        // Books search over write-offs, as fts_books_vendor_refunds
        // (2100000024): the number and the memo. server/search_index.go keeps
        // each row in step with its write-off. On a new database there are no
        // write-offs to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_write_offs USING fts5(record_id UNINDEXED, number, memo, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_write_offs').execute()

        const cashLines = app.findCollectionByNameOrId('books_cash_basis_lines')
        cashLines.indexes = cashLines.indexes.filter(index => !index.includes('_write_off '))
        cashLines.fields.removeByName('write_off')
        cashLines.fields.getByName('document_kind').values = CASH_LINE_KINDS_BEFORE
        app.save(cashLines)

        app.delete(app.findCollectionByNameOrId('books_write_offs'))
    }
)
