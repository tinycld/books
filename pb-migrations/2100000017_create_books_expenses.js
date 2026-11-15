/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books expenses: money already paid from a bank or credit card account,
// optionally to a vendor, and its lines. An expense is the fifth kind of the
// document layer and the second purchase document (2100000013): its party is
// a vendor and is optional, it has the bill's two line tables (account lines
// and product lines, one collection with a kind), no address, no sales tax, no
// message and no email, and posting credits the account it was paid from
// (paid_from) and debits the lines' accounts.
//
// AUTHORIZATION. The rules are the bill's: every member with read access lists
// and views expenses and their lines, a writer creates and edits drafts, moves
// a posted expense to void, and deletes drafts. The Go hooks in
// server/sales_documents.go, server/purchase_lines.go and server/expenses.go
// decide whether the write is valid: the payment date is a real day, paid_from
// is a bank or credit card account, a check number is not on another non-void
// Check expense from the same account, an expense holds at most 250 lines,
// each line has its kind's cells and no other kind's, an account line's
// account is an expense, other expense or cost of goods sold account and its
// amount is not 0, a line's product is a Service or Non-inventory item and is
// active when the line sets or changes it, a line of an expense that is not a
// draft never changes, and the total is from 0 to 2^53-1 cents. Posting checks
// the vendor (when one is chosen) and paid_from are active.
//
// SERVER-OWNED FIELDS, REVISION, MONEY, DATES and SORT KEY are as on the bill
// (2100000013).
//
// date is the payment date. payment_method is a PAYMENT_METHODS key and is
// required (an expense always has a method). reference_no is the check number
// or card reference. form and fields are the core forms engine's host columns
// (books:expense).
//
// The rule constants repeat 2100000010's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'
// 2^53-1: the largest whole number of cents a number field stores exactly.
const MAX_STORED = 9007199254740991
// The largest line amount, as on journal lines.
const MAX_AMOUNT = 1000000000000000

const EXPENSE_SERVER_FIELDS = [
    'number',
    'sequence',
    'subtotal',
    'total',
    'currency',
    'entry',
    'replaced_by',
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

migrate(
    app => {
        const forms = app.findCollectionByNameOrId('forms')
        const vendors = app.findCollectionByNameOrId('books_vendors')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const products = app.findCollectionByNameOrId('books_products')

        app.save(
            new Collection({
                id: 'pbc_books_expenses',
                name: 'books_expenses',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...EXPENSE_SERVER_FIELDS, 'revision')}`,
                updateRule: `${WRITE} && ${unset(...EXPENSE_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    {
                        name: 'vendor',
                        type: 'relation',
                        collectionId: vendors.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    {
                        name: 'paid_from',
                        type: 'relation',
                        required: true,
                        collectionId: accounts.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    // PAYMENT_METHODS keys (tinycld/books/lib/payment-methods.ts,
                    // server/payment_methods.json).
                    {
                        name: 'payment_method',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['cash', 'check', 'credit_card', 'debit_card', 'bank_transfer', 'other'],
                    },
                    { name: 'reference_no', type: 'text', max: 40 },
                    {
                        name: 'status',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['draft', 'posted', 'void'],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'subtotal', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    // Counts the transactions that changed the draft or its lines. A
                    // save or a post states the value it saw (server/revision.go).
                    { name: 'revision', type: 'number', onlyInt: true, min: 0 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    {
                        name: 'entry',
                        type: 'relation',
                        collectionId: entries.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'posted_at', type: 'date' },
                    userRef('posted_by'),
                    { name: 'voided_at', type: 'date' },
                    userRef('voided_by'),
                    {
                        name: 'form',
                        type: 'relation',
                        collectionId: forms.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'fields', type: 'json', maxSize: 1000000 },
                    { name: 'sort_key', type: 'text', hidden: true, max: 200 },
                    ...AUTODATES,
                ],
            })
        )

        // The self-relations need the collection to exist first.
        const expenses = app.findCollectionByNameOrId('books_expenses')
        for (const name of ['replaces', 'replaced_by']) {
            expenses.fields.add(
                new RelationField({ name, collectionId: expenses.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        expenses.indexes = [
            'CREATE INDEX idx_books_expenses_vendor ON books_expenses (vendor)',
            'CREATE INDEX idx_books_expenses_check ON books_expenses (paid_from, payment_method, reference_no)',
            'CREATE INDEX idx_books_expenses_status_date ON books_expenses (status, date)',
            'CREATE INDEX idx_books_expenses_form ON books_expenses (form)',
        ]
        app.save(expenses)

        app.save(
            new Collection({
                id: 'pbc_books_expense_lines',
                name: 'books_expense_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: `${WRITE} && ${unset('expense')} && expense.status = "draft"`,
                deleteRule: `${WRITE} && expense.status = "draft"`,
                fields: [
                    {
                        name: 'expense',
                        type: 'relation',
                        required: true,
                        collectionId: expenses.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    {
                        name: 'kind',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['account', 'item'],
                    },
                    {
                        name: 'account',
                        type: 'relation',
                        collectionId: accounts.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    {
                        name: 'product',
                        type: 'relation',
                        collectionId: products.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'description', type: 'text', max: 4000 },
                    { name: 'quantity', type: 'number', min: 0.01, max: 1000000 },
                    { name: 'rate', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'amount', type: 'number', onlyInt: true, min: -MAX_AMOUNT, max: MAX_AMOUNT },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_expense_lines_expense ON books_expense_lines (expense, position)',
                    'CREATE INDEX idx_books_expense_lines_account ON books_expense_lines (account)',
                    'CREATE INDEX idx_books_expense_lines_product ON books_expense_lines (product)',
                ],
            })
        )

        // Books search over expenses, drafts included, as fts_books_bills
        // (2100000013): one row per expense with its number, its Ref no. and the
        // memo. It holds no vendor name, so a renamed vendor needs no reindex of
        // its expenses. On a new database there are no expenses to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_expenses USING fts5(record_id UNINDEXED, number, reference_no, memo, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_expenses').execute()
        for (const name of ['books_expense_lines', 'books_expenses']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
