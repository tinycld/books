/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books access levels.
//
// A user's Books level is none, read_only, bookkeeper or admin. The first three
// come from core's per-package access (org_pkg_access, managed in Settings >
// Members): none -> none, readonly -> read_only, full -> bookkeeper. Admin is
// Books' own grant on top of full: an org owner or admin always, or a user with
// a books_admins row whose core level is full. A books_admins row never raises
// a none or read-only user.
//
// books_access computes the level per user in SQL with the same resolution as
// core's pkgaccess.LevelFor (owner/admin full; member full unless a row
// restricts; guest none unless a row grants). Every Books rule reads this view,
// the Go server reads it (server/access.go) and the client reads it
// (hooks/useBooksAccess.ts), so the three cannot disagree.
// server/access_test.go pins it against pkgaccess.LevelFor.
//
// A view, not a stored table: a stored level needs hooks on core's users and
// org_pkg_access to stay in step, and one missed write leaves a user with
// access they lost. A view cannot drift.
//
// The subquery takes the oldest org_pkg_access row, as LevelFor's unsorted
// first row does, so a duplicate row cannot split the two resolutions.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const ADMIN = `${AUTH} && ${ME} && @collection.books_access:me.is_admin ?= true`

const CORE_ACCESS = `COALESCE(
        (SELECT a.access FROM org_pkg_access a
            WHERE a.user = u.id AND a.pkg = 'books' ORDER BY a.rowid LIMIT 1),
        CASE WHEN u.role = 'guest' THEN 'none' ELSE 'full' END)`

const LEVEL = `CASE
        WHEN u.role IN ('owner', 'admin') THEN 'admin'
        WHEN ${CORE_ACCESS} = 'none' THEN 'none'
        WHEN ${CORE_ACCESS} = 'readonly' THEN 'read_only'
        WHEN EXISTS (SELECT 1 FROM books_admins b WHERE b.user = u.id) THEN 'admin'
        ELSE 'bookkeeper'
    END`

migrate(
    app => {
        const admins = new Collection({
            id: 'pbc_books_admins',
            name: 'books_admins',
            type: 'base',
            fields: [
                {
                    name: 'user',
                    type: 'relation',
                    required: true,
                    collectionId: '_pb_users_auth_',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
            ],
            indexes: ['CREATE UNIQUE INDEX idx_books_admins_user ON books_admins (user)'],
        })
        app.save(admins)

        app.save(
            new Collection({
                id: 'pbc_books_access',
                name: 'books_access',
                type: 'view',
                viewQuery: `SELECT
                    u.id AS id,
                    u.id AS user,
                    CAST(${LEVEL} AS TEXT) AS level,
                    CAST((${LEVEL}) != 'none' AS BOOLEAN) AS can_read,
                    CAST((${LEVEL}) IN ('bookkeeper', 'admin') AS BOOLEAN) AS can_write,
                    CAST((${LEVEL}) = 'admin' AS BOOLEAN) AS is_admin
                FROM users u`,
            })
        )

        // Rules last: they read the view, which must exist first.
        const view = app.findCollectionByNameOrId('books_access')
        view.listRule = `${AUTH} && (user = @request.auth.id || (${ME} && @collection.books_access:me.is_admin ?= true))`
        view.viewRule = view.listRule
        app.save(view)

        const grants = app.findCollectionByNameOrId('books_admins')
        grants.listRule = READ
        grants.viewRule = READ
        grants.createRule = ADMIN
        grants.updateRule = null
        grants.deleteRule = ADMIN
        app.save(grants)
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_access'))
        app.delete(app.findCollectionByNameOrId('books_admins'))
    }
)
