/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books bank deposits (bank deposit spec §4.1): money that waits in an
// Undeposited funds account goes to a bank account in one deposit. A deposit
// holds items (posted journal lines on an Undeposited funds account) and other
// funds lines (money that is not from a listed item, such as interest or a
// fee). Posting debits the Deposit to account for the total, credits each
// Undeposited funds account for the net of its items and posts each other
// funds line on its account (server/deposits.go, server/deposit_posting.go).
//
// AUTHORIZATION. The rules are the received payment's: every member with read
// access lists and views deposits, their items and their lines, and the
// undeposited items view; a writer creates and edits drafts, moves a posted
// deposit to void, and deletes drafts. Items and lines are written only while
// their deposit is a draft. No person updates an item: Books writes its copy
// fields. The Go hooks decide whether the write is valid: Deposit to is an
// active bank account, the date is a real day, each item is a posted line on
// an Undeposited funds account, once per deposit, at most 500, and each other
// funds line names an active account that is not Accounts receivable,
// Accounts payable or Deposit to, an amount other than 0 within the stored
// limit and at most one party, at most 100. A rule cannot read the other rows
// those checks need, which is why they live in Go.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`, as on
// the received payment: the number and sequence (assigned at posting), the
// totals, the currency, the journal entry, replaced_by, who and when, and
// sort_key; on an item, every field but deposit, line and position.
//
// CORRECTION. A draft whose replaces names a posted deposit posts under the
// original's number; the original becomes void with replaced_by set, and its
// items are released.
//
// UNIQUENESS. A line is in at most one posted deposit: the partial unique
// index on books_deposit_items (line) WHERE posted = TRUE holds that under two
// posts at once.
//
// books_undeposited_items is a view: one row for each posted line on an
// Undeposited funds account whose entry is posted, is not a void reversal and
// is not a deposit's own entry, and that no posted deposit item holds. One
// SELECT: PocketBase's view parser refuses UNION ALL. The four LEFT JOINs give
// the source document's payment method and reference no. (an entry's
// document is the id of its payment, sales receipt, vendor refund or refund
// receipt); a journal entry or a transfer has none. The expression columns
// are cast, or PocketBase types them json. Books registers the view with
// core's change signal (server/register.go).
//
// The view's plan (EXPLAIN QUERY PLAN of SELECT * FROM the view, on a migrated
// database):
//   SEARCH e USING INDEX idx_books_je_status_date (status=?)
//   SEARCH l USING INDEX idx_books_jlines_entry (entry=?)
//   CORRELATED SCALAR SUBQUERY 4
//   SEARCH di USING COVERING INDEX idx_books_deposit_items_posted_line (line=?)
//   SEARCH a USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
//   SEARCH p USING INDEX sqlite_autoindex_books_payments_1 (id=?) LEFT-JOIN
//   SEARCH sr USING INDEX sqlite_autoindex_books_sales_receipts_1 (id=?) LEFT-JOIN
//   SEARCH vr USING INDEX sqlite_autoindex_books_vendor_refunds_1 (id=?) LEFT-JOIN
//   SEARCH rr USING INDEX sqlite_autoindex_books_refund_receipts_1 (id=?) LEFT-JOIN
// Every step is an index search; no table is scanned. The existing ledger
// indexes serve the view, so it adds no index on books_journal_lines.
//
// MONEY is integer minor units (onlyInt), at most 2^53-1, the largest integer
// a number field (float64) stores exactly. An item's amount and an other funds
// amount are signed: a negative amount takes money out. DATES are YYYY-MM-DD
// text, as on journal entries.
//
// It runs before the audit log view (2100000038), which reads the item and
// line rows. The rule constants repeat 2100000019's: a migration cannot import
// another.
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

const DEPOSIT_SERVER_FIELDS = [
    'number',
    'sequence',
    'total',
    'items_total',
    'lines_total',
    'currency',
    'entry',
    'replaced_by',
    'posted_by',
    'posted_at',
    'voided_by',
    'voided_at',
    'sort_key',
]

// The fields Books copies onto an item from its line, the line's entry and
// the entry's source document, when the item is created and again at posting.
const ITEM_SERVER_FIELDS = [
    'entry',
    'account',
    'customer',
    'vendor',
    'amount',
    'date',
    'doc_type',
    'number',
    'document',
    'payment_method',
    'reference_no',
    'posted',
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
const signedAmount = { name: 'amount', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED }

const UNDEPOSITED = `SELECT l.id AS id, l.id AS line, l.entry AS entry, l.account AS account, l.date AS date,
       e.doc_type AS doc_type, e.origin AS origin, e.number AS number, e.document AS document,
       l.customer AS customer, l.vendor AS vendor,
       CAST(l.debit - l.credit AS INTEGER) AS amount,
       CAST(COALESCE(p.payment_method, sr.payment_method, vr.payment_method, rr.payment_method, '') AS TEXT) AS payment_method,
       CAST(COALESCE(p.reference_no, sr.reference_no, vr.reference_no, rr.reference_no, '') AS TEXT) AS reference_no,
       l.memo AS memo
FROM books_accounts a
JOIN books_journal_lines l ON l.account = a.id AND l.posted = TRUE
JOIN books_journal_entries e ON e.id = l.entry AND e.status = 'posted' AND e.origin != 'void_reversal'
     AND e.doc_type != 'deposit'
LEFT JOIN books_payments p ON p.id = e.document
LEFT JOIN books_sales_receipts sr ON sr.id = e.document
LEFT JOIN books_vendor_refunds vr ON vr.id = e.document
LEFT JOIN books_refund_receipts rr ON rr.id = e.document
WHERE a.detail_type = 'undeposited_funds'
  AND NOT EXISTS (SELECT 1 FROM books_deposit_items di WHERE di.line = l.id AND di.posted = TRUE)`

migrate(
    app => {
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        const customers = app.findCollectionByNameOrId('books_customers')
        const vendors = app.findCollectionByNameOrId('books_vendors')

        app.save(
            new Collection({
                id: 'pbc_books_deposits',
                name: 'books_deposits',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...DEPOSIT_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...DEPOSIT_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
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
                    relation('deposit_to', accounts.id, { required: true }),
                    { name: 'memo', type: 'text', max: 4000 },
                    // Written at posting: total = items_total + lines_total.
                    { name: 'total', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'items_total', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'lines_total', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
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
        const deposits = app.findCollectionByNameOrId('books_deposits')
        for (const name of ['replaces', 'replaced_by']) {
            deposits.fields.add(
                new RelationField({ name, collectionId: deposits.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        deposits.indexes = [
            'CREATE INDEX idx_books_deposits_status_date ON books_deposits (status, date)',
            // The account delete guard counts the deposits of a Deposit to account.
            'CREATE INDEX idx_books_deposits_deposit_to ON books_deposits (deposit_to)',
        ]
        app.save(deposits)

        app.save(
            new Collection({
                id: 'pbc_books_dep_items',
                name: 'books_deposit_items',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.deposit.status = "draft" && ${unset(...ITEM_SERVER_FIELDS)}`,
                updateRule: null,
                deleteRule: `${WRITE} && deposit.status = "draft"`,
                fields: [
                    relation('deposit', deposits.id, { required: true, cascadeDelete: true }),
                    relation('line', lines.id, { required: true }),
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    relation('entry', entries.id),
                    relation('account', accounts.id),
                    relation('customer', customers.id),
                    relation('vendor', vendors.id),
                    // The line's debit - credit: money in is above 0, money out below.
                    signedAmount,
                    { name: 'date', type: 'text', max: 10, pattern: OPTIONAL_DAY },
                    // The doc type of the line's entry: books_journal_entries.doc_type's
                    // values (2100000002), so the audit history labels it through DOC_TYPE.
                    {
                        name: 'doc_type',
                        type: 'select',
                        maxSelect: 1,
                        values: [
                            'journal',
                            'transfer',
                            'invoice',
                            'sales_receipt',
                            'bill',
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
                        ],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'document', type: 'text', max: 40 },
                    { name: 'payment_method', type: 'text', max: 40 },
                    { name: 'reference_no', type: 'text', max: 40 },
                    { name: 'posted', type: 'bool' },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_deposit_items_deposit_line ON books_deposit_items (deposit, line)',
                    'CREATE UNIQUE INDEX idx_books_deposit_items_posted_line ON books_deposit_items (line) WHERE posted = TRUE',
                    // The deposited-item guard reads the posted items of an entry.
                    'CREATE INDEX idx_books_deposit_items_entry ON books_deposit_items (entry)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_dep_lines',
                name: 'books_deposit_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.deposit.status = "draft"`,
                updateRule: `${WRITE} && ${unset('deposit')} && deposit.status = "draft"`,
                deleteRule: `${WRITE} && deposit.status = "draft"`,
                fields: [
                    relation('deposit', deposits.id, { required: true, cascadeDelete: true }),
                    // At most one of the two; the Go hook refuses both.
                    relation('customer', customers.id),
                    relation('vendor', vendors.id),
                    relation('account', accounts.id, { required: true }),
                    { name: 'description', type: 'text', max: 1000 },
                    // Signed, never 0: a negative amount takes money out.
                    signedAmount,
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_deposit_lines_deposit ON books_deposit_lines (deposit, position)',
                    // The delete guards of accounts, customers and vendors count the lines.
                    'CREATE INDEX idx_books_deposit_lines_account ON books_deposit_lines (account)',
                    'CREATE INDEX idx_books_deposit_lines_customer ON books_deposit_lines (customer)',
                    'CREATE INDEX idx_books_deposit_lines_vendor ON books_deposit_lines (vendor)',
                ],
            })
        )

        app.save(
            new Collection({
                type: 'view',
                name: 'books_undeposited_items',
                listRule: READ,
                viewRule: READ,
                viewQuery: UNDEPOSITED,
            })
        )

        // Books search over deposits, drafts included, as fts_books_payments
        // (2100000019): server/search_index.go keeps each row in step with its
        // deposit. On a new database there are no deposits to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_deposits USING fts5(record_id UNINDEXED, number, memo, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_deposits').execute()
        for (const name of [
            'books_undeposited_items',
            'books_deposit_lines',
            'books_deposit_items',
            'books_deposits',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
