/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books received payments: money a customer pays, and the invoices it pays.
//
// AUTHORIZATION. The rules are the invoice's (2100000010): every member with
// read access lists and views payments and their applications, a writer
// creates and edits drafts, moves a posted payment to void, and deletes
// drafts. The Go hooks in server/payments.go decide whether the write is
// valid: the customer exists and is active when the write sets or changes it
// (a correction may keep its original's inactive customer), the date is a real
// day, the deposit account (when set) is an active bank or Undeposited funds
// account, the amount is from 1 to 2^53-1 cents, and the applications of a
// payment that is not a draft never change. Each application names a posted
// invoice of the payment's customer, once, with an amount above 0, and a
// payment holds at most 500 of them. The sum of the applications is at most
// the amount, and each is at most its invoice's open balance; Go checks both at
// posting (server/payment_posting.go), because a draft writes its header and
// its applications as separate records.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`, as on
// the invoice: the number and sequence (assigned at posting), applied and
// credited (written at posting: the applications' sum, and amount less it),
// the currency, the journal entry, replaced_by, who and when, and sort_key.
//
// DEPOSIT TO is optional on a draft: posting a payment with none fills in
// Undeposited funds, and creates that account when the chart has none.
//
// CORRECTION. A draft whose replaces names a posted payment posts under the
// original's number; the original becomes void with replaced_by set.
//
// MONEY is integer minor units (onlyInt), at most 2^53-1, the largest integer
// a number field (float64) stores exactly. DATES are YYYY-MM-DD text, as on
// journal entries.
//
// INVOICE BALANCE. books_invoices gains balance here: the open amount of a
// posted invoice, its total less the applications of posted payments (0 on a
// draft or a void invoice). Only Books writes it (server/invoice_balance.go),
// so the invoice rules pin it like the invoice's other server fields. The
// (customer, status, balance) index serves a customer's open invoices.
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

const PAYMENT_SERVER_FIELDS = [
    'number',
    'sequence',
    'applied',
    'credited',
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
        const customers = app.findCollectionByNameOrId('books_customers')
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const invoices = app.findCollectionByNameOrId('books_invoices')

        invoices.fields.add(
            new NumberField({ name: 'balance', onlyInt: true, min: 0, max: MAX_STORED })
        )
        invoices.createRule = `${invoices.createRule} && ${unset('balance')}`
        invoices.updateRule = `${invoices.updateRule} && ${unset('balance')}`
        invoices.indexes = [
            ...invoices.indexes,
            'CREATE INDEX idx_books_invoices_customer_open ON books_invoices (customer, status, balance)',
        ]
        app.save(invoices)

        app.save(
            new Collection({
                id: 'pbc_books_payments',
                name: 'books_payments',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...PAYMENT_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...PAYMENT_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    {
                        name: 'customer',
                        type: 'relation',
                        required: true,
                        collectionId: customers.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
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
                    // PAYMENT_METHODS keys (tinycld/books/lib/payment-methods.ts); empty is none.
                    {
                        name: 'payment_method',
                        type: 'select',
                        maxSelect: 1,
                        values: ['cash', 'check', 'credit_card', 'debit_card', 'bank_transfer', 'other'],
                    },
                    { name: 'reference_no', type: 'text', max: 40 },
                    // Optional on a draft: posting fills in Undeposited funds.
                    {
                        name: 'deposit_to',
                        type: 'relation',
                        collectionId: accounts.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'amount', type: 'number', onlyInt: true, min: 1, max: MAX_STORED },
                    { name: 'applied', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'credited', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'memo', type: 'text', max: 4000 },
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
                    { name: 'sort_key', type: 'text', hidden: true, max: 200 },
                    ...AUTODATES,
                ],
            })
        )

        // The self-relations need the collection to exist first.
        const payments = app.findCollectionByNameOrId('books_payments')
        for (const name of ['replaces', 'replaced_by']) {
            payments.fields.add(
                new RelationField({ name, collectionId: payments.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        payments.indexes = [
            'CREATE INDEX idx_books_payments_customer ON books_payments (customer)',
            'CREATE INDEX idx_books_payments_status_date ON books_payments (status, date)',
            'CREATE INDEX idx_books_payments_deposit_to ON books_payments (deposit_to)',
        ]
        app.save(payments)

        app.save(
            new Collection({
                id: 'pbc_books_payment_apps',
                name: 'books_payment_applications',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.payment.status = "draft"`,
                updateRule: `${WRITE} && ${unset('payment')} && payment.status = "draft"`,
                deleteRule: `${WRITE} && payment.status = "draft"`,
                fields: [
                    {
                        name: 'payment',
                        type: 'relation',
                        required: true,
                        collectionId: payments.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    {
                        name: 'invoice',
                        type: 'relation',
                        required: true,
                        collectionId: invoices.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'amount', type: 'number', onlyInt: true, min: 1, max: MAX_STORED },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_payment_applications_payment_invoice ON books_payment_applications (payment, invoice)',
                    'CREATE INDEX idx_books_payment_applications_invoice ON books_payment_applications (invoice)',
                ],
            })
        )

        // Books search over payments, drafts included, as fts_books_invoices
        // (2100000010): server/search_index.go keeps each row in step with its
        // payment. On a new database there are no payments to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_payments USING fts5(record_id UNINDEXED, number, reference_no, memo, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_payments').execute()
        for (const name of ['books_payment_applications', 'books_payments']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
        const invoices = app.findCollectionByNameOrId('books_invoices')
        invoices.fields.removeByName('balance')
        invoices.createRule = invoices.createRule.replace(` && ${unset('balance')}`, '')
        invoices.updateRule = invoices.updateRule.replace(` && ${unset('balance')}`, '')
        invoices.indexes = invoices.indexes.filter(index => !index.includes('idx_books_invoices_customer_open'))
        app.save(invoices)
    }
)
