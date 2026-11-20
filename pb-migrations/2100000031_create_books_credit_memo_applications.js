/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books credit memo applications (apply credit spec §4.1): a row applies part
// of a posted credit memo to a posted invoice of the same customer on an apply
// date. It is the customer-side twin of books_vendor_credit_applications
// (2100000023) and has its shape.
//
// AUTHORIZATION. Every member with Books read access lists and views the rows;
// a writer creates and deletes them. A row never changes (remove it and apply
// again): there is no update rule. The server writes applied_by and
// close_override (the override that admitted an apply date on or before the
// close date), moves both documents' balances and the memo's applied
// (server/credit_applications.go, server/credit_memo_applications.go).
// Neither document relation cascades: a posted credit memo or invoice is never
// deleted.
//
// MONEY is integer minor units (onlyInt), at most 2^53-1. DATES are YYYY-MM-DD
// text, as on journal entries.
//
// The rule constants repeat 2100000023's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
// 2^53-1: the largest whole number of cents a number field stores exactly.
const MAX_STORED = 9007199254740991

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
        const memos = app.findCollectionByNameOrId('books_credit_memos')
        const invoices = app.findCollectionByNameOrId('books_invoices')

        app.save(
            new Collection({
                id: 'pbc_books_memo_apps',
                name: 'books_credit_memo_applications',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset('applied_by', 'close_override')}`,
                updateRule: null,
                deleteRule: WRITE,
                fields: [
                    relation('credit_memo', memos.id, { required: true }),
                    relation('invoice', invoices.id, { required: true }),
                    // required: PocketBase skips min for 0, and refuses 0 only
                    // on a required number field.
                    { name: 'amount', type: 'number', required: true, onlyInt: true, min: 1, max: MAX_STORED },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    userRef('applied_by'),
                    // The close-date override that admitted an application dated
                    // on or before the close date, as on a journal entry. Only
                    // the server writes it.
                    relation('close_override', 'pbc_books_closeov'),
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                ],
                indexes: [
                    'CREATE INDEX idx_books_credit_memo_applications_memo ON books_credit_memo_applications (credit_memo)',
                    'CREATE INDEX idx_books_credit_memo_applications_invoice ON books_credit_memo_applications (invoice)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_credit_memo_applications'))
    }
)
