/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books sales receipts: a sale paid on the spot, its lines, and the tax lines
// the server writes when the receipt posts. A sales receipt is the invoice's
// second sales document kind (2100000010): the same columns minus terms and
// due_date, an optional customer, and how and where the customer paid.
//
// AUTHORIZATION. The rules are the invoice's: every member with read access
// lists and views receipts and their lines, a writer creates and edits drafts,
// moves a posted receipt to void, and deletes drafts. The Go hooks in
// server/sales_documents.go and server/sales_receipts.go decide whether the
// write is valid: the customer (when one is chosen) and the tax rate exist and
// are active when the write sets or changes them, the date is a real day, the
// deposit account is an active bank or Undeposited funds account (or the one
// "Sales deposited to" names, which Books writes itself), a receipt holds at
// most 250 lines, each line has its kind's cells and no other kind's, a line
// of a receipt that is not a draft never changes, and the total is from 0 to
// 2^53-1 cents.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`, as on
// the invoice: the number and sequence (assigned at posting), the three
// totals, the currency, the journal entry, replaced_by, who and when, and
// sort_key on the receipt; amount on a line.
//
// PAYMENT. payment_method is a PAYMENT_METHODS key, empty for none.
// reference_no is the check or card reference, at most 40 characters.
// deposit_to is the account the posting debits; it is required, so a receipt
// always names where the money went.
//
// MONEY, DATES, SORT KEY, TAX LINES, bill_to, form and fields are as on the
// invoice (2100000010); form and fields are the forms engine's host columns
// (books:sales_receipt).
//
// SETTINGS. books_settings gains sales_deposit_account here, not in
// 2100000001, because books_accounts is created after 2100000001: empty means
// "Ask" (the form shows Deposit to); an account means Books deposits every
// sales receipt there.
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

const RECEIPT_SERVER_FIELDS = [
    'number',
    'sequence',
    'subtotal',
    'tax_total',
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
const LINE_SERVER_FIELDS = ['amount']

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
        const customers = app.findCollectionByNameOrId('books_customers')
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const products = app.findCollectionByNameOrId('books_products')
        const rates = app.findCollectionByNameOrId('books_tax_rates')
        const agencies = app.findCollectionByNameOrId('books_tax_agencies')

        app.save(
            new Collection({
                id: 'pbc_books_salesrc',
                name: 'books_sales_receipts',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...RECEIPT_SERVER_FIELDS, 'revision')}`,
                updateRule: `${WRITE} && ${unset(...RECEIPT_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    // Optional: a walk-in sale names no customer.
                    {
                        name: 'customer',
                        type: 'relation',
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
                    { name: 'bill_to', type: 'json', maxSize: 8192 },
                    { name: 'email', type: 'email' },
                    {
                        name: 'tax_rate',
                        type: 'relation',
                        collectionId: rates.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    // PAYMENT_METHODS keys (tinycld/books/lib/payment-methods.ts); empty is none.
                    {
                        name: 'payment_method',
                        type: 'select',
                        maxSelect: 1,
                        values: ['cash', 'check', 'credit_card', 'debit_card', 'bank_transfer', 'other'],
                    },
                    { name: 'reference_no', type: 'text', max: 40 },
                    {
                        name: 'deposit_to',
                        type: 'relation',
                        required: true,
                        collectionId: accounts.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'message', type: 'text', max: 4000 },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'subtotal', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'tax_total', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    // As on the invoice (2100000010): the count a save or a post states.
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
        const receipts = app.findCollectionByNameOrId('books_sales_receipts')
        for (const name of ['replaces', 'replaced_by']) {
            receipts.fields.add(
                new RelationField({ name, collectionId: receipts.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        receipts.indexes = [
            'CREATE INDEX idx_books_sales_receipts_customer ON books_sales_receipts (customer)',
            'CREATE INDEX idx_books_sales_receipts_status_date ON books_sales_receipts (status, date)',
            'CREATE INDEX idx_books_sales_receipts_tax_rate ON books_sales_receipts (tax_rate)',
            'CREATE INDEX idx_books_sales_receipts_deposit_to ON books_sales_receipts (deposit_to)',
            'CREATE INDEX idx_books_sales_receipts_form ON books_sales_receipts (form)',
        ]
        app.save(receipts)

        app.save(
            new Collection({
                id: 'pbc_books_salesrc_lines',
                name: 'books_sales_receipt_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS, 'sales_receipt')} && sales_receipt.status = "draft"`,
                deleteRule: `${WRITE} && sales_receipt.status = "draft"`,
                fields: [
                    {
                        name: 'sales_receipt',
                        type: 'relation',
                        required: true,
                        collectionId: receipts.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    {
                        name: 'kind',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['item', 'description', 'subtotal', 'percent'],
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
                    { name: 'rate', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'percent_ppm', type: 'number', onlyInt: true, min: -1000000, max: 10000000 },
                    { name: 'amount', type: 'number', onlyInt: true, min: -MAX_AMOUNT, max: MAX_AMOUNT },
                    { name: 'taxable', type: 'bool' },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_sales_receipt_lines_receipt ON books_sales_receipt_lines (sales_receipt, position)',
                    'CREATE INDEX idx_books_sales_receipt_lines_product ON books_sales_receipt_lines (product)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_salesrc_tax',
                name: 'books_sales_receipt_tax_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    {
                        name: 'sales_receipt',
                        type: 'relation',
                        required: true,
                        collectionId: receipts.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    // The receipt's rate or group.
                    {
                        name: 'rate',
                        type: 'relation',
                        required: true,
                        collectionId: rates.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    // The rate whose tax this row is: the rate itself, or one
                    // component of the group.
                    {
                        name: 'component',
                        type: 'relation',
                        required: true,
                        collectionId: rates.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    {
                        name: 'agency',
                        type: 'relation',
                        required: true,
                        collectionId: agencies.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'rate_ppm', type: 'number', onlyInt: true, min: 0, max: 1000000 },
                    {
                        name: 'taxable_amount',
                        type: 'number',
                        onlyInt: true,
                        min: -MAX_STORED,
                        max: MAX_STORED,
                    },
                    { name: 'amount', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_sales_receipt_tax_lines_receipt ON books_sales_receipt_tax_lines (sales_receipt, position)',
                    'CREATE INDEX idx_books_sales_receipt_tax_lines_component ON books_sales_receipt_tax_lines (component)',
                ],
            })
        )

        const settings = app.findCollectionByNameOrId('books_settings')
        settings.fields.add(
            new RelationField({
                name: 'sales_deposit_account',
                collectionId: accounts.id,
                cascadeDelete: false,
                maxSelect: 1,
            })
        )
        app.save(settings)

        // Books search over sales receipts, drafts included, as fts_books_invoices
        // (2100000010): server/search_index.go keeps each row in step with its
        // receipt. On a new database there are no receipts to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_sales_receipts USING fts5(record_id UNINDEXED, number, reference_no, memo, message, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_sales_receipts').execute()
        const settings = app.findCollectionByNameOrId('books_settings')
        settings.fields.removeByName('sales_deposit_account')
        app.save(settings)
        for (const name of [
            'books_sales_receipt_tax_lines',
            'books_sales_receipt_lines',
            'books_sales_receipts',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
