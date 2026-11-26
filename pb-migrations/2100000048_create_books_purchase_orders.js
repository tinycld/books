/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books purchase orders (purchase order spec §4): what the business orders from
// a vendor, and its lines. A purchase order is a kind of the document layer
// with the order lifecycle: it is open or closed, it has no draft and it never
// posts, so it has no journal entry and no posting stamps. Its lines are the
// bill's two tables (account lines and product lines, one collection with a
// kind), and a bill made from it names the order (books_bills.purchase_order)
// and each order line it takes (books_bill_lines.po_line).
//
// AUTHORIZATION. Every member with read access lists and views orders and their
// lines; a writer creates an open order, edits it and deletes it. Only a Books
// admin changes the status (Close and Reopen): the update rule lets a writer
// send no status or the stored one. The Go hooks in server/purchase_orders.go
// and server/sales_documents.go decide whether the write is valid: the vendor,
// accounts and products exist and are active when the write sets or changes
// them, the day is a real day, an order holds at most 250 lines, each line has
// its kind's cells, the total is from 0 to 2^53-1 cents, a closed order and its
// lines never change, an order that bills name keeps its vendor and the lines
// those bills name, and an order that bills name is not deleted.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`: the
// number and sequence (assigned at the first save), the two totals, the open
// amount, the currency, closed_reason, closed_by and closed_at (set at Close
// and cleared at Reopen, or set when every line is received), created_by and
// sort_key on the order; received, billed, open_quantity and open_amount on a
// line. Only server/purchase_order_receipts.go writes the open values, the
// order's open amount and status from its bills, and
// books_products.quantity_on_po. A line's amount is not pinned: an account
// line's amount is typed by the writer, and Go computes quantity x rate on a
// product line, as on the bill (2100000013).
//
// OPEN VALUES. open_quantity = max(quantity − received, 0) on a product line (0
// on an account line). open_amount = round(open_quantity × rate) on a product
// line and max(amount − billed, 0) on an account line. The order's open_amount
// is the sum of its lines' while it is open and 0 while it is closed; the lines
// of a closed order keep their open values as history.
//
// REVISION is as on the bill (2100000013): Books sets it to 1 on create (the
// create rule pins it) and increases it in Go; a request that updates an order
// states the revision it saw (server/revision.go).
//
// MONEY, DATES, SORT KEY, form and fields are as on the bill (2100000013); form
// and fields are the forms engine's host columns (books:purchase_order).
// mailing_address is the vendor's address copied onto the order: null, or the
// address shape of 2100000004. ship_to is free text of at most 5 lines (the
// client's rule).
//
// books_products.quantity_on_po is the sum of open_quantity of the product's
// lines on open orders. The product guard keeps the stored value whatever a
// request sends, as it keeps quantity_on_hand (2100000038).
//
// SHIPPED MIGRATIONS. Books v0.0.1 shipped 2100000001, 2100000034 and
// 2100000043, so they stay as released and this migration changes what they
// made. It declares books_doc_sequences.doc_type and books_document_sends.doc_type
// again (fields.add replaces a field by name and keeps its id) with the shipped
// values and purchase_order, and seeds the order's sequence row
// (booksseqpurchor: no prefix, next 1001); an order takes its number at its
// first save because it never posts. It adds the optional vendor relation of
// books_document_sends: a purchase order's send names its vendor and leaves
// customer empty, so a send names at most one of the two, and deleting the
// vendor deletes its sends, as deleting the customer does. It rebuilds the
// books_audit_log view's query of 2100000043 with the order lines (a line row
// names its order, as server/audit.go auditParentFields says) and the
// purchase order sends (SEND_PARENTS); the query is built as there.
//
// The rule constants repeat 2100000013's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const IS_ADMIN = '@collection.books_access:me.is_admin ?= true'
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'
// 2^53-1: the largest whole number of cents a number field stores exactly.
const MAX_STORED = 9007199254740991
// The largest line amount, as on journal lines.
const MAX_AMOUNT = 1000000000000000
const MAX_QUANTITY = 1000000

const ORDER_SERVER_FIELDS = [
    'number',
    'sequence',
    'subtotal',
    'total',
    'open_amount',
    'currency',
    'closed_reason',
    'closed_by',
    'closed_at',
    'created_by',
    'sort_key',
]
const LINE_SERVER_FIELDS = ['received', 'billed', 'open_quantity', 'open_amount']

// A writer sends no status or the stored one; a Books admin may change it.
const STATUS_KEPT_OR_ADMIN = `(@request.body.status:isset = false || @request.body.status = status || ${IS_ADMIN})`

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

const SEQUENCE_INDEX = 'idx_books_purchase_orders_sequence'

// The audit view of 2100000043, with the order lines added to its line
// collections and the purchase order to its send parents. Each line
// collection, its document's collection and the line field that names the
// document; an empty document collection is a send's, which SEND_PARENTS
// gives by the row's doc_type.
const LINES = [
    ['books_bill_lines', 'books_bills', 'bill'],
    ['books_bill_payment_lines', 'books_bill_payments', 'payment'],
    ['books_bundle_items', 'books_products', 'bundle'],
    ['books_credit_memo_applications', 'books_credit_memos', 'credit_memo'],
    ['books_credit_memo_lines', 'books_credit_memos', 'credit_memo'],
    ['books_deposit_items', 'books_deposits', 'deposit'],
    ['books_deposit_lines', 'books_deposits', 'deposit'],
    ['books_document_sends', '', 'document'],
    ['books_estimate_lines', 'books_estimates', 'estimate'],
    ['books_estimate_responses', 'books_estimates', 'estimate'],
    ['books_expense_lines', 'books_expenses', 'expense'],
    ['books_inventory_adjustment_lines', 'books_inventory_adjustments', 'adjustment'],
    ['books_invoice_lines', 'books_invoices', 'invoice'],
    ['books_journal_lines', 'books_journal_entries', 'entry'],
    ['books_payment_applications', 'books_payments', 'payment'],
    ['books_purchase_order_lines', 'books_purchase_orders', 'purchase_order'],
    ['books_refund_receipt_lines', 'books_refund_receipts', 'refund_receipt'],
    ['books_sales_receipt_lines', 'books_sales_receipts', 'sales_receipt'],
    ['books_vendor_credit_applications', 'books_vendor_credits', 'vendor_credit'],
    ['books_vendor_credit_lines', 'books_vendor_credits', 'vendor_credit'],
    ['books_vendor_refund_lines', 'books_vendor_refunds', 'refund'],
]

// A send's doc_type and the collection of the document it names.
const SEND_PARENTS = [
    ['invoice', 'books_invoices'],
    ['estimate', 'books_estimates'],
    ['sales_receipt', 'books_sales_receipts'],
    ['credit_memo', 'books_credit_memos'],
    ['refund_receipt', 'books_refund_receipts'],
    ['purchase_order', 'books_purchase_orders'],
]

// The lists of 2100000043, for the down step.
const SHIPPED_LINES = LINES.filter(([lines]) => lines !== 'books_purchase_order_lines')
const SHIPPED_SEND_PARENTS = SEND_PARENTS.filter(([docType]) => docType !== 'purchase_order')

const CHANGES = 'CASE WHEN json_valid(a.changes) THEN a.changes END'
const SNAPSHOT = 'CASE WHEN json_valid(a.snapshot) THEN a.snapshot END'
const STATUS_AFTER = `json_extract(${CHANGES}, '$.status.after')`
const ACTOR_BLANK = "a.actor = '' OR a.actor IS NULL"
const EVENT = `CASE WHEN a.action = 'created' THEN 'added' WHEN a.action = 'deleted' THEN 'deleted' WHEN ${STATUS_AFTER} = 'posted' THEN 'posted' WHEN ${STATUS_AFTER} = 'void' THEN 'voided' ELSE 'changed' END`
const APPLICATIONS = "a.resource_type = 'books_credit_memo_applications'"
const EVENT_SHOWN = `CASE WHEN ${APPLICATIONS} AND a.action = 'created' THEN 'credit_applied' WHEN ${APPLICATIONS} AND a.action = 'deleted' THEN 'credit_removed' ELSE ${EVENT} END`

// The audit view's query over these line collections and send parents, as
// 2100000043 builds it.
function auditQuery(lines, sendParents) {
    const sendParentType = table =>
        `CASE COALESCE((SELECT doc_type FROM ${table} WHERE id = a.resource_id), json_extract(${SNAPSHOT}, '$.doc_type'), '') ${sendParents.map(([docType, parent]) => `WHEN '${docType}' THEN '${parent}'`).join(' ')} ELSE '' END`
    const parentTypeOf = (table, parent) => (parent === '' ? sendParentType(table) : `'${parent}'`)
    const parentType = `CASE a.resource_type ${lines.map(([table, parent]) => `WHEN '${table}' THEN ${parentTypeOf(table, parent)}`).join(' ')} ELSE '' END`
    const parentId = `CASE a.resource_type ${lines
        .map(
            ([table, , field]) =>
                `WHEN '${table}' THEN COALESCE((SELECT ${field} FROM ${table} WHERE id = a.resource_id), json_extract(${SNAPSHOT}, '$.${field}'), '')`
        )
        .join(' ')} ELSE '' END`
    return [
        'SELECT',
        'a.id AS id,',
        'a.created AS created,',
        `CAST(CASE WHEN ${ACTOR_BLANK} THEN 'system' ELSE a.actor END AS TEXT) AS actor,`,
        `CAST(CASE WHEN ${ACTOR_BLANK} THEN 'System' ELSE COALESCE(u.name, 'Unknown user') END AS TEXT) AS actor_name,`,
        `CAST(${EVENT} AS TEXT) AS event,`,
        `CAST(${EVENT_SHOWN} AS TEXT) AS event_shown,`,
        'a.resource_type AS record_type,',
        'a.resource_id AS record_id,',
        'a.resource_label AS record_label,',
        'a.changes AS changes,',
        'a.snapshot AS snapshot,',
        `CAST(${parentType} AS TEXT) AS parent_type,`,
        `CAST(${parentId} AS TEXT) AS parent_id,`,
        `CAST(CASE WHEN (${parentId}) != '' THEN (${parentType}) ELSE a.resource_type END AS TEXT) AS history_type,`,
        `CAST(CASE WHEN (${parentId}) != '' THEN (${parentId}) ELSE a.resource_id END AS TEXT) AS history_id`,
        'FROM audit_logs a LEFT JOIN users u ON u.id = a.actor',
        "WHERE a.resource_type >= 'books_' AND a.resource_type < 'books`'",
    ].join(' ')
}

// The purchase_order value a field of a shipped migration did not have.
const withoutPurchaseOrder = field => {
    field.values = field.values.filter(value => value !== 'purchase_order')
}

migrate(
    app => {
        const forms = app.findCollectionByNameOrId('forms')
        const vendors = app.findCollectionByNameOrId('books_vendors')
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const products = app.findCollectionByNameOrId('books_products')

        app.save(
            new Collection({
                id: 'pbc_books_purch_ord',
                name: 'books_purchase_orders',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "open" && ${unset(...ORDER_SERVER_FIELDS, 'revision')}`,
                updateRule: `${WRITE} && ${unset(...ORDER_SERVER_FIELDS)} && ${STATUS_KEPT_OR_ADMIN}`,
                deleteRule: WRITE,
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
                        values: ['open', 'closed'],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'mailing_address', type: 'json', maxSize: 8192 },
                    { name: 'email', type: 'text', max: 200 },
                    { name: 'ship_to', type: 'text', max: 500 },
                    { name: 'message', type: 'text', max: 4000 },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'subtotal', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'total', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'open_amount', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    {
                        name: 'closed_reason',
                        type: 'select',
                        maxSelect: 1,
                        values: ['manual', 'received'],
                    },
                    userRef('closed_by'),
                    { name: 'closed_at', type: 'date' },
                    userRef('created_by'),
                    // Counts the transactions that changed the order or its lines. A
                    // save states the value it saw (server/revision.go).
                    { name: 'revision', type: 'number', onlyInt: true, min: 0 },
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
                    'CREATE INDEX idx_books_purchase_orders_vendor ON books_purchase_orders (vendor, status)',
                    'CREATE INDEX idx_books_purchase_orders_status_date ON books_purchase_orders (status, date)',
                    'CREATE INDEX idx_books_purchase_orders_form ON books_purchase_orders (form)',
                    'CREATE INDEX idx_books_purchase_orders_closed_by ON books_purchase_orders (closed_by)',
                    'CREATE INDEX idx_books_purchase_orders_created_by ON books_purchase_orders (created_by)',
                    // As 2100000044: the route reads an order by its sequence.
                    `CREATE INDEX ${SEQUENCE_INDEX} ON books_purchase_orders (sequence) WHERE sequence > 0`,
                ],
            })
        )
        const orders = app.findCollectionByNameOrId('books_purchase_orders')

        app.save(
            new Collection({
                id: 'pbc_books_purch_lns',
                name: 'books_purchase_order_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS)} && @request.body.purchase_order.status = "open"`,
                updateRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS, 'purchase_order')} && purchase_order.status = "open"`,
                deleteRule: `${WRITE} && purchase_order.status = "open"`,
                fields: [
                    {
                        name: 'purchase_order',
                        type: 'relation',
                        required: true,
                        collectionId: orders.id,
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
                    { name: 'quantity', type: 'number', min: 0.01, max: MAX_QUANTITY },
                    { name: 'rate', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'amount', type: 'number', onlyInt: true, min: -MAX_AMOUNT, max: MAX_AMOUNT },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    // The quantity on posted bills that name the line; may pass the
                    // ordered quantity (a bill may take more than is open).
                    { name: 'received', type: 'number', min: 0 },
                    // The amount on posted bills that name the line.
                    { name: 'billed', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'open_quantity', type: 'number', min: 0, max: MAX_QUANTITY },
                    { name: 'open_amount', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_purchase_order_lines_order ON books_purchase_order_lines (purchase_order, position)',
                    'CREATE INDEX idx_books_purchase_order_lines_account ON books_purchase_order_lines (account)',
                    'CREATE INDEX idx_books_purchase_order_lines_product ON books_purchase_order_lines (product)',
                ],
            })
        )
        const orderLines = app.findCollectionByNameOrId('books_purchase_order_lines')

        // The order a bill was made from, and the order line each of its lines
        // takes. Neither cascades: an order or a line a bill names is not deleted
        // (the Go delete guards refuse it).
        const bills = app.findCollectionByNameOrId('books_bills')
        bills.fields.add(
            new RelationField({ name: 'purchase_order', collectionId: orders.id, cascadeDelete: false, maxSelect: 1 })
        )
        bills.indexes = [
            ...bills.indexes,
            'CREATE INDEX idx_books_bills_purchase_order ON books_bills (purchase_order)',
        ]
        app.save(bills)

        const billLines = app.findCollectionByNameOrId('books_bill_lines')
        billLines.fields.add(
            new RelationField({ name: 'po_line', collectionId: orderLines.id, cascadeDelete: false, maxSelect: 1 })
        )
        billLines.indexes = [
            ...billLines.indexes,
            'CREATE INDEX idx_books_bill_lines_po_line ON books_bill_lines (po_line)',
        ]
        app.save(billLines)

        products.fields.add(new NumberField({ name: 'quantity_on_po' }))
        app.save(products)

        // Books search over purchase orders, as fts_books_estimates (2100000012):
        // server/search_index.go keeps each row in step with its order. It holds no
        // vendor name, so a renamed vendor needs no reindex of its orders. On a
        // new database there are no orders to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_purchase_orders USING fts5(record_id UNINDEXED, number, memo, message, tokenize='porter unicode61')"
            )
            .execute()

        // The order's number sequence: the shipped values and purchase_order.
        const sequences = app.findCollectionByNameOrId('books_doc_sequences')
        sequences.fields.add(
            new SelectField({
                name: 'doc_type',
                type: 'select',
                required: true,
                maxSelect: 1,
                values: [
                    'journal',
                    'transfer',
                    'invoice',
                    'sales_receipt',
                    'estimate',
                    'bill',
                    'purchase_order',
                    'expense',
                    'payment',
                    'bill_payment',
                    'credit_memo',
                    'vendor_credit',
                    'vendor_refund',
                    'refund_receipt',
                    'write_off',
                    'deposit',
                    'inventory_adjustment',
                    'statement',
                ],
            })
        )
        app.save(sequences)
        const purchaseOrder = new Record(sequences)
        purchaseOrder.set('id', 'booksseqpurchor')
        purchaseOrder.set('doc_type', 'purchase_order')
        purchaseOrder.set('prefix', '')
        purchaseOrder.set('next_number', 1001)
        app.save(purchaseOrder)

        // A purchase order's send: its doc_type, and the vendor it names.
        const sends = app.findCollectionByNameOrId('books_document_sends')
        sends.fields.add(
            new SelectField({
                name: 'doc_type',
                type: 'select',
                required: true,
                maxSelect: 1,
                values: ['invoice', 'estimate', 'sales_receipt', 'credit_memo', 'refund_receipt', 'purchase_order'],
            })
        )
        sends.fields.add(
            new RelationField({
                name: 'vendor',
                collectionId: vendors.id,
                cascadeDelete: true,
                maxSelect: 1,
            })
        )
        app.save(sends)

        const auditLog = app.findCollectionByNameOrId('books_audit_log')
        auditLog.viewQuery = auditQuery(LINES, SEND_PARENTS)
        app.save(auditLog)
    },
    app => {
        const auditLog = app.findCollectionByNameOrId('books_audit_log')
        auditLog.viewQuery = auditQuery(SHIPPED_LINES, SHIPPED_SEND_PARENTS)
        app.save(auditLog)

        app.db().newQuery("DELETE FROM books_document_sends WHERE doc_type = 'purchase_order'").execute()
        const sends = app.findCollectionByNameOrId('books_document_sends')
        sends.fields.removeByName('vendor')
        withoutPurchaseOrder(sends.fields.getByName('doc_type'))
        app.save(sends)

        app.delete(app.findRecordById('books_doc_sequences', 'booksseqpurchor'))
        const sequences = app.findCollectionByNameOrId('books_doc_sequences')
        withoutPurchaseOrder(sequences.fields.getByName('doc_type'))
        app.save(sequences)

        app.db().newQuery('DROP TABLE IF EXISTS fts_books_purchase_orders').execute()
        const products = app.findCollectionByNameOrId('books_products')
        products.fields.removeByName('quantity_on_po')
        app.save(products)
        const billLines = app.findCollectionByNameOrId('books_bill_lines')
        billLines.fields.removeByName('po_line')
        billLines.indexes = billLines.indexes.filter(index => !index.includes('idx_books_bill_lines_po_line'))
        app.save(billLines)
        const bills = app.findCollectionByNameOrId('books_bills')
        bills.fields.removeByName('purchase_order')
        bills.indexes = bills.indexes.filter(index => !index.includes('idx_books_bills_purchase_order'))
        app.save(bills)
        for (const name of ['books_purchase_order_lines', 'books_purchase_orders']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
