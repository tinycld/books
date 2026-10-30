/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books customers: the people and companies a business sells to, with one
// level of sub-customers.
//
// AUTHORIZATION. The rules decide who may act, by Books level (books_access,
// 2100000000): every member with read access lists and views customers, a
// writer creates, edits and deletes them. The Go hooks in server/customers.go
// decide whether the write is valid: the parent is an existing top-level
// customer and not the record itself, a customer with sub-customers gets no
// parent, an active customer gets no inactive parent, the display name is
// stored trimmed and is unique among its siblings, the addresses have the
// address shape, a customer with sub-customers is not deleted, and a customer
// with active sub-customers is not made inactive. A rule cannot count rows,
// which is why those live in Go.
//
// ADDRESSES are JSON: null, or { line1, line2, city, region, postal_code,
// country }, each a string of at most 200 characters (Go refuses any other
// key). maxSize is 8192 bytes, so six 200-character parts of 4-byte
// characters fit. A null shipping_address means the same as the billing
// address.
//
// UNIQUENESS. name_key is the display name trimmed, NFD-normalized,
// case-folded for every letter (Cherokee to uppercase, as CaseFolding.txt
// folds it) and NFC-normalized (Unicode canonical caseless matching, D145).
// Only the Go guard
// sets it, on every create and update, whatever the request sent; it is
// hidden, so a non-superuser never sees it in an API response (a superuser
// does).
// The Go name check is one lookup on the unique (parent, name_key) index, and
// the index is the backstop for that check: top-level customers share parent
// '', so they are siblings of each other.
//
// form and fields are the core forms engine's host columns (books:customer).
//
// The rule constants repeat 2100000002's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`

const AUTODATES = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]

migrate(
    app => {
        const forms = app.findCollectionByNameOrId('forms')
        app.save(
            new Collection({
                id: 'pbc_books_customers',
                name: 'books_customers',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: WRITE,
                deleteRule: WRITE,
                fields: [
                    { name: 'display_name', type: 'text', required: true, max: 200 },
                    { name: 'company', type: 'text', max: 200 },
                    { name: 'first_name', type: 'text', max: 100 },
                    { name: 'last_name', type: 'text', max: 100 },
                    { name: 'email', type: 'email' },
                    { name: 'phone', type: 'text', max: 40 },
                    { name: 'mobile', type: 'text', max: 40 },
                    { name: 'website', type: 'url' },
                    { name: 'billing_address', type: 'json', maxSize: 8192 },
                    { name: 'shipping_address', type: 'json', maxSize: 8192 },
                    { name: 'notes', type: 'text', max: 5000 },
                    { name: 'inactive', type: 'bool' },
                    {
                        name: 'form',
                        type: 'relation',
                        collectionId: forms.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'fields', type: 'json', maxSize: 1000000 },
                    { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                    ...AUTODATES,
                ],
            })
        )

        // The self-relation needs the collection to exist first.
        const customers = app.findCollectionByNameOrId('books_customers')
        customers.fields.add(
            new RelationField({
                name: 'parent',
                collectionId: customers.id,
                cascadeDelete: false,
                maxSelect: 1,
            })
        )
        customers.indexes = [
            'CREATE UNIQUE INDEX idx_books_customers_sibling_name ON books_customers (parent, name_key)',
            'CREATE INDEX idx_books_customers_form ON books_customers (form)',
        ]
        app.save(customers)
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_customers'))
    }
)
