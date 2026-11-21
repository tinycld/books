/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books bill payments: money the business pays a vendor, and the bills it
// pays. There is no draft bill payment: a writer creates a payment with status
// posted and its lines in one batch, and the server posts it from the create's
// request hook once the lines exist (server/bill_payments.go,
// bindBillPaymentCreate). A create outside a batch, or one whose batch adds no
// line, is refused "Select at least one bill to pay." and nothing is stored.
//
// AUTHORIZATION. Every member with read access lists and views bill payments
// and their lines. A writer creates a payment with status posted and moves a
// posted payment to void; nothing else of a payment changes, and no client
// deletes one. A writer creates lines only inside the batch that creates their
// payment (Go checks the payment's creating mark); no client updates or
// deletes a line. A bill correction moves the lines of its original on the
// server. The Go hooks in server/bill_payments.go decide whether the write is
// valid: one to 250 lines, each naming a posted bill of the payment's vendor
// once with an amount above 0 and at most the bill's balance, paid_from an
// active bank or credit card account, the check number not on another
// expense or bill payment, and the date a real day after the close date.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`: the
// number and sequence (assigned at posting), the total (the lines' sum), the
// currency, the journal entry, replaced_by, who and when, and sort_key.
// posted_by is not pinned on the create: the request hook stamps the poster.
//
// CORRECTION. A payment whose replaces names a posted bill payment of the same
// vendor posts under the original's number; the original becomes void with
// replaced_by set, and its lines give their amounts back to their bills.
//
// CASH BASIS. books_cash_basis_lines and books_cash_basis_tax_lines are the
// cash-basis rows the server derives from payments (server/cash_basis.go).
// Readers list them; no client writes them. books_cash_basis_balances holds the totals of the cash-basis rows per account and month (server/cash_balances.go).
//
// MONEY is integer minor units (onlyInt), at most 2^53-1, the largest integer
// a number field (float64) stores exactly. DATES are YYYY-MM-DD text, as on
// journal entries.
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

const BILL_PAYMENT_SERVER_FIELDS = [
    'number',
    'sequence',
    'total',
    'currency',
    'entry',
    'replaced_by',
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
const signedAmount = name => ({
    name,
    type: 'number',
    onlyInt: true,
    min: -MAX_STORED,
    max: MAX_STORED,
})

migrate(
    app => {
        const vendors = app.findCollectionByNameOrId('books_vendors')
        const customers = app.findCollectionByNameOrId('books_customers')
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const bills = app.findCollectionByNameOrId('books_bills')
        const invoices = app.findCollectionByNameOrId('books_invoices')
        const rates = app.findCollectionByNameOrId('books_tax_rates')
        const agencies = app.findCollectionByNameOrId('books_tax_agencies')

        app.save(
            new Collection({
                id: 'pbc_books_billpay',
                name: 'books_bill_payments',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "posted" && ${unset(...BILL_PAYMENT_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...BILL_PAYMENT_SERVER_FIELDS, 'posted_by')} && status = "posted" && @request.body.status = "void"`,
                deleteRule: null,
                fields: [
                    relation('vendor', vendors.id, { required: true }),
                    relation('paid_from', accounts.id, { required: true }),
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
                        values: ['posted', 'void'],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    relation('entry', entries.id),
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
        const payments = app.findCollectionByNameOrId('books_bill_payments')
        for (const name of ['replaces', 'replaced_by']) {
            payments.fields.add(
                new RelationField({ name, collectionId: payments.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        payments.indexes = [
            'CREATE INDEX idx_books_bill_payments_vendor ON books_bill_payments (vendor)',
            'CREATE INDEX idx_books_bill_payments_status_date ON books_bill_payments (status, date)',
            'CREATE INDEX idx_books_bill_payments_check ON books_bill_payments (paid_from, payment_method, reference_no)',
        ]
        app.save(payments)

        app.save(
            new Collection({
                id: 'pbc_books_billpay_lines',
                name: 'books_bill_payment_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('payment', payments.id, { required: true, cascadeDelete: true }),
                    relation('bill', bills.id, { required: true }),
                    { name: 'amount', type: 'number', onlyInt: true, min: 1, max: MAX_STORED },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bill_payment_lines_payment_bill ON books_bill_payment_lines (payment, bill)',
                    'CREATE INDEX idx_books_bill_payment_lines_bill ON books_bill_payment_lines (bill)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_cash_lines',
                name: 'books_cash_basis_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    {
                        name: 'document_kind',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['bill', 'invoice'],
                    },
                    relation('bill', bills.id, { cascadeDelete: true }),
                    relation('invoice', invoices.id, { cascadeDelete: true }),
                    // The payment's entry of a share row; empty on a taken-out row.
                    relation('payment_entry', entries.id),
                    relation('entry', entries.id, { required: true }),
                    relation('account', accounts.id, { required: true }),
                    relation('vendor', vendors.id),
                    relation('customer', customers.id),
                    { name: 'debit', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'credit', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'posted', type: 'bool' },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_cash_basis_lines_account_date ON books_cash_basis_lines (account, date)',
                    'CREATE INDEX idx_books_cash_basis_lines_bill ON books_cash_basis_lines (bill)',
                    'CREATE INDEX idx_books_cash_basis_lines_invoice ON books_cash_basis_lines (invoice)',
                    // Transaction Detail's Split column looks up a row's siblings by entry.
                    'CREATE INDEX idx_books_cash_basis_lines_entry ON books_cash_basis_lines (entry)',
                ],
            })
        )

        // The stored cash months: for each account and month, the totals of the
        // posted books_cash_basis_lines rows (server/cash_balances.go). The server
        // keeps them with the rows. Readers list them; no client writes them.
        app.save(
            new Collection({
                id: 'pbc_books_cash_months',
                name: 'books_cash_basis_balances',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('account', accounts.id, { required: true }),
                    { name: 'period', type: 'text', required: true, max: 7, pattern: '^\\d{4}-\\d{2}$' },
                    // The first day of the month, so a report compares the row with a day.
                    { name: 'month_start', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-01$' },
                    { name: 'debit_total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'credit_total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'currency', type: 'text', required: true, pattern: '^[A-Z]{3}$' },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_cash_balances_account_period ON books_cash_basis_balances (account, period)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_cash_tax',
                name: 'books_cash_basis_tax_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('invoice', invoices.id, { required: true, cascadeDelete: true }),
                    relation('rate', rates.id, { required: true }),
                    relation('component', rates.id, { required: true }),
                    relation('agency', agencies.id, { required: true }),
                    { name: 'rate_ppm', type: 'number', onlyInt: true, min: 0, max: 1000000 },
                    signedAmount('gross_amount'),
                    signedAmount('taxable_amount'),
                    signedAmount('amount'),
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    // The payment's entry of a share row; empty on a taken-out row.
                    relation('payment_entry', entries.id),
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_cash_basis_tax_lines_date ON books_cash_basis_tax_lines (date)',
                    // The invoice cash rebuild reads and replaces an invoice's tax rows.
                    'CREATE INDEX idx_books_cash_basis_tax_lines_invoice ON books_cash_basis_tax_lines (invoice)',
                ],
            })
        )

        // Books search over bill payments, as fts_books_payments (2100000019):
        // server/search_index.go keeps each row in step with its payment. On a
        // new database there are no bill payments to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_bill_payments USING fts5(record_id UNINDEXED, number, reference_no, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_bill_payments').execute()
        for (const name of [
            'books_cash_basis_balances',
            'books_cash_basis_tax_lines',
            'books_cash_basis_lines',
            'books_bill_payment_lines',
            'books_bill_payments',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
