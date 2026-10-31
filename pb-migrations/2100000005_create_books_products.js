/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books products and services: what a business sells and buys, and the
// bundles that sell several of them as one line.
//
// AUTHORIZATION. The rules decide who may act, by Books level (books_access,
// 2100000000): every member with read access lists and views products and
// bundle rows, a writer creates, edits and deletes them. The Go hooks in
// server/products.go decide whether the write is valid: the name is stored
// trimmed and is unique among products; a bundle stays a bundle and nothing
// becomes one after it is created; a Service or Non-inventory item names an
// existing, active Income or Other income account, and while purchasing is on
// an expense account that is not Accounts receivable or Accounts payable (each
// account checked only when it changes); a bundle has no price, cost or
// accounts of its own. A product on a bundle cannot be deleted, and an account
// a product names cannot be deleted (server/accounts.go). A rule cannot look
// up another row that way, which is why those live in Go.
//
// UNIQUENESS. name_key is the name's canonical caseless form (nameKey in
// server/names.go, as for vendors). Only the Go guard sets it, on every create
// and update, whatever the request sent; it is hidden, so a non-superuser
// never sees it in an API response. The Go name check is one lookup on the
// unique name_key index, and the index is the backstop for that check. A SKU
// may repeat.
//
// BUNDLE ROWS. books_bundle_items holds a bundle's items in position order.
// The Go guard checks that a row's bundle is a bundle and never changes, that
// its product exists, is not a bundle and is active when the row is created or
// its product changes, the quantity, and at most 50 rows per bundle. Deleting
// a bundle deletes its rows (cascadeDelete on bundle); a product on a row
// cannot be deleted (no cascade on product, and the Go delete hook refuses).
//
// price and cost are integer cents. currency is stamped by the server from
// books_settings. form and fields are the core forms engine's host columns
// (books:product).
//
// The rule constants repeat 2100000004's: a migration cannot import another.
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
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const products = new Collection({
            id: 'pbc_books_products',
            name: 'books_products',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: WRITE,
            updateRule: WRITE,
            deleteRule: WRITE,
            fields: [
                {
                    name: 'type',
                    type: 'select',
                    required: true,
                    maxSelect: 1,
                    values: ['service', 'non_inventory', 'bundle'],
                },
                { name: 'name', type: 'text', required: true, max: 200 },
                { name: 'sku', type: 'text', max: 100 },
                { name: 'sales_description', type: 'text', max: 4000 },
                // Integer cents up to 2^53-1, the largest amount a float64 holds exactly.
                { name: 'price', type: 'number', onlyInt: true, min: 0, max: 9007199254740991 },
                {
                    name: 'income_account',
                    type: 'relation',
                    collectionId: accounts.id,
                    cascadeDelete: false,
                    maxSelect: 1,
                },
                { name: 'purchases', type: 'bool' },
                { name: 'purchase_description', type: 'text', max: 4000 },
                { name: 'cost', type: 'number', onlyInt: true, min: 0, max: 9007199254740991 },
                {
                    name: 'expense_account',
                    type: 'relation',
                    collectionId: accounts.id,
                    cascadeDelete: false,
                    maxSelect: 1,
                },
                { name: 'inactive', type: 'bool' },
                { name: 'currency', type: 'text', required: true, pattern: '^[A-Z]{3}$' },
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
            indexes: [
                'CREATE UNIQUE INDEX idx_books_products_name ON books_products (name_key)',
                'CREATE INDEX idx_books_products_form ON books_products (form)',
            ],
        })
        app.save(products)
        app.save(
            new Collection({
                id: 'pbc_books_bundle_items',
                name: 'books_bundle_items',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: WRITE,
                deleteRule: WRITE,
                fields: [
                    {
                        name: 'bundle',
                        type: 'relation',
                        required: true,
                        collectionId: products.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    {
                        name: 'product',
                        type: 'relation',
                        required: true,
                        collectionId: products.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'quantity', type: 'number', min: 0.01, max: 1000000 },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_bundle_items_bundle ON books_bundle_items (bundle)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_bundle_items'))
        app.delete(app.findCollectionByNameOrId('books_products'))
    }
)
