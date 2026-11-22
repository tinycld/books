/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books document emails (email-share spec §4.2 and §4.3). 2100000034 was free
// (the audit view left it); the audit view 2100000038 reads books_document_sends
// to file a send under its document, so it stays after this migration.
//
// books_document_sends holds one row for each email a writer sends of a sales
// document: the document's kind and id, its number at the send, the customer
// (empty for a walk-in sales or refund receipt, which names none), the
// addresses, and the subject and message that were sent (body is the sanitized
// message HTML without the email frame, body_text the same message as text,
// for the Audit history). document is a record id, not a relation: the
// kind decides the collection. Only the send route writes a row, as the app,
// so there is no create, update or delete rule; every member with Books read
// access lists and views the rows. Deleting the customer deletes its sends;
// the delete of an estimate or of a draft document deletes its sends in Go
// (deleteDocumentSends, server/document_sends.go). sent_by is history, as an
// invoice's posted_by: offboarding does not reassign it. The index serves the
// sent line, which reads a document's sends newest first.
//
// books_invoice_public is a view of one posted or void invoice for the
// customer who holds its public_token (2100000010), as books_estimate_public
// (2100000014) is of an estimate. It carries only what the customer page
// shows: the invoice's number, status, days, total, balance, currency (the
// invoice's, else Books') and message, the customer's display name, the token
// and number of the invoice that replaced a void one, and the business name,
// email and phone of the one books_settings row. Never the memo, the custom
// fields, the form, bill_to, the email, the lines, the tax, the terms, the
// customer id or the entry. A draft has no row. A request reads a row only when
// it sends that row's token in the X-Share-Token header (core share-token.ts),
// so a request without the header, or with a token no row has, lists nothing.
// The currency is CAST to TEXT because a bare expression column of a view is a
// json field in PocketBase.
//
// The rule constants repeat 2100000033's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const TOKEN = '@request.headers.x_share_token != ""'
const PUBLIC_READ = `${TOKEN} && token = @request.headers.x_share_token`

const PUBLIC_QUERY = `SELECT
    i.id,
    i.public_token AS token,
    i.number,
    i.status,
    i.date,
    i.due_date,
    i.total,
    i.balance,
    CAST(COALESCE(NULLIF(i.currency, ''), s.currency) AS TEXT) AS currency,
    i.message,
    c.display_name AS customer_name,
    r.public_token AS replaced_by_token,
    r.number AS replaced_by_number,
    s.business_name,
    s.email AS business_email,
    s.phone AS business_phone
FROM books_invoices i
JOIN books_customers c ON c.id = i.customer
LEFT JOIN books_invoices r ON r.id = i.replaced_by
LEFT JOIN books_settings s ON s.id = 'bookssettings01'
WHERE i.status IN ('posted', 'void')`

migrate(
    app => {
        const customers = app.findCollectionByNameOrId('books_customers')

        app.save(
            new Collection({
                id: 'pbc_books_doc_sends',
                name: 'books_document_sends',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    {
                        name: 'doc_type',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['invoice', 'estimate', 'sales_receipt', 'credit_memo', 'refund_receipt'],
                    },
                    { name: 'document', type: 'text', required: true, min: 15, max: 15 },
                    { name: 'number', type: 'text', max: 40 },
                    {
                        name: 'customer',
                        type: 'relation',
                        collectionId: customers.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    { name: 'to', type: 'text', required: true, max: 320 },
                    { name: 'cc', type: 'text', max: 2000 },
                    { name: 'subject', type: 'text', max: 300 },
                    { name: 'body', type: 'text', max: 50000 },
                    { name: 'body_text', type: 'text', max: 50000 },
                    {
                        name: 'sent_by',
                        type: 'relation',
                        collectionId: '_pb_users_auth_',
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                ],
                indexes: [
                    'CREATE INDEX idx_books_document_sends_document ON books_document_sends (doc_type, document, created)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_inv_public',
                name: 'books_invoice_public',
                type: 'view',
                viewQuery: PUBLIC_QUERY,
                listRule: PUBLIC_READ,
                viewRule: PUBLIC_READ,
            })
        )
    },
    app => {
        for (const name of ['books_invoice_public', 'books_document_sends']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
