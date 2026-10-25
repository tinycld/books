/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// The Books ledger: accounts, journal entries, journal lines and the monthly
// balance rows reports read.
//
// AUTHORIZATION. The rules decide who may act, by Books level (books_access,
// 2100000000). The Go hooks in server/ decide whether the act is valid:
// posting checks, immutability of posted entries, numbering, reversals. A rule
// cannot see an entry's lines or count anything, which is why those live in Go.
//
// SERVER-OWNED FIELDS are pinned with `@request.body.x:isset = false`: number,
// sequence, total, who and when, currency, the close override; on lines,
// posted, date and currency. Books sets them in Go. origin, doc_type, reverses
// and replaces are fixed once the entry exists.
//
// A client creates only drafts, with origin manual, reversal or
// opening_balance. It edits only drafts, or moves a posted entry to void. It
// deletes only drafts.
//
// MONEY is integer minor units (onlyInt), at most 10^15 per line. Go refuses a
// post whose entry total or account-month balance would pass 2^53-1, the
// largest integer a number field (float64) stores exactly. total is Books-owned:
// Books restates it as the sum of the debits on every draft line write, and
// stamps it again at post. currency is optional
// in the schema because Go stamps it from books_settings on create.
//
// DATES are YYYY-MM-DD text: an accounting date is a calendar day with no time
// zone, and a PocketBase datetime would shift it a day for anyone west of UTC.
// Lexical order is date order, so indexes and range filters work on the text.
//
// UNIQUENESS. One posted entry holds a number per document type; a void's
// reversal shares the voided entry's number, and an edit's correction takes
// the number of the voided original, so the index counts only posted entries
// that are not void reversals. At most one posted reversal exists per entry.
//
// The rule constants repeat 2100000000's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

// Must equal the keys of server/account_types.json (server/account_types_test.go).
const ACCOUNT_TYPES = [
    'bank',
    'accounts_receivable',
    'other_current_asset',
    'fixed_asset',
    'other_asset',
    'accounts_payable',
    'credit_card',
    'other_current_liability',
    'long_term_liability',
    'equity',
    'income',
    'other_income',
    'cost_of_goods_sold',
    'expense',
    'other_expense',
]

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const OPTIONAL_DAY = '^(\\d{4}-\\d{2}-\\d{2})?$'
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'
const MAX_AMOUNT = 1000000000000000

const ENTRY_SERVER_FIELDS = [
    'number',
    'sequence',
    'total',
    'posted_at',
    'posted_by',
    'voided_at',
    'voided_by',
    'created_by',
    'close_override',
    'currency',
]
const LINE_SERVER_FIELDS = ['posted', 'date', 'currency']

const AUTODATES = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]
const userRef = name => ({
    name,
    type: 'relation',
    collectionId: '_pb_users_auth_',
    cascadeDelete: false,
    maxSelect: 1,
})

migrate(
    app => {
        // Phase 1: collections without self-relations or rules.
        app.save(
            new Collection({
                id: 'pbc_books_accounts',
                name: 'books_accounts',
                type: 'base',
                fields: [
                    { name: 'name', type: 'text', required: true, max: 200 },
                    { name: 'number', type: 'text', max: 20, pattern: '^[0-9A-Za-z.-]*$' },
                    { name: 'type', type: 'select', required: true, maxSelect: 1, values: ACCOUNT_TYPES },
                    { name: 'detail_type', type: 'text', required: true, max: 60 },
                    { name: 'description', type: 'text', max: 1000 },
                    { name: 'inactive', type: 'bool' },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    ...AUTODATES,
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_jentries',
                name: 'books_journal_entries',
                type: 'base',
                fields: [
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    {
                        name: 'status',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['draft', 'posted', 'void'],
                    },
                    { name: 'doc_type', type: 'select', required: true, maxSelect: 1, values: ['journal'] },
                    {
                        name: 'origin',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['manual', 'reversal', 'auto_reversal', 'void_reversal', 'opening_balance'],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    { name: 'memo', type: 'text', max: 4000 },
                    { name: 'total', type: 'number', onlyInt: true, min: 0 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    { name: 'auto_reverse_on', type: 'text', max: 10, pattern: OPTIONAL_DAY },
                    { name: 'posted_at', type: 'date' },
                    userRef('posted_by'),
                    { name: 'voided_at', type: 'date' },
                    userRef('voided_by'),
                    userRef('created_by'),
                    {
                        name: 'close_override',
                        type: 'relation',
                        collectionId: 'pbc_books_closeov',
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    ...AUTODATES,
                ],
            })
        )

        // Phase 2: self-relations, now that each collection exists.
        const accounts = app.findCollectionByNameOrId('books_accounts')
        accounts.fields.add(
            new RelationField({
                name: 'parent',
                collectionId: 'pbc_books_accounts',
                cascadeDelete: false,
                maxSelect: 1,
            })
        )
        accounts.indexes = [
            "CREATE UNIQUE INDEX idx_books_accounts_number ON books_accounts (number) WHERE number != ''",
            'CREATE UNIQUE INDEX idx_books_accounts_name ON books_accounts (parent, name COLLATE NOCASE)',
            'CREATE INDEX idx_books_accounts_parent ON books_accounts (parent)',
        ]
        app.save(accounts)

        const entries = app.findCollectionByNameOrId('books_journal_entries')
        for (const name of ['reverses', 'replaces']) {
            entries.fields.add(
                new RelationField({ name, collectionId: 'pbc_books_jentries', cascadeDelete: false, maxSelect: 1 })
            )
        }
        entries.indexes = [
            "CREATE UNIQUE INDEX idx_books_je_sequence ON books_journal_entries (doc_type, sequence) WHERE sequence > 0 AND status = 'posted' AND origin != 'void_reversal'",
            "CREATE UNIQUE INDEX idx_books_je_one_reversal ON books_journal_entries (reverses) WHERE reverses != '' AND status = 'posted'",
            // Serves the highest-issued-number read that runs on every post.
            // It counts void entries too, so the unique index above cannot.
            "CREATE INDEX idx_books_je_doc_sequence ON books_journal_entries (doc_type, sequence) WHERE sequence > 0",
            // Serves the auto-reverse sweep's "has a reversal" lookup, which
            // counts voided reversals too, so the posted-only index above cannot.
            "CREATE INDEX idx_books_je_reverses ON books_journal_entries (reverses) WHERE reverses != ''",
            'CREATE INDEX idx_books_je_date ON books_journal_entries (date)',
            'CREATE INDEX idx_books_je_status_date ON books_journal_entries (status, date)',
            "CREATE INDEX idx_books_je_auto_reverse ON books_journal_entries (auto_reverse_on) WHERE auto_reverse_on != ''",
        ]
        app.save(entries)

        app.save(
            new Collection({
                id: 'pbc_books_jlines',
                name: 'books_journal_lines',
                type: 'base',
                fields: [
                    {
                        name: 'entry',
                        type: 'relation',
                        required: true,
                        collectionId: 'pbc_books_jentries',
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    {
                        name: 'account',
                        type: 'relation',
                        required: true,
                        collectionId: 'pbc_books_accounts',
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'debit', type: 'number', onlyInt: true, min: 0, max: MAX_AMOUNT },
                    { name: 'credit', type: 'number', onlyInt: true, min: 0, max: MAX_AMOUNT },
                    { name: 'memo', type: 'text', max: 1000 },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    { name: 'posted', type: 'bool' },
                    { name: 'date', type: 'text', max: 10, pattern: OPTIONAL_DAY },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_jlines_entry ON books_journal_lines (entry, position)',
                    'CREATE INDEX idx_books_jlines_account_date ON books_journal_lines (account, date)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_balances',
                name: 'books_account_balances',
                type: 'base',
                fields: [
                    {
                        name: 'account',
                        type: 'relation',
                        required: true,
                        collectionId: 'pbc_books_accounts',
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    { name: 'period', type: 'text', required: true, max: 7, pattern: '^\\d{4}-\\d{2}$' },
                    { name: 'debit_total', type: 'number', onlyInt: true, min: 0 },
                    { name: 'credit_total', type: 'number', onlyInt: true, min: 0 },
                    { name: 'currency', type: 'text', required: true, pattern: '^[A-Z]{3}$' },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_balances_account_period ON books_account_balances (account, period)',
                    'CREATE INDEX idx_books_balances_period ON books_account_balances (period)',
                ],
            })
        )

        // Phase 3: rules.
        const rules = {
            books_accounts: {
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset('currency')}`,
                updateRule: `${WRITE} && ${unset('currency')}`,
                deleteRule: WRITE,
            },
            books_journal_entries: {
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && (@request.body.origin = "manual" || @request.body.origin = "reversal" || @request.body.origin = "opening_balance") && ${unset(...ENTRY_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...ENTRY_SERVER_FIELDS, 'origin', 'doc_type', 'reverses', 'replaces')} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
            },
            books_journal_lines: {
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...LINE_SERVER_FIELDS, 'entry')}`,
                deleteRule: WRITE,
            },
            books_account_balances: {
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
            },
        }
        for (const [name, r] of Object.entries(rules)) {
            const col = app.findCollectionByNameOrId(name)
            Object.assign(col, r)
            app.save(col)
        }
    },
    app => {
        for (const name of [
            'books_account_balances',
            'books_journal_lines',
            'books_journal_entries',
            'books_accounts',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
