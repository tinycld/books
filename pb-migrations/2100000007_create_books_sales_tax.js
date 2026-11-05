/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books sales tax: the agencies a business pays sales tax to, the rates each
// agency charges, and the groups that charge several rates as one choice.
//
// AUTHORIZATION. The rules decide who may act, by Books level (books_access,
// 2100000000): every member with read access lists and views agencies, rates
// and groups, a writer creates, edits and deletes them. The Go hooks in
// server/sales_tax.go decide whether the write is valid: a name is stored
// trimmed and is unique among agencies, or among all rates and groups; an
// agency names an existing, active Other current liability account (checked
// only when it changes); a rate stays a rate and a group a group; a rate
// names an existing, active agency (checked only when it changes) and holds
// no other rates; a group has no rate or agency of its own and holds two to
// ten distinct rates, each active when the change adds it; only an active row
// can be the default. A rule cannot look up another row that way, which is
// why those live in Go.
//
// UNIQUENESS. name_key is the name's canonical caseless form (nameKey in
// server/names.go, as for products). Only the Go guard sets it, on every
// create and update, whatever the request sent; it is hidden, so a
// non-superuser never sees it in an API response. The Go name check is one
// lookup on the unique name_key index, and the index is the backstop for that
// check. Rates and groups share one collection, so one index keeps a rate and
// a group from sharing a name.
//
// SORT KEY. sort_key is the name case- and accent-folded (server/sort_keys.go).
// Only the Go guard sets it, on every create and update. The Taxes page sorts
// on (sort_key, id), so it is not hidden.
//
// THE DEFAULT. At most one row has is_default: the rate or group new sales
// start with. Setting it clears the previous default inside the same
// serialized write (clearOtherDefault). The partial unique index
// idx_books_tax_rates_default is the backstop of that swap: no write, with or
// without the guard, can store a second default.
//
// rate_ppm is the rate in parts per million of the taxable amount (1% = 10 000;
// 8.875% = 88 750), an integer from 0 to 1 000 000, so no rate is a float. A
// group's is 0: its rate is the sum of its components'. components names rates
// of this same collection, never a group (the guard checks it); a rate's is
// empty.
//
// PRODUCTS AND CUSTOMERS. The tax columns of books_products (taxable) and
// books_customers (tax_exempt, exemption_reason, exemption_number,
// default_tax_rate) are added here, not in 2100000005 and 2100000003: a
// relation needs its target collection, and those migrations predate
// books_tax_rates.
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

const RULES = {
    listRule: READ,
    viewRule: READ,
    createRule: WRITE,
    updateRule: WRITE,
    deleteRule: WRITE,
}

migrate(
    app => {
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const agencies = new Collection({
            id: 'pbc_books_tax_agencies',
            name: 'books_tax_agencies',
            type: 'base',
            ...RULES,
            fields: [
                { name: 'name', type: 'text', required: true, max: 200 },
                {
                    name: 'account',
                    type: 'relation',
                    required: true,
                    collectionId: accounts.id,
                    cascadeDelete: false,
                    maxSelect: 1,
                },
                { name: 'inactive', type: 'bool' },
                { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                { name: 'sort_key', type: 'text', max: 1000 },
                ...AUTODATES,
            ],
            indexes: [
                'CREATE UNIQUE INDEX idx_books_tax_agencies_name ON books_tax_agencies (name_key)',
                'CREATE INDEX idx_books_tax_agencies_sort ON books_tax_agencies (sort_key, id)',
            ],
        })
        app.save(agencies)

        app.save(
            new Collection({
                id: 'pbc_books_tax_rates',
                name: 'books_tax_rates',
                type: 'base',
                ...RULES,
                fields: [
                    {
                        name: 'type',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['rate', 'group'],
                    },
                    { name: 'name', type: 'text', required: true, max: 200 },
                    { name: 'rate_ppm', type: 'number', onlyInt: true, min: 0, max: 1000000 },
                    {
                        name: 'agency',
                        type: 'relation',
                        collectionId: agencies.id,
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'is_default', type: 'bool' },
                    { name: 'inactive', type: 'bool' },
                    { name: 'name_key', type: 'text', hidden: true, max: 1000 },
                    { name: 'sort_key', type: 'text', max: 1000 },
                    ...AUTODATES,
                ],
            })
        )

        // The self-relation needs the collection to exist first.
        const rates = app.findCollectionByNameOrId('books_tax_rates')
        rates.fields.add(
            new RelationField({
                id: 'relation_books_tax_rates_components',
                name: 'components',
                collectionId: rates.id,
                cascadeDelete: false,
                maxSelect: 10,
            })
        )
        rates.indexes = [
            'CREATE UNIQUE INDEX idx_books_tax_rates_name ON books_tax_rates (name_key)',
            'CREATE INDEX idx_books_tax_rates_sort ON books_tax_rates (sort_key, id)',
            'CREATE INDEX idx_books_tax_rates_agency ON books_tax_rates (agency)',
            'CREATE UNIQUE INDEX idx_books_tax_rates_default ON books_tax_rates (is_default) WHERE is_default = 1',
        ]
        app.save(rates)

        const products = app.findCollectionByNameOrId('books_products')
        products.fields.add(new BoolField({ name: 'taxable' }))
        app.save(products)

        const customers = app.findCollectionByNameOrId('books_customers')
        customers.fields.add(new BoolField({ name: 'tax_exempt' }))
        customers.fields.add(
            new SelectField({
                name: 'exemption_reason',
                maxSelect: 1,
                // Must equal EXEMPTION_REASON_KEYS (tinycld/books/lib/exemption-reasons.ts);
                // tests/exemption-reasons.test.ts fails when they drift.
                values: [
                    'resale',
                    'federal_government',
                    'state_local_government',
                    'tribal_government',
                    'nonprofit',
                    'educational',
                    'agricultural',
                    'manufacturing',
                    'direct_pay',
                    'other',
                ],
            })
        )
        customers.fields.add(new TextField({ name: 'exemption_number', max: 100 }))
        customers.fields.add(
            new RelationField({
                name: 'default_tax_rate',
                collectionId: rates.id,
                cascadeDelete: false,
                maxSelect: 1,
            })
        )
        app.save(customers)
    },
    app => {
        const customers = app.findCollectionByNameOrId('books_customers')
        for (const name of ['tax_exempt', 'exemption_reason', 'exemption_number', 'default_tax_rate']) {
            customers.fields.removeByName(name)
        }
        app.save(customers)
        const products = app.findCollectionByNameOrId('books_products')
        products.fields.removeByName('taxable')
        app.save(products)
        app.delete(app.findCollectionByNameOrId('books_tax_rates'))
        app.delete(app.findCollectionByNameOrId('books_tax_agencies'))
    }
)
