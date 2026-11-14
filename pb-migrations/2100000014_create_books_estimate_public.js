/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// The estimate's customer link (/p/books/estimates/<token>): what a signed-out
// customer reads, and the answer they send. 2100000013 is taken by the bill
// (books_bills), so this migration skips it.
//
// books_estimate_public is a view of one estimate for the customer who holds
// its public_token (2100000012). It carries only what the customer page shows:
// the estimate's number, status, days, acceptance, total, currency (the
// estimate's, else Books') and message, the customer's display name, and the
// business name, email and phone of the one books_settings row. Never the memo,
// the custom fields, the form, bill_to, the email, the lines, the tax, the
// customer id or the invoice. A request reads a row only when it sends that
// row's token in the X-Share-Token header (core share-token.ts), so a request
// without the header, or with a token no row has, lists nothing, and Books
// members do not read the view either. The currency is CAST to TEXT because a
// bare expression column of a view is a json field in PocketBase.
//
// books_estimate_responses holds a customer's Accept or Decline. A create is
// allowed only to a request whose X-Share-Token is the token of the estimate it
// names; the Go hook in server/estimate_responses.go then trims the name and
// the reason, refuses an answer the estimate cannot take (not pending, expired,
// a reason on an accept, an accept with no name) and sets the estimate's status
// in the same transaction. Only Books readers list and view responses: a token
// clause here would let a token holder filter through the `estimate` relation
// (`estimate.memo~"x"`) and learn private estimate fields one guess at a time,
// because PocketBase does not apply the related collection's rules to a client
// filter. The customer page never reads a response (PocketBase returns the
// created record to its creator with no view rule). Nobody updates or deletes
// a response.
//
// The rule constants repeat 2100000012's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const TOKEN = '@request.headers.x_share_token != ""'
const PUBLIC_READ = `${TOKEN} && token = @request.headers.x_share_token`

const PUBLIC_QUERY = `SELECT
    e.id,
    e.public_token AS token,
    e.number,
    e.status,
    e.date,
    e.expiration_date,
    e.accepted_by,
    e.accepted_date,
    e.total,
    CAST(COALESCE(NULLIF(e.currency, ''), s.currency) AS TEXT) AS currency,
    e.message,
    c.display_name AS customer_name,
    s.business_name,
    s.email AS business_email,
    s.phone AS business_phone
FROM books_estimates e
JOIN books_customers c ON c.id = e.customer
LEFT JOIN books_settings s ON s.id = 'bookssettings01'`

migrate(
    app => {
        const estimates = app.findCollectionByNameOrId('books_estimates')

        app.save(
            new Collection({
                id: 'pbc_books_est_public',
                name: 'books_estimate_public',
                type: 'view',
                viewQuery: PUBLIC_QUERY,
                listRule: PUBLIC_READ,
                viewRule: PUBLIC_READ,
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_est_resp',
                name: 'books_estimate_responses',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${TOKEN} && @request.body.estimate.public_token = @request.headers.x_share_token`,
                updateRule: null,
                deleteRule: null,
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
                        name: 'decision',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['accepted', 'declined'],
                    },
                    { name: 'name', type: 'text', max: 200 },
                    { name: 'reason', type: 'text', max: 1000 },
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
                ],
                indexes: [
                    'CREATE INDEX idx_books_estimate_responses_estimate ON books_estimate_responses (estimate, created)',
                ],
            })
        )
    },
    app => {
        for (const name of ['books_estimate_responses', 'books_estimate_public']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
