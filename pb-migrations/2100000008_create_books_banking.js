/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books banking: the bank and credit card accounts connected to Banking, and
// the statement files a person exports from the bank's website and uploads to
// one of them. Books has no live bank feed; every connection is by file. The
// import units parse a stored file into transactions later.
//
// AUTHORIZATION. The rules decide who may act, by Books level (books_access,
// 2100000000): every member with read access lists and views connections and
// files, a writer connects, edits the bank details, uploads, removes a file
// and disconnects. The Go hooks in server/banking.go decide whether the write
// is valid: the account a connection names, the upload's content, a duplicate
// file and a disconnect. A rule cannot look up another row or read a file's
// bytes, which is why those live in Go. The fields the server stamps are
// pinned with `@request.body.x:isset = false`: created_by on a connection, and
// name, format, size, content_hash, status, uploaded_by, statement_balance
// and statement_date on a file. A
// connection's account never changes; to use another account, disconnect and
// connect it.
//
// FILES. The file field is protected (only a request that passes the view rule
// with a file token reads it) and holds at most 5 MB. It has no mimeTypes
// list, because CSV and OFX files sniff as text/plain; the Go upload hook
// checks the extension and the content instead. A row holds one stored
// statement and a client never changes it (no update rule). status is
// `uploaded` until the import units set `imported` or `failed`; only an
// `uploaded` file can be removed. The unique content_hash index is the
// backstop of the Go duplicate check. Disconnecting deletes the connection's
// files (cascadeDelete on connection).
//
// IMPORT. A stored file's rows are parsed once, by the Go upload hook, into one
// books_bank_file_contents row (text cells per line; an OFX file in fixed
// columns). A person imports chosen lines by creating a books_bank_imports row
// with the column mapping; its Go hook (server/bank_import.go) maps the rows,
// skips duplicates, writes books_bank_transactions and sets the file to
// `imported`. Only Go writes the parsed rows and the transactions, so they have
// no client write rules; an import is never changed or removed. A file line is
// imported once (unique file, line) and a transaction once per connection
// (unique dedupe_hash).
//
// The rule constants repeat 2100000005's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
// The ledger migration's MAX_AMOUNT: money is integer minor units.
const MAX_AMOUNT = 1000000000000000
// server/bank_values.go bankDateFormats; TestBankDateFormats_MatchTheSchema
// fails when the two drift.
const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YY', 'DD/MM/YY']
const column = name => ({ name, type: 'number', onlyInt: true, min: 0 })
const relation = (name, collectionId, cascadeDelete) => ({
    name,
    type: 'relation',
    required: true,
    collectionId,
    cascadeDelete,
    maxSelect: 1,
})

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
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const connections = new Collection({
            id: 'pbc_books_bank_conns',
            name: 'books_bank_connections',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: `${WRITE} && ${unset('created_by')}`,
            updateRule: `${WRITE} && ${unset('account', 'created_by')}`,
            deleteRule: WRITE,
            fields: [
                {
                    name: 'account',
                    type: 'relation',
                    required: true,
                    collectionId: accounts.id,
                    cascadeDelete: false,
                    maxSelect: 1,
                },
                { name: 'institution', type: 'text', max: 100 },
                { name: 'account_mask', type: 'text', max: 4, pattern: '^(\\d{4})?$' },
                userRef('created_by'),
                ...AUTODATES,
            ],
            indexes: [
                'CREATE UNIQUE INDEX idx_books_bank_connections_account ON books_bank_connections (account)',
            ],
        })
        app.save(connections)
        const files = new Collection({
            id: 'pbc_books_bank_files',
            name: 'books_bank_files',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: `${WRITE} && ${unset('name', 'format', 'size', 'content_hash', 'status', 'uploaded_by', 'statement_balance', 'statement_date')}`,
            updateRule: null,
            deleteRule: `${WRITE} && status = "uploaded"`,
            fields: [
                {
                    name: 'connection',
                    type: 'relation',
                    required: true,
                    collectionId: connections.id,
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    name: 'file',
                    type: 'file',
                    required: true,
                    maxSelect: 1,
                    maxSize: 5242880,
                    protected: true,
                },
                { name: 'name', type: 'text', max: 255 },
                // Required: the parser reads it, and the upload hook stamps it
                // before PocketBase validates the row.
                {
                    name: 'format',
                    type: 'select',
                    required: true,
                    maxSelect: 1,
                    values: ['csv', 'ofx'],
                },
                { name: 'size', type: 'number', onlyInt: true, min: 0 },
                // Required: a blank hash would make the unique index refuse the
                // second hash-less row with a raw constraint error, not a message.
                { name: 'content_hash', type: 'text', required: true, max: 64 },
                {
                    name: 'status',
                    type: 'select',
                    required: true,
                    maxSelect: 1,
                    values: ['uploaded', 'imported', 'failed'],
                },
                userRef('uploaded_by'),
                // OFX only, stamped from the file: the statement's ledger balance
                // in minor units as the bank states it (a card's balance owed is
                // usually negative) and its day. 0 and '' for a CSV file.
                { name: 'statement_balance', type: 'number', onlyInt: true },
                { name: 'statement_date', type: 'text', max: 10, pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
                ...AUTODATES,
            ],
            indexes: [
                'CREATE UNIQUE INDEX idx_books_bank_files_hash ON books_bank_files (content_hash)',
                'CREATE INDEX idx_books_bank_files_connection ON books_bank_files (connection, created)',
            ],
        })
        app.save(files)
        app.save(
            new Collection({
                id: 'pbc_books_bank_rows',
                name: 'books_bank_file_contents',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('file', files.id, true),
                    column('columns'),
                    // Up to 10,000 rows of a 5 MB file; server/banking.go refuses a
                    // file whose rows encode larger than this before it saves.
                    { name: 'rows', type: 'json', maxSize: 20971520 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bank_file_contents_file ON books_bank_file_contents (file)',
                ],
            })
        )
        const imports = new Collection({
            id: 'pbc_books_bank_imps',
            name: 'books_bank_imports',
            type: 'base',
            listRule: READ,
            viewRule: READ,
            createRule: `${WRITE} && ${unset('imported', 'duplicates', 'created_by')}`,
            updateRule: null,
            deleteRule: null,
            fields: [
                relation('file', files.id, false),
                { name: 'header_row', type: 'bool' },
                // Columns are 1-based; 0 is "not chosen".
                column('date_column'),
                { name: 'date_format', type: 'select', maxSelect: 1, values: DATE_FORMATS },
                column('description_column'),
                { name: 'amount_columns', type: 'select', maxSelect: 1, values: ['one', 'two'] },
                column('amount_column'),
                column('money_in_column'),
                column('money_out_column'),
                { name: 'amount_sign', type: 'select', maxSelect: 1, values: ['in_positive', 'out_positive'] },
                // The chosen file line numbers.
                { name: 'lines', type: 'json', maxSize: 1048576 },
                column('imported'),
                column('duplicates'),
                userRef('created_by'),
                ...AUTODATES,
            ],
            indexes: ['CREATE INDEX idx_books_bank_imports_file ON books_bank_imports (file, created)'],
        })
        app.save(imports)
        app.save(
            new Collection({
                id: 'pbc_books_bank_txns',
                name: 'books_bank_transactions',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('connection', connections.id, false),
                    relation('file', files.id, false),
                    relation('bank_import', imports.id, false),
                    { name: 'line', type: 'number', onlyInt: true, min: 1 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'description', type: 'text', max: 500 },
                    { name: 'memo', type: 'text', max: 500 },
                    // Signed minor units: money in is positive.
                    { name: 'amount', type: 'number', onlyInt: true, min: -MAX_AMOUNT, max: MAX_AMOUNT },
                    { name: 'fitid', type: 'text', max: 255 },
                    { name: 'check_number', type: 'text', max: 32 },
                    { name: 'dedupe_hash', type: 'text', required: true, max: 64 },
                    {
                        name: 'status',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['for_review', 'reviewed', 'excluded'],
                    },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bank_transactions_hash ON books_bank_transactions (dedupe_hash)',
                    'CREATE UNIQUE INDEX idx_books_bank_transactions_line ON books_bank_transactions (file, line)',
                    'CREATE INDEX idx_books_bank_transactions_review ON books_bank_transactions (connection, status, date)',
                ],
            })
        )
    },
    app => {
        for (const name of [
            'books_bank_transactions',
            'books_bank_imports',
            'books_bank_file_contents',
            'books_bank_files',
            'books_bank_connections',
        ]) {
            app.delete(app.findCollectionByNameOrId(name))
        }
    }
)
