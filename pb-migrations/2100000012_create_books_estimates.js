/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books estimates: a quote for a customer and its lines, and the invoice's link
// to the estimate it was made from. An estimate is the third sales document
// kind (2100000010, 2100000011) with the quote lifecycle: it is pending,
// accepted or rejected while the customer decides, and closed once an invoice
// is made from it. It never posts, so it has no journal entry, no posting
// stamps and no tax lines: the server keeps tax_total live, as on a draft
// invoice.
//
// AUTHORIZATION. Every member with read access lists and views estimates and
// their lines; a writer creates, edits and deletes an estimate that is not
// closed. Only Books closes an estimate (the invoice guards in Go, which save
// as the app and skip these rules), so a create or update that sends "closed"
// is refused here, and a closed estimate and its lines never change through
// the API. The Go hooks in server/sales_documents.go and server/estimates.go
// decide whether the write is valid: the customer and the tax rate exist and
// are active when the write sets or changes them, the days are real days and
// the expiration date is not before the estimate date, an accepted estimate
// has an accepted date, an estimate holds at most 250 lines, each line has its
// kind's cells and no other kind's, and the total is from 0 to 2^53-1 cents.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`: the
// number and sequence (assigned when the estimate is created), the three
// totals, the currency, the invoice made from it and sort_key on the estimate;
// amount on a line.
//
// ACCEPTANCE. accepted_by and accepted_date describe who accepted the estimate
// and when. Books clears them when the status moves to pending or rejected,
// and keeps them on a closed estimate (undoing a conversion reads the accepted
// date to choose between accepted and pending).
//
// MONEY, DATES, SORT KEY, bill_to, form and fields are as on the invoice
// (2100000010); form and fields are the forms engine's host columns
// (books:estimate). expiration_date and accepted_date are optional days.
//
// books_invoices.estimate names the estimate an invoice was made from. It is
// added here because 2100000010 runs before estimates exist; it does not
// cascade, so an estimate an invoice names is not deleted with the invoice.
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

const ESTIMATE_SERVER_FIELDS = [
    'number',
    'sequence',
    'subtotal',
    'tax_total',
    'total',
    'currency',
    'invoice',
    'sort_key',
]
const LINE_SERVER_FIELDS = ['amount']

const AUTODATES = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]

migrate(
    app => {
        const forms = app.findCollectionByNameOrId('forms')
        const customers = app.findCollectionByNameOrId('books_customers')
        const invoices = app.findCollectionByNameOrId('books_invoices')
        const products = app.findCollectionByNameOrId('books_products')
        const rates = app.findCollectionByNameOrId('books_tax_rates')

        app.save(
            new Collection({
                id: 'pbc_books_estimates',
                name: 'books_estimates',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status != "closed" && ${unset(...ESTIMATE_SERVER_FIELDS, 'revision')}`,
                updateRule: `${WRITE} && ${unset(...ESTIMATE_SERVER_FIELDS)} && status != "closed" && @request.body.status != "closed"`,
                deleteRule: `${WRITE} && status != "closed"`,
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
                        values: ['pending', 'accepted', 'rejected', 'closed'],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'expiration_date', type: 'text', max: 10, pattern: OPTIONAL_DAY },
                    { name: 'accepted_by', type: 'text', max: 200 },
                    { name: 'accepted_date', type: 'text', max: 10, pattern: OPTIONAL_DAY },
                    { name: 'bill_to', type: 'json', maxSize: 8192 },
                    { name: 'email', type: 'email' },
                    {
                        name: 'tax_rate',
                        type: 'relation',
                        collectionId: rates.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'message', type: 'text', max: 4000 },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'subtotal', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'tax_total', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    // As on the invoice (2100000010). An estimate has no draft: a
                    // request that updates one that is not closed states the value.
                    { name: 'revision', type: 'number', onlyInt: true, min: 0 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    {
                        name: 'invoice',
                        type: 'relation',
                        collectionId: invoices.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
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
                indexes: [
                    'CREATE INDEX idx_books_estimates_customer ON books_estimates (customer)',
                    'CREATE INDEX idx_books_estimates_status_date ON books_estimates (status, date)',
                    'CREATE INDEX idx_books_estimates_tax_rate ON books_estimates (tax_rate)',
                    'CREATE INDEX idx_books_estimates_invoice ON books_estimates (invoice)',
                    'CREATE INDEX idx_books_estimates_form ON books_estimates (form)',
                ],
            })
        )
        const estimates = app.findCollectionByNameOrId('books_estimates')

        app.save(
            new Collection({
                id: 'pbc_books_estimate_lines',
                name: 'books_estimate_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS)} && @request.body.estimate.status != "closed"`,
                updateRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS, 'estimate')} && estimate.status != "closed"`,
                deleteRule: `${WRITE} && estimate.status != "closed"`,
                fields: [
                    {
                        name: 'estimate',
                        type: 'relation',
                        required: true,
                        collectionId: estimates.id,
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
                    'CREATE INDEX idx_books_estimate_lines_estimate ON books_estimate_lines (estimate, position)',
                    'CREATE INDEX idx_books_estimate_lines_product ON books_estimate_lines (product)',
                ],
            })
        )

        invoices.fields.add(
            new RelationField({
                name: 'estimate',
                collectionId: estimates.id,
                cascadeDelete: false,
                maxSelect: 1,
            })
        )
        invoices.indexes = [
            ...invoices.indexes,
            'CREATE INDEX idx_books_invoices_estimate ON books_invoices (estimate)',
        ]
        app.save(invoices)

        // Books search over estimates, as fts_books_invoices (2100000010):
        // server/search_index.go keeps each row in step with its estimate. On a
        // new database there are no estimates to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_estimates USING fts5(record_id UNINDEXED, number, memo, message, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_estimates').execute()
        const invoices = app.findCollectionByNameOrId('books_invoices')
        invoices.fields.removeByName('estimate')
        invoices.indexes = invoices.indexes.filter(index => !index.includes('idx_books_invoices_estimate'))
        app.save(invoices)
        for (const name of ['books_estimate_lines', 'books_estimates']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
