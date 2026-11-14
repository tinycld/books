/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books party contacts: the people at a customer (later, a vendor) that Books
// keeps for the customer page. A contact belongs to exactly one party: one of
// customer and vendor is set, and it is deleted with that party.
//
// AUTHORIZATION. Every member with read access lists and views contacts; a
// writer creates, edits and deletes them. The Go hooks in
// server/party_contacts.go decide whether the write is valid: exactly one
// party, and the party exists. A contact saved as primary clears the flag on
// the party's other contacts in the same transaction.
//
// The rule constants repeat 2100000012's: a migration cannot import another.
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
        const customers = app.findCollectionByNameOrId('books_customers')
        const vendors = app.findCollectionByNameOrId('books_vendors')

        app.save(
            new Collection({
                id: 'pbc_books_party_contacts',
                name: 'books_party_contacts',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: WRITE,
                deleteRule: WRITE,
                fields: [
                    {
                        name: 'customer',
                        type: 'relation',
                        collectionId: customers.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    {
                        name: 'vendor',
                        type: 'relation',
                        collectionId: vendors.id,
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    { name: 'name', type: 'text', required: true, max: 200 },
                    { name: 'role', type: 'text', max: 100 },
                    { name: 'email', type: 'email' },
                    { name: 'phone', type: 'text', max: 40 },
                    { name: 'is_primary', type: 'bool' },
                    ...AUTODATES,
                ],
                indexes: [
                    "CREATE INDEX idx_books_party_contacts_customer ON books_party_contacts (customer) WHERE customer != ''",
                    "CREATE INDEX idx_books_party_contacts_vendor ON books_party_contacts (vendor) WHERE vendor != ''",
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_party_contacts'))
    }
)
