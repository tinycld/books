/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books settings, document number sequences and close-date overrides.
//
// books_settings holds one row (id bookssettings01): the close date, the fiscal
// year start month, the currency, the business name and its contact details
// (tax_id, address, phone, email, website; all optional), the ownership choice
// (owners or corporation; empty until the setup wizard saves it, and read later
// by tax settings) and whether the setup wizard has run. v0 keeps one currency;
// the column exists so multi-currency needs no migration, and it is pinned
// against edits because changing it under existing entries would misstate every
// amount.
//
// books_doc_sequences holds one row per document type. Books advances
// next_number inside the posting transaction (server/numbering.go); an admin
// may edit the prefix and move next_number forward (server/sequences.go
// refuses moving it back over issued numbers). Later phases add a row per
// document type here while this migration is unreleased.
//
// books_close_overrides lets one user post into the closed period until an
// expiry, with a reason. It is the log of that permission, so it is never
// deleted: revoking moves expires_at to now (server/overrides.go refuses any
// other edit). Its user relation does not cascade, so a user an override names
// cannot be hard-deleted; core offboarding anonymizes instead.
//
// The rule constants repeat 2100000000's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const ADMIN = `${AUTH} && ${ME} && @collection.books_access:me.is_admin ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const AUTODATES = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]

migrate(
    app => {
        const settings = new Collection({
            id: 'pbc_books_settings',
            name: 'books_settings',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: null,
            updateRule: `${ADMIN} && ${unset('currency')}`,
            deleteRule: null,
            fields: [
                { name: 'close_date', type: 'text', max: 10, pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
                {
                    name: 'fiscal_year_start_month',
                    type: 'number',
                    required: true,
                    onlyInt: true,
                    min: 1,
                    max: 12,
                },
                { name: 'currency', type: 'text', required: true, pattern: '^[A-Z]{3}$' },
                { name: 'business_name', type: 'text', max: 200 },
                { name: 'tax_id', type: 'text', max: 20 },
                { name: 'address', type: 'text', max: 500 },
                { name: 'phone', type: 'text', max: 40 },
                { name: 'email', type: 'text', max: 200 },
                { name: 'website', type: 'text', max: 200 },
                { name: 'ownership', type: 'select', maxSelect: 1, values: ['owners', 'corporation'] },
                { name: 'setup_completed', type: 'bool' },
                ...AUTODATES,
            ],
        })
        app.save(settings)
        const row = new Record(settings)
        row.set('id', 'bookssettings01')
        row.set('close_date', '')
        row.set('fiscal_year_start_month', 1)
        row.set('currency', 'USD')
        row.set('business_name', '')
        for (const f of ['tax_id', 'address', 'phone', 'email', 'website']) row.set(f, '')
        row.set('ownership', '')
        row.set('setup_completed', false)
        app.save(row)

        const sequences = new Collection({
            id: 'pbc_books_docseq',
            name: 'books_doc_sequences',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: null,
            updateRule: `${ADMIN} && ${unset('doc_type')}`,
            deleteRule: null,
            fields: [
                { name: 'doc_type', type: 'select', required: true, maxSelect: 1, values: ['journal'] },
                { name: 'prefix', type: 'text', max: 10, pattern: '^[A-Za-z0-9-]*$' },
                {
                    name: 'next_number',
                    type: 'number',
                    required: true,
                    onlyInt: true,
                    min: 1,
                    max: 999999999,
                },
                ...AUTODATES,
            ],
            indexes: ['CREATE UNIQUE INDEX idx_books_docseq_type ON books_doc_sequences (doc_type)'],
        })
        app.save(sequences)
        const journal = new Record(sequences)
        journal.set('id', 'booksseqjournal')
        journal.set('doc_type', 'journal')
        journal.set('prefix', '')
        journal.set('next_number', 1)
        app.save(journal)

        app.save(
            new Collection({
                id: 'pbc_books_closeov',
                name: 'books_close_overrides',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${ADMIN} && ${unset('granted_by')}`,
                updateRule: `${ADMIN} && ${unset('user', 'reason', 'granted_by')}`,
                deleteRule: null,
                fields: [
                    {
                        name: 'user',
                        type: 'relation',
                        required: true,
                        collectionId: '_pb_users_auth_',
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'reason', type: 'text', required: true, min: 3, max: 500 },
                    { name: 'expires_at', type: 'date', required: true },
                    {
                        name: 'granted_by',
                        type: 'relation',
                        collectionId: '_pb_users_auth_',
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    ...AUTODATES,
                ],
                indexes: ['CREATE INDEX idx_books_closeov_user ON books_close_overrides (user, expires_at)'],
            })
        )
    },
    app => {
        for (const name of ['books_close_overrides', 'books_doc_sequences', 'books_settings']) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
