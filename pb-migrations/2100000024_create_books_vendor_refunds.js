/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books vendor refunds: money a vendor sends back, and the vendor credits it
// refunds. A vendor refund is the mirror of a received payment (2100000019):
// posting debits the Refunded to account and credits Accounts payable, and
// each line lowers its vendor credit's balance (server/vendor_refunds.go,
// server/vendor_refund_posting.go).
//
// AUTHORIZATION. The rules are the received payment's: every member with read
// access lists and views vendor refunds and their lines, a writer creates and
// edits drafts, moves a posted refund to void, and deletes drafts. The Go
// hooks decide whether the write is valid: the vendor exists (and is active
// at posting; a correction may keep its original's inactive vendor), the date
// is a real day, the reference no. is at most 40 characters, the payment
// method is a known key, the Refunded to account is an active bank, credit
// card or Undeposited funds account, the amount is from 1 to 2^53-1 cents,
// and the lines of a refund that is not a draft never change. Each line names
// a posted vendor credit of the refund's vendor, once, with an amount above
// 0, and a refund holds at most 500 lines. The lines add up to the amount and
// each is at most its credit's balance; Go checks both at posting, because a
// draft writes its header and its lines as separate records.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`, as on
// the received payment: the number and sequence (assigned at posting), the
// currency, the journal entry, replaced_by, who and when, and sort_key.
//
// CORRECTION. A draft whose replaces names a posted refund posts under the
// original's number; the original becomes void with replaced_by set.
//
// MONEY is integer minor units (onlyInt), at most 2^53-1, the largest integer
// a number field (float64) stores exactly. DATES are YYYY-MM-DD text, as on
// journal entries.
//
// The rule constants repeat 2100000019's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'
// 2^53-1: the largest whole number of cents a number field stores exactly.
const MAX_STORED = 9007199254740991

const REFUND_SERVER_FIELDS = [
    'number',
    'sequence',
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
const relation = (name, collectionId, extra = {}) => ({
    name,
    type: 'relation',
    collectionId,
    cascadeDelete: false,
    maxSelect: 1,
    ...extra,
})

migrate(
    app => {
        const vendors = app.findCollectionByNameOrId('books_vendors')
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const entries = app.findCollectionByNameOrId('books_journal_entries')
        const credits = app.findCollectionByNameOrId('books_vendor_credits')

        app.save(
            new Collection({
                id: 'pbc_books_vrefunds',
                name: 'books_vendor_refunds',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && ${unset(...REFUND_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...REFUND_SERVER_FIELDS)} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    relation('vendor', vendors.id, { required: true }),
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
                    // PAYMENT_METHODS keys (tinycld/books/lib/payment-methods.ts); empty is none.
                    {
                        name: 'payment_method',
                        type: 'select',
                        maxSelect: 1,
                        values: ['cash', 'check', 'credit_card', 'debit_card', 'bank_transfer', 'other'],
                    },
                    { name: 'reference_no', type: 'text', max: 40 },
                    relation('refunded_to', accounts.id, { required: true }),
                    { name: 'amount', type: 'number', onlyInt: true, min: 1, max: MAX_STORED },
                    { name: 'memo', type: 'text', max: 4000 },
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
        const refunds = app.findCollectionByNameOrId('books_vendor_refunds')
        for (const name of ['replaces', 'replaced_by']) {
            refunds.fields.add(
                new RelationField({ name, collectionId: refunds.id, cascadeDelete: false, maxSelect: 1 })
            )
        }
        refunds.indexes = [
            'CREATE INDEX idx_books_vendor_refunds_vendor ON books_vendor_refunds (vendor, status)',
            // The account delete guard counts the refunds of a Refunded to account.
            'CREATE INDEX idx_books_vendor_refunds_refunded_to ON books_vendor_refunds (refunded_to)',
        ]
        app.save(refunds)

        app.save(
            new Collection({
                id: 'pbc_books_vrefund_lines',
                name: 'books_vendor_refund_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.refund.status = "draft"`,
                updateRule: `${WRITE} && ${unset('refund')} && refund.status = "draft"`,
                deleteRule: `${WRITE} && refund.status = "draft"`,
                fields: [
                    relation('refund', refunds.id, { required: true, cascadeDelete: true }),
                    relation('vendor_credit', credits.id, { required: true }),
                    { name: 'amount', type: 'number', onlyInt: true, min: 1, max: MAX_STORED },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_vendor_refund_lines_refund_credit ON books_vendor_refund_lines (refund, vendor_credit)',
                    'CREATE INDEX idx_books_vendor_refund_lines_credit ON books_vendor_refund_lines (vendor_credit)',
                ],
            })
        )

        // Books search over vendor refunds, drafts included, as fts_books_payments
        // (2100000019): server/search_index.go keeps each row in step with its
        // refund. On a new database there are no refunds to backfill.
        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_vendor_refunds USING fts5(record_id UNINDEXED, number, reference_no, memo, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_vendor_refunds').execute()
        for (const name of ['books_vendor_refund_lines', 'books_vendor_refunds']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
