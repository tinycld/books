/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books credit memos: a credit a business gives a customer, its lines, and the
// tax lines the server writes when the memo posts. A credit memo is the mirror
// of an invoice: posting credits Accounts receivable and debits income and
// sales tax (server/credit_memos.go, server/sales_document_posting.go).
//
// AUTHORIZATION. As the invoice (2100000010): every member with read access
// lists and views credit memos and their lines, a writer creates and edits
// drafts, moves a posted memo to void, and deletes drafts. The Go hooks in
// server/sales_documents.go decide whether the write is valid, as for the
// invoice; server/credit_memos.go adds the date and the invoice link (the
// invoice exists, is posted, and is of the memo's customer).
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`, as on
// the invoice, and balance among them: the credit not yet applied, the total
// at posting and 0 on a draft or a void memo. Only Books writes it
// (server/document_balance.go). applied, the sum of the memo's applications,
// is server-written too.
//
// A credit memo has no terms, no due date and no estimate. invoice is the
// posted invoice the memo was made from (optional; a void of that invoice
// keeps the link, so it does not cascade).
//
// TAX LINES are the posting snapshot of the tax, as on the invoice, with every
// figure negated, so the Sales Tax Liability report lowers the rate's figures
// on the memo's date. gross_amount, taxable_amount and amount range from
// -2^53+1 to 2^53-1, as on the invoice: a figure is 0 or below for a memo whose
// sums are 0 or above, and above 0 where a sum is below 0 (a taxable Percent
// discount line can make the taxable sum and its tax negative).
//
// CASH BASIS. books_cash_basis_lines and books_cash_basis_tax_lines gain a
// credit_memo relation here, where books_credit_memos exists, for the
// cash-basis rows of a credit memo. A cash tax row names its invoice or its
// credit memo, so its invoice becomes optional; document is the id of either.
// The server writes all three.
//
// MONEY is integer minor units (onlyInt), at most 2^53-1. DATES are YYYY-MM-DD
// text, as on journal entries.
//
// The rule constants repeat 2100000010's: a migration cannot import another.
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

const CREDIT_MEMO_SERVER_FIELDS = [
    'number',
    'sequence',
    'subtotal',
    'tax_total',
    'total',
    'balance',
    'applied',
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
const relation = (name, collectionId, extra = {}) => ({
    name,
    type: 'relation',
    collectionId,
    cascadeDelete: false,
    maxSelect: 1,
    ...extra,
})
// A tax line figure of a credit memo, stored negated: -2^53+1 to 2^53-1, as the
// invoice tax line's amount. It is above 0 when the memo's taxable sum is below 0
// (a taxable Percent discount line).
const signedTaxAmount = name => ({
    name,
    type: 'number',
    onlyInt: true,
    min: -MAX_STORED,
    max: MAX_STORED,
})

const CASH_LINE_KINDS_BEFORE = ['bill', 'invoice']

migrate(
    app => {
        const forms = app.findCollectionByNameOrId('forms')
        const customers = app.findCollectionByNameOrId('books_customers')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const products = app.findCollectionByNameOrId('books_products')
        const rates = app.findCollectionByNameOrId('books_tax_rates')
        const agencies = app.findCollectionByNameOrId('books_tax_agencies')
        const invoices = app.findCollectionByNameOrId('books_invoices')

        app.save(
            new Collection({
                id: 'pbc_books_creditmemos',
                name: 'books_credit_memos',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...CREDIT_MEMO_SERVER_FIELDS, 'revision')}`,
                updateRule: `${WRITE} && ${unset(...CREDIT_MEMO_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    relation('customer', customers.id, { required: true }),
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
                    // The posted invoice the memo was made from (Q2).
                    relation('invoice', invoices.id),
                    { name: 'message', type: 'text', max: 4000 },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'subtotal', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'tax_total', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'balance', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    // The cents of the memo's applications to invoices
                    // (books_credit_memo_applications, 2100000029), so a list
                    // tells Applied from Refunded with no other read. Only
                    // Books writes it (server/credit_applications.go,
                    // server/credit_memos.go, server/document_balance.go).
                    { name: 'applied', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    // Counts the transactions that changed the draft or its lines. A
                    // save or a post states the value it saw (server/revision.go).
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
        const memos = app.findCollectionByNameOrId('books_credit_memos')
        for (const name of ['replaces', 'replaced_by']) {
            memos.fields.add(
                new RelationField({ name, collectionId: memos.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        memos.indexes = [
            'CREATE INDEX idx_books_credit_memos_customer ON books_credit_memos (customer)',
            'CREATE INDEX idx_books_credit_memos_status_date ON books_credit_memos (status, date)',
            'CREATE INDEX idx_books_credit_memos_tax_rate ON books_credit_memos (tax_rate)',
            'CREATE INDEX idx_books_credit_memos_invoice ON books_credit_memos (invoice)',
            'CREATE INDEX idx_books_credit_memos_form ON books_credit_memos (form)',
            // A customer's open credits (p2-apply-credit).
            'CREATE INDEX idx_books_credit_memos_customer_open ON books_credit_memos (customer, status, balance)',
        ]
        app.save(memos)

        app.save(
            new Collection({
                id: 'pbc_books_creditmemo_lines',
                name: 'books_credit_memo_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS, 'credit_memo')} && credit_memo.status = "draft"`,
                deleteRule: `${WRITE} && credit_memo.status = "draft"`,
                fields: [
                    relation('credit_memo', memos.id, { required: true, cascadeDelete: true }),
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
                    'CREATE INDEX idx_books_credit_memo_lines_memo ON books_credit_memo_lines (credit_memo, position)',
                    'CREATE INDEX idx_books_credit_memo_lines_product ON books_credit_memo_lines (product)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_creditmemo_tax',
                name: 'books_credit_memo_tax_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('credit_memo', memos.id, { required: true, cascadeDelete: true }),
                    // The memo's rate or group.
                    relation('rate', rates.id, { required: true }),
                    // The rate whose tax this row is: the rate itself, or one
                    // component of the group.
                    relation('component', rates.id, { required: true }),
                    relation('agency', agencies.id, { required: true }),
                    { name: 'rate_ppm', type: 'number', onlyInt: true, min: 0, max: 1000000 },
                    signedTaxAmount('gross_amount'),
                    signedTaxAmount('taxable_amount'),
                    signedTaxAmount('amount'),
                    { name: 'currency', type: 'text', pattern: OPTIONAL_CURRENCY },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    // The memo's date, written at posting, so a tax report
                    // filters the ledger and the cash-basis tax lines alike.
                    { name: 'date', type: 'text', max: 10, pattern: OPTIONAL_DAY },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_credit_memo_tax_lines_memo ON books_credit_memo_tax_lines (credit_memo, position)',
                    'CREATE INDEX idx_books_credit_memo_tax_lines_component ON books_credit_memo_tax_lines (component)',
                ],
            })
        )

        const cashLines = app.findCollectionByNameOrId('books_cash_basis_lines')
        cashLines.fields.getByName('document_kind').values = [...CASH_LINE_KINDS_BEFORE, 'credit_memo']
        cashLines.fields.add(
            new RelationField({
                name: 'credit_memo',
                collectionId: memos.id,
                cascadeDelete: true,
                maxSelect: 1,
            })
        )
        cashLines.indexes = [
            ...cashLines.indexes,
            'CREATE INDEX idx_books_cash_basis_lines_credit_memo ON books_cash_basis_lines (credit_memo)',
        ]
        app.save(cashLines)

        const cashTax = app.findCollectionByNameOrId('books_cash_basis_tax_lines')
        cashTax.fields.getByName('invoice').required = false
        cashTax.fields.add(
            new RelationField({
                name: 'credit_memo',
                collectionId: memos.id,
                cascadeDelete: true,
                maxSelect: 1,
            })
        )
        // The id of the row's invoice or credit memo; server-written.
        cashTax.fields.add(new TextField({ name: 'document', max: 15 }))
        cashTax.indexes = [
            ...cashTax.indexes,
            'CREATE INDEX idx_books_cash_basis_tax_lines_credit_memo ON books_cash_basis_tax_lines (credit_memo)',
        ]
        app.save(cashTax)

        // Books search over credit memos, drafts included, as fts_books_invoices
        // (2100000010). The server writes its rows. On a new database there are
        // no credit memos to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_credit_memos USING fts5(record_id UNINDEXED, number, memo, message, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_credit_memos').execute()

        const cashTax = app.findCollectionByNameOrId('books_cash_basis_tax_lines')
        cashTax.indexes = cashTax.indexes.filter(index => !index.includes('_credit_memo '))
        for (const field of ['credit_memo', 'document']) cashTax.fields.removeByName(field)
        cashTax.fields.getByName('invoice').required = true
        app.save(cashTax)

        const cashLines = app.findCollectionByNameOrId('books_cash_basis_lines')
        cashLines.indexes = cashLines.indexes.filter(index => !index.includes('_credit_memo '))
        cashLines.fields.removeByName('credit_memo')
        cashLines.fields.getByName('document_kind').values = CASH_LINE_KINDS_BEFORE
        app.save(cashLines)

        for (const name of [
            'books_credit_memo_tax_lines',
            'books_credit_memo_lines',
            'books_credit_memos',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
