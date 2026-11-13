/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books bills: what a vendor bills the business, and its lines. A bill is the
// fourth kind of the document layer (2100000010, 2100000011, 2100000012) and
// the first purchase document: its party is a vendor, it has two line tables
// (account lines and product lines, one collection with a kind), no sales tax,
// no message and no email, and posting credits Accounts payable and debits the
// lines' accounts.
//
// AUTHORIZATION. The rules are the invoice's: every member with read access
// lists and views bills and their lines, a writer creates and edits drafts,
// moves a posted bill to void, and deletes drafts. The Go hooks in
// server/sales_documents.go and server/bills.go decide whether the write is
// valid: the vendor exists and is active when the write sets or changes it,
// both days are real days and the due date is not before the bill date, the
// vendor's bill no. is not on another non-void bill of the same vendor, a bill
// holds at most 250 lines, each line has its kind's cells and no other kind's,
// an account line's account is an expense, other expense or cost of goods sold
// account and its amount is not 0, a line's product is a Service or
// Non-inventory item and is active when the line sets or changes it, a line of
// a bill that is not a draft never changes, and the total is from 0 to 2^53-1
// cents.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`: the
// number and sequence (assigned at posting), the two totals, the currency, the
// journal entry, replaced_by, who and when, and sort_key on the bill. A line's
// amount is not pinned by the rules: an account line's amount is typed by the
// writer, and Go refuses an amount sent on a product line (Books computes
// quantity x rate there). Books recomputes the product line amounts and the
// bill's subtotal and total with server/document_totals.go at every line or
// header write of a draft.
//
// MONEY, DATES and SORT KEY are as on the invoice (2100000010). An account
// line's amount may be negative (a vendor discount or a return) but never 0;
// a product line's rate is 0 or more (a discount is a negative account line).
//
// mailing_address is the vendor's address copied onto the bill: null, or the
// address shape of 2100000004. ref_no is the number on the vendor's bill. form
// and fields are the core forms engine's host columns (books:bill).
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

const BILL_SERVER_FIELDS = [
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
                id: 'pbc_books_bills',
                name: 'books_bills',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...BILL_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...BILL_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    {
                        name: 'vendor',
                        type: 'relation',
                        required: true,
                        collectionId: vendors.id,
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
                    { name: 'mailing_address', type: 'json', maxSize: 8192 },
                    { name: 'ref_no', type: 'text', max: 40 },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'subtotal', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
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
        const bills = app.findCollectionByNameOrId('books_bills')
        for (const name of ['replaces', 'replaced_by']) {
            bills.fields.add(
                new RelationField({ name, collectionId: bills.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        bills.indexes = [
            'CREATE INDEX idx_books_bills_vendor ON books_bills (vendor, ref_no)',
            'CREATE INDEX idx_books_bills_status_date ON books_bills (status, date)',
            'CREATE INDEX idx_books_bills_form ON books_bills (form)',
        ]
        app.save(bills)

        app.save(
            new Collection({
                id: 'pbc_books_bill_lines',
                name: 'books_bill_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: `${WRITE} && ${unset('bill')} && bill.status = "draft"`,
                deleteRule: `${WRITE} && bill.status = "draft"`,
                fields: [
                    {
                        name: 'bill',
                        type: 'relation',
                        required: true,
                        collectionId: bills.id,
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
                    'CREATE INDEX idx_books_bill_lines_bill ON books_bill_lines (bill, position)',
                    'CREATE INDEX idx_books_bill_lines_account ON books_bill_lines (account)',
                    'CREATE INDEX idx_books_bill_lines_product ON books_bill_lines (product)',
                ],
            })
        )

        // Books search over bills, drafts included, as fts_books_invoices
        // (2100000010): one row per bill with its number, the vendor's bill no.
        // and the memo. It holds no vendor name, so a renamed vendor needs no
        // reindex of its bills. On a new database there are no bills to
        // backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_bills USING fts5(record_id UNINDEXED, number, ref_no, memo, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_bills').execute()
        for (const name of ['books_bill_lines', 'books_bills']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
