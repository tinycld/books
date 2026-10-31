/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books vendors: the people and companies a business buys from.
//
// AUTHORIZATION. The rules decide who may act, by Books level (books_access,
// 2100000000): every member with read access lists and views vendors, a
// writer creates, edits and deletes them. The Go hooks in server/vendors.go
// decide whether the write is valid: the display name is stored trimmed and
// is unique among vendors, the address has the address shape, and a default
// expense account, when it changes, is an existing active account that is not
// Accounts receivable or Accounts payable. A rule cannot look up another row
// that way, which is why those live in Go. Nothing references a vendor yet,
// so every delete is allowed.
//
// ADDRESS is JSON: null, or { line1, line2, city, region, postal_code,
// country }, each a string of at most 200 characters (Go refuses any other
// key). maxSize is 8192 bytes, so six 200-character parts of 4-byte
// characters fit.
//
// UNIQUENESS. name_key is the display name trimmed, NFD-normalized,
// case-folded for every letter (Cherokee to uppercase, as CaseFolding.txt
// folds it) and NFC-normalized (Unicode canonical caseless matching, D145).
// Only the Go guard sets it, on every create and update, whatever the request
// sent; it is hidden, so a non-superuser never sees it in an API response (a
// superuser does). The Go name check is one lookup on the unique name_key
// index, and the index is the backstop for that check.
//
// SORT KEY. sort_key is the display name case- and accent-folded
// (server/sort_keys.go). Only the Go guard sets it, on every create and update.
// The vendors list sorts and pages on (sort_key, id), so it is not hidden.
//
// 1099. track_1099 marks a vendor for 1099 reporting; legal_name is the name
// on its W-9, tax_id_type is ein or ssn (empty is none) and tax_id its tax ID.
// Go (server/vendors.go) trims the legal name and stores the tax ID with the
// dashes of its type (EIN 12-3456789, SSN 123-45-6789); the pattern is the
// backstop for that stored form. The rules above do not change for them.
//
// form and fields are the core forms engine's host columns (books:vendor).
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
        const accounts = app.findCollectionByNameOrId('books_accounts')
        app.save(
            new Collection({
                id: 'pbc_books_vendors',
                name: 'books_vendors',
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
                    { name: 'address', type: 'json', maxSize: 8192 },
                    {
                        name: 'terms',
                        type: 'select',
                        maxSelect: 1,
                        values: ['due_on_receipt', 'net_10', 'net_15', 'net_30', 'net_60'],
                    },
                    { name: 'account_number', type: 'text', max: 100 },
                    {
                        name: 'expense_account',
                        type: 'relation',
                        collectionId: accounts.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'notes', type: 'text', max: 5000 },
                    { name: 'track_1099', type: 'bool' },
                    { name: 'legal_name', type: 'text', max: 200 },
                    { name: 'tax_id_type', type: 'select', maxSelect: 1, values: ['ein', 'ssn'] },
                    {
                        name: 'tax_id',
                        type: 'text',
                        max: 11,
                        pattern: '^(\\d{2}-\\d{7}|\\d{3}-\\d{2}-\\d{4})?$',
                    },
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
                    { name: 'sort_key', type: 'text', max: 1000 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_vendors_name ON books_vendors (name_key)',
                    'CREATE INDEX idx_books_vendors_form ON books_vendors (form)',
                    'CREATE INDEX idx_books_vendors_sort ON books_vendors (sort_key, id)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_vendors'))
    }
)
