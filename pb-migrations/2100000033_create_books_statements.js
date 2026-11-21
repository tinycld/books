/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books customer statements (statements spec §4.2): one row for each statement
// a writer saves for one customer. A statement posts nothing and changes no
// balance; it records the type, the dates and the address of one statement.
//
// AUTHORIZATION. Every member with Books read access lists and views the rows;
// a writer creates and deletes them. There is no update rule: only the send
// route changes a row (email, sent_at, sent_to), with the app's own save.
//
// SERVER FIELDS. The create guard (server/statements.go) refuses a client value
// for number, sequence, balance, currency, sent_at and sent_to, checks the
// dates (Start <= End <= Statement date; an open items statement has no
// period), and sets balance (the customer's receivable sum on the end day or
// the statement date), currency (books_settings) and the number of the
// statement sequence (booksseqstatemt, 2100000001).
//
// MONEY is integer minor units (onlyInt). DATES are YYYY-MM-DD text, as on
// Books documents. Deleting the customer deletes its statements.
//
// The rule constants repeat 2100000031's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`

// PocketBase checks a text pattern only on a value that is not empty, so the
// optional start_date and end_date take the same pattern.
const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
// 2^53-1: the largest whole number of cents a number field stores exactly.
const MAX_STORED = 9007199254740991

migrate(
    app => {
        const customers = app.findCollectionByNameOrId('books_customers')

        app.save(
            new Collection({
                id: 'pbc_books_statements',
                name: 'books_statements',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: null,
                deleteRule: WRITE,
                fields: [
                    {
                        name: 'customer',
                        type: 'relation',
                        required: true,
                        collectionId: customers.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    {
                        name: 'type',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['balance_forward', 'open_items'],
                    },
                    { name: 'statement_date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'start_date', type: 'text', max: 10, pattern: DAY },
                    { name: 'end_date', type: 'text', max: 10, pattern: DAY },
                    { name: 'email', type: 'email' },
                    { name: 'balance', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'currency', type: 'text', max: 3 },
                    { name: 'sent_at', type: 'date' },
                    { name: 'sent_to', type: 'text', max: 320 },
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
                ],
                indexes: [
                    'CREATE INDEX idx_books_statements_customer_date ON books_statements (customer, statement_date)',
                    'CREATE UNIQUE INDEX idx_books_statements_sequence ON books_statements (sequence)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_statements'))
    }
)
