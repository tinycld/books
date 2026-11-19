/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books refund receipts: money a business pays back to a customer, its lines,
// the tax lines the server writes when a plain refund posts, the credits row a
// payout writes, and the sale-lines view the sales reports read. A refund
// receipt is the sales receipt's mirror (2100000011): the same columns with
// refund_from in place of deposit_to, and an optional source link.
//
// AUTHORIZATION. The rules are the sales receipt's: every member with read
// access lists and views refunds and their lines, a writer creates and edits
// drafts, moves a posted refund to void, and deletes drafts. The Go hooks in
// server/sales_documents.go and server/refund_receipts.go decide whether the
// write is valid: the date is a real day, refund_from is an active bank or
// Undeposited funds account, at most one source is set, and the source is a
// posted document of the refund's customer.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`, as on
// the sales receipt.
//
// SOURCE. sales_receipt is the posted sales receipt the refund was made from;
// credit_memo is the posted credit memo a payout pays out. Each is optional,
// at most one is set, and neither cascades: a void of the source keeps the
// link.
//
// TAX LINES are the posting snapshot of a plain refund's tax, as on the credit
// memo (2100000022), with every figure negated, so the Sales Tax Liability
// report lowers the rate's figures on the refund's date. gross_amount,
// taxable_amount and amount range from -2^53+1 to 0. A payout writes no tax
// line: its credit memo lowered the tax already.
//
// CREDITS. books_refund_receipt_credits is the payer row of a payout: one row
// per posted payout, amount the payout's total, naming the credit memo whose
// balance it lowers (server/document_balance.go). position is always 0; the
// balance code reads a payer's rows by position. Only the server writes it.
//
// SALE LINES. books_refund_receipt_sale_lines is the lines of the refunds that
// pay out no credit memo: the sales reports' part, so a payout's lines (the
// credit memo's lines counted already) never reach them. It is one SELECT
// with a join: PocketBase's view parser refuses UNION.
//
// MONEY is integer minor units (onlyInt), at most 2^53-1. DATES are YYYY-MM-DD
// text, as on journal entries.
//
// The rule constants repeat 2100000011's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const OPTIONAL_DAY = '^(\\d{4}-\\d{2}-\\d{2})?$'
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'
// 2^53-1: the largest whole number of cents a number field stores exactly.
const MAX_STORED = 9007199254740991
// The largest line amount, as on journal lines.
const MAX_AMOUNT = 1000000000000000

const REFUND_SERVER_FIELDS = [
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

// The line columns after the parent relation, in the order the view lists them.
const LINE_COLUMNS = [
    'refund_receipt',
    'kind',
    'product',
    'description',
    'quantity',
    'rate',
    'percent_ppm',
    'amount',
    'taxable',
    'position',
    'created',
    'updated',
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
// A tax line figure of a refund receipt, stored negated: -2^53+1 to 0.
const negatedTaxAmount = name => ({
    name,
    type: 'number',
    onlyInt: true,
    min: -MAX_STORED,
    max: 0,
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
        const salesReceipts = app.findCollectionByNameOrId('books_sales_receipts')
        const creditMemos = app.findCollectionByNameOrId('books_credit_memos')

        app.save(
            new Collection({
                id: 'pbc_books_refundrc',
                name: 'books_refund_receipts',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...REFUND_SERVER_FIELDS, 'revision')}`,
                updateRule: `${WRITE} && ${unset(...REFUND_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    // Optional: a walk-in refund names no customer.
                    relation('customer', customers.id),
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
                    relation('tax_rate', rates.id),
                    // PAYMENT_METHODS keys (tinycld/books/lib/payment-methods.ts); empty is none.
                    {
                        name: 'payment_method',
                        type: 'select',
                        maxSelect: 1,
                        values: ['cash', 'check', 'credit_card', 'debit_card', 'bank_transfer', 'other'],
                    },
                    { name: 'reference_no', type: 'text', max: 40 },
                    // The account the money left; the posting credits it.
                    relation('refund_from', accounts.id, { required: true }),
                    // The posted sales receipt the refund was made from.
                    relation('sales_receipt', salesReceipts.id),
                    // The posted credit memo a payout pays out.
                    relation('credit_memo', creditMemos.id),
                    { name: 'message', type: 'text', max: 4000 },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'subtotal', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'tax_total', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    // As on the invoice (2100000010): the count a save or a post states.
                    { name: 'revision', type: 'number', onlyInt: true, min: 0 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    relation('entry', entries.id),
                    { name: 'posted_at', type: 'date' },
                    userRef('posted_by'),
                    { name: 'voided_at', type: 'date' },
                    userRef('voided_by'),
                    relation('form', forms.id),
                    { name: 'fields', type: 'json', maxSize: 1000000 },
                    { name: 'sort_key', type: 'text', hidden: true, max: 200 },
                    ...AUTODATES,
                ],
            })
        )

        // The self-relations need the collection to exist first.
        const refunds = app.findCollectionByNameOrId('books_refund_receipts')
        for (const name of ['replaces', 'replaced_by']) {
            refunds.fields.add(
                new RelationField({ name, collectionId: refunds.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        refunds.indexes = [
            'CREATE INDEX idx_books_refund_receipts_customer ON books_refund_receipts (customer)',
            'CREATE INDEX idx_books_refund_receipts_status_date ON books_refund_receipts (status, date)',
            'CREATE INDEX idx_books_refund_receipts_tax_rate ON books_refund_receipts (tax_rate)',
            'CREATE INDEX idx_books_refund_receipts_refund_from ON books_refund_receipts (refund_from)',
            'CREATE INDEX idx_books_refund_receipts_sales_receipt ON books_refund_receipts (sales_receipt)',
            'CREATE INDEX idx_books_refund_receipts_credit_memo ON books_refund_receipts (credit_memo)',
            'CREATE INDEX idx_books_refund_receipts_form ON books_refund_receipts (form)',
        ]
        app.save(refunds)

        app.save(
            new Collection({
                id: 'pbc_books_refundrc_lines',
                name: 'books_refund_receipt_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS, 'refund_receipt')} && refund_receipt.status = "draft"`,
                deleteRule: `${WRITE} && refund_receipt.status = "draft"`,
                fields: [
                    relation('refund_receipt', refunds.id, { required: true, cascadeDelete: true }),
                    {
                        name: 'kind',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['item', 'description', 'subtotal', 'percent'],
                    },
                    relation('product', products.id),
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
                    'CREATE INDEX idx_books_refund_receipt_lines_refund ON books_refund_receipt_lines (refund_receipt, position)',
                    'CREATE INDEX idx_books_refund_receipt_lines_product ON books_refund_receipt_lines (product)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_refundrc_tax',
                name: 'books_refund_receipt_tax_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('refund_receipt', refunds.id, { required: true, cascadeDelete: true }),
                    // The refund's rate or group.
                    relation('rate', rates.id, { required: true }),
                    // The rate whose tax this row is: the rate itself, or one
                    // component of the group.
                    relation('component', rates.id, { required: true }),
                    relation('agency', agencies.id, { required: true }),
                    { name: 'rate_ppm', type: 'number', onlyInt: true, min: 0, max: 1000000 },
                    negatedTaxAmount('gross_amount'),
                    negatedTaxAmount('taxable_amount'),
                    negatedTaxAmount('amount'),
                    { name: 'currency', type: 'text', pattern: OPTIONAL_CURRENCY },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    // The refund's date, written at posting, so a tax report
                    // filters the ledger and the cash-basis tax lines alike.
                    { name: 'date', type: 'text', max: 10, pattern: OPTIONAL_DAY },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_refund_receipt_tax_lines_refund ON books_refund_receipt_tax_lines (refund_receipt, position)',
                    'CREATE INDEX idx_books_refund_receipt_tax_lines_component ON books_refund_receipt_tax_lines (component)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_refundrc_credit',
                name: 'books_refund_receipt_credits',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('refund_receipt', refunds.id, { required: true, cascadeDelete: true }),
                    relation('credit_memo', creditMemos.id, { required: true }),
                    { name: 'amount', type: 'number', onlyInt: true, min: 1, max: MAX_STORED },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_refund_receipt_credits_refund ON books_refund_receipt_credits (refund_receipt)',
                    'CREATE INDEX idx_books_refund_receipt_credits_memo ON books_refund_receipt_credits (credit_memo)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_refundrc_sales',
                name: 'books_refund_receipt_sale_lines',
                type: 'view',
                listRule: READ,
                viewRule: READ,
                viewQuery: [
                    `SELECT l.id, ${LINE_COLUMNS.map(column => `l.${column}`).join(', ')}`,
                    'FROM books_refund_receipt_lines l',
                    'JOIN books_refund_receipts r ON r.id = l.refund_receipt',
                    "WHERE r.credit_memo = ''",
                ].join(' '),
            })
        )

        // Books search over refund receipts, drafts included, as
        // fts_books_sales_receipts (2100000011). The server writes its rows. On a
        // new database there are no refunds to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_refund_receipts USING fts5(record_id UNINDEXED, number, reference_no, memo, message, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_refund_receipts').execute()
        for (const name of [
            'books_refund_receipt_sale_lines',
            'books_refund_receipt_credits',
            'books_refund_receipt_tax_lines',
            'books_refund_receipt_lines',
            'books_refund_receipts',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
