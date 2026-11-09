/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books invoices: what a business bills a customer, its lines, and the tax
// lines the server writes when the invoice posts.
//
// AUTHORIZATION. The rules decide who may act, by Books level (books_access,
// 2100000000): every member with read access lists and views invoices and
// their lines, a writer creates and edits drafts, moves a posted invoice to
// void, and deletes drafts. The Go hooks in server/invoices.go decide whether
// the write is valid: the customer and the tax rate exist and are active when
// the write sets or changes them, both days are real days and the due date is
// not before the invoice date, an invoice holds at most 250 lines, each line
// has its kind's cells and no other kind's, a percent line sits right under an
// item or a subtotal, a line's product is a Service or Non-inventory item and
// is active when the line sets or changes it, a line of an invoice that is not
// a draft never changes, and the total is from 0 to 2^53-1 cents. A rule
// cannot read an invoice's lines or count anything, which is why those live in
// Go.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`: the
// number and sequence (assigned at posting), the three totals, the currency,
// the journal entry, replaced_by, who and when, and sort_key on the invoice;
// amount on a line. Books recomputes every line amount and the invoice's
// subtotal, tax_total and total with server/document_totals.go at every line
// or header write of a draft, so the client never sends them.
//
// MONEY is integer minor units (onlyInt). rate is the line's price in cents
// and may be 0 or negative; percent_ppm is a percent line's percent in parts
// per million of the line above (-10% = -100 000), from -100% to +1000%.
// quantity has at most 2 decimals (Books rounds it to hundredths). A line
// amount is at most 10^15 cents and the total at most 2^53-1, the largest
// integer a number field (float64) stores exactly.
//
// DATES are YYYY-MM-DD text, as on journal entries: an accounting date is a
// calendar day with no time zone.
//
// SORT KEY. sort_key is the invoice date, then the number padded, then the id
// (server/invoices.go). Only the Go guard sets it, on every create and update;
// it is hidden, so a non-superuser never sees it in an API response.
//
// TAX LINES are the posting snapshot of the tax (the tax-rates contract): one
// row per component of the invoice's rate or group, with the agency, the rate,
// the taxable amount and the tax. Only Books writes them, so clients only read
// them.
//
// bill_to is the customer's billing address copied onto the invoice: null, or
// the address shape of 2100000003 (Go refuses any other key). form and fields
// are the core forms engine's host columns (books:invoice).
//
// The rule constants repeat 2100000004's: a migration cannot import another.
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

const INVOICE_SERVER_FIELDS = [
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
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const products = app.findCollectionByNameOrId('books_products')
        const rates = app.findCollectionByNameOrId('books_tax_rates')
        const agencies = app.findCollectionByNameOrId('books_tax_agencies')

        app.save(
            new Collection({
                id: 'pbc_books_invoices',
                name: 'books_invoices',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...INVOICE_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...INVOICE_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
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
                    { name: 'due_date', type: 'text', required: true, max: 10, pattern: DAY },
                    // PAYMENT_TERM_KEYS (tinycld/books/lib/payment-terms.ts); empty is none.
                    {
                        name: 'terms',
                        type: 'select',
                        maxSelect: 1,
                        values: ['due_on_receipt', 'net_10', 'net_15', 'net_30', 'net_60'],
                    },
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
        const invoices = app.findCollectionByNameOrId('books_invoices')
        for (const name of ['replaces', 'replaced_by']) {
            invoices.fields.add(
                new RelationField({ name, collectionId: invoices.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        invoices.indexes = [
            'CREATE INDEX idx_books_invoices_customer ON books_invoices (customer)',
            'CREATE INDEX idx_books_invoices_status_date ON books_invoices (status, date)',
            'CREATE INDEX idx_books_invoices_tax_rate ON books_invoices (tax_rate)',
            'CREATE INDEX idx_books_invoices_form ON books_invoices (form)',
        ]
        app.save(invoices)

        app.save(
            new Collection({
                id: 'pbc_books_invoice_lines',
                name: 'books_invoice_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS, 'invoice')} && invoice.status = "draft"`,
                deleteRule: `${WRITE} && invoice.status = "draft"`,
                fields: [
                    {
                        name: 'invoice',
                        type: 'relation',
                        required: true,
                        collectionId: invoices.id,
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
                    'CREATE INDEX idx_books_invoice_lines_invoice ON books_invoice_lines (invoice, position)',
                    'CREATE INDEX idx_books_invoice_lines_product ON books_invoice_lines (product)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_invoice_tax',
                name: 'books_invoice_tax_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    {
                        name: 'invoice',
                        type: 'relation',
                        required: true,
                        collectionId: invoices.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    // The invoice's rate or group.
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
                    'CREATE INDEX idx_books_invoice_tax_lines_invoice ON books_invoice_tax_lines (invoice, position)',
                    'CREATE INDEX idx_books_invoice_tax_lines_component ON books_invoice_tax_lines (component)',
                ],
            })
        )

        // Books search over invoices, drafts included (as 2100000006 does for
        // the other sources): server/search_index.go keeps each row in step
        // with its invoice. The customer's name is matched through
        // fts_books_customers (server/search.go), so a renamed customer needs
        // no reindex of its invoices. On a new database there are no invoices
        // to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_invoices USING fts5(record_id UNINDEXED, number, memo, message, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_invoices').execute()
        for (const name of ['books_invoice_tax_lines', 'books_invoice_lines', 'books_invoices']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
