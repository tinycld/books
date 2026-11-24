/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books audit log: core's audit_logs rows of Books records, as a view. A row
// is one create, update or delete of a record in a books_* collection; core
// events (sign-ins, users) are left out by the prefix range on resource_type,
// which the idx_audit_resource index serves (a backtick sorts right after an
// underscore). The view whitelists its columns: no IP address, user agent or
// metadata. Nothing writes it: Books registers it with core's change signal
// (server/register.go), so a new audit row reaches the clients that read it.
//
// actor is 'system' for a row no person made (the auto-reversal sweep), so
// the User filter can name it; actor_name is "System" there, the user's name
// otherwise, and "Unknown user" when the user row is gone. event reads an
// update whose status became posted or void as posted or voided; event_shown
// is the event the report shows (see EVENT_SHOWN).
//
// A line row (the nineteen collections below) names its document in
// parent_type and parent_id, read from the live line, else from its delete
// snapshot; history_type and history_id are the record whose history the row
// opens: the document for a line, the record itself otherwise. server/audit.go
// auditParentFields lists the same nineteen. A document send
// (books_document_sends) is filed as a line of the document it sent: its
// parent collection is not fixed, so its row of LINES has no parent and
// parent_type reads the send's doc_type (SEND_PARENTS). The view reads the
// payment applications, bill payment lines, credit memo lines, credit memo
// applications, vendor credit lines, vendor credit applications, vendor refund
// lines, refund receipt lines, document sends, deposit items and deposit lines
// tables, so it comes after 2100000019_create_books_payments,
// 2100000021_create_books_bill_payments, 2100000022_create_books_credit_memos,
// 2100000023_create_books_vendor_credits, 2100000024_create_books_vendor_refunds,
// 2100000025_create_books_refund_receipts,
// 2100000031_create_books_credit_memo_applications,
// 2100000034_create_books_document_sends and
// 2100000037_create_books_deposits.
//
// The query is one SELECT: PocketBase's view parser refuses UNION ALL. Every
// computed column is cast to TEXT, because PocketBase types an uncast
// expression as json, and the report engine reads no json column as text or
// select. The bare columns keep their audit_logs types (created a date-time).
// json_valid guards each json_extract: a row with no changes or snapshot holds
// no JSON there.
//
// AUTHORIZATION. Every member with Books read access lists and views the rows
// (spec §5 "Visibility rule": every audited collection is readable by every
// Books reader); a view has no create, update or delete.
//
// The rule constants repeat 2100000015's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`

// Each line collection, its document's collection and the line field that
// names the document. An empty document collection is a send's: SEND_PARENTS
// gives it by the row's doc_type.
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
    ['books_refund_receipt_lines', 'books_refund_receipts', 'refund_receipt'],
    ['books_sales_receipt_lines', 'books_sales_receipts', 'sales_receipt'],
    ['books_vendor_credit_applications', 'books_vendor_credits', 'vendor_credit'],
    ['books_vendor_credit_lines', 'books_vendor_credits', 'vendor_credit'],
    ['books_vendor_refund_lines', 'books_vendor_refunds', 'refund'],
]

const CHANGES = 'CASE WHEN json_valid(a.changes) THEN a.changes END'
const SNAPSHOT = 'CASE WHEN json_valid(a.snapshot) THEN a.snapshot END'
const STATUS_AFTER = `json_extract(${CHANGES}, '$.status.after')`

// A send's doc_type and the collection of the document it names.
const SEND_PARENTS = [
    ['invoice', 'books_invoices'],
    ['estimate', 'books_estimates'],
    ['sales_receipt', 'books_sales_receipts'],
    ['credit_memo', 'books_credit_memos'],
    ['refund_receipt', 'books_refund_receipts'],
]

// The document collection of a send row: its doc_type, read from the live
// row, else from its delete snapshot.
const sendParentType = lines =>
    `CASE COALESCE((SELECT doc_type FROM ${lines} WHERE id = a.resource_id), json_extract(${SNAPSHOT}, '$.doc_type'), '') ${SEND_PARENTS.map(([docType, parent]) => `WHEN '${docType}' THEN '${parent}'`).join(' ')} ELSE '' END`

const parentTypeOf = (lines, parent) => (parent === '' ? sendParentType(lines) : `'${parent}'`)

const PARENT_TYPE = `CASE a.resource_type ${LINES.map(([lines, parent]) => `WHEN '${lines}' THEN ${parentTypeOf(lines, parent)}`).join(' ')} ELSE '' END`

const PARENT_ID = `CASE a.resource_type ${LINES.map(
    ([lines, , field]) =>
        `WHEN '${lines}' THEN COALESCE((SELECT ${field} FROM ${lines} WHERE id = a.resource_id), json_extract(${SNAPSHOT}, '$.${field}'), '')`
).join(' ')} ELSE '' END`

const ACTOR_BLANK = "a.actor = '' OR a.actor IS NULL"

const EVENT = `CASE WHEN a.action = 'created' THEN 'added' WHEN a.action = 'deleted' THEN 'deleted' WHEN ${STATUS_AFTER} = 'posted' THEN 'posted' WHEN ${STATUS_AFTER} = 'void' THEN 'voided' ELSE 'changed' END`

// event_shown is the event the Audit Log report's Event column shows: a
// credit memo application's create reads credit_applied and its delete
// credit_removed (apply credit spec §3.8), any other row its event. The
// Event filter and the record History read event, so they still file those
// rows under added and deleted.
const APPLICATIONS = "a.resource_type = 'books_credit_memo_applications'"
const EVENT_SHOWN = `CASE WHEN ${APPLICATIONS} AND a.action = 'created' THEN 'credit_applied' WHEN ${APPLICATIONS} AND a.action = 'deleted' THEN 'credit_removed' ELSE ${EVENT} END`

const VIEW_QUERY = [
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
    `CAST(${PARENT_TYPE} AS TEXT) AS parent_type,`,
    `CAST(${PARENT_ID} AS TEXT) AS parent_id,`,
    `CAST(CASE WHEN (${PARENT_ID}) != '' THEN (${PARENT_TYPE}) ELSE a.resource_type END AS TEXT) AS history_type,`,
    `CAST(CASE WHEN (${PARENT_ID}) != '' THEN (${PARENT_ID}) ELSE a.resource_id END AS TEXT) AS history_id`,
    'FROM audit_logs a LEFT JOIN users u ON u.id = a.actor',
    "WHERE a.resource_type >= 'books_' AND a.resource_type < 'books`'",
].join(' ')

migrate(
    app => {
        const view = new Collection({
            type: 'view',
            name: 'books_audit_log',
            listRule: READ,
            viewRule: READ,
            viewQuery: VIEW_QUERY,
        })
        app.save(view)
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_audit_log'))
    }
)
