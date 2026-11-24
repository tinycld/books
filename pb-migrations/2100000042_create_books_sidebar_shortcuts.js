/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// books_sidebar_shortcuts holds one row for each user who has arranged the Shortcuts
// section of the Books sidebar: `items` is the ordered list of `{ kind, ref }` the client
// reads and writes as one value (lib/sidebar-shortcuts.ts parses it and drops what it does
// not know). A user with no row sees the default shortcuts; a row with an empty list is a
// user who removed them all. The row is the user's own screen arrangement, not company
// data: only its user reads or writes it, it is not in the audit log, and it is deleted
// with its user.
//
// The rule constants repeat 2100000000's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const MINE = `${READ} && user = @request.auth.id`

migrate(
    app => {
        app.save(
            new Collection({
                id: 'pbc_books_shortcuts',
                name: 'books_sidebar_shortcuts',
                type: 'base',
                listRule: MINE,
                viewRule: MINE,
                createRule: `${READ} && @request.body.user = @request.auth.id`,
                updateRule: `${MINE} && @request.body.user:isset = false`,
                deleteRule: MINE,
                fields: [
                    {
                        name: 'user',
                        type: 'relation',
                        required: true,
                        collectionId: '_pb_users_auth_',
                        cascadeDelete: true,
                        maxSelect: 1,
                    },
                    // Not required: an empty list is a valid value, and PocketBase
                    // reads `[]` in a required json field as blank.
                    { name: 'items', type: 'json', maxSize: 20000 },
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_shortcuts_user ON books_sidebar_shortcuts (user)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_sidebar_shortcuts'))
    }
)
