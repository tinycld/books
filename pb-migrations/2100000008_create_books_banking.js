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
// name, format, size, content_hash, status and uploaded_by on a file. A
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
// The rule constants repeat 2100000005's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

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
        app.save(
            new Collection({
                id: 'pbc_books_bank_files',
                name: 'books_bank_files',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset('name', 'format', 'size', 'content_hash', 'status', 'uploaded_by')}`,
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
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bank_files_hash ON books_bank_files (content_hash)',
                    'CREATE INDEX idx_books_bank_files_connection ON books_bank_files (connection, created)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_bank_files'))
        app.delete(app.findCollectionByNameOrId('books_bank_connections'))
    }
)
