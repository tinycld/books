/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books attachments: the files a writer keeps with a bill or an expense (the
// vendor's bill, a receipt), and the files of a custom File field on the bill
// and expense forms (the forms hosts' `files` storage, forms/hosts.ts).
//
// AUTHORIZATION. The rules decide who may act, by Books level (books_access,
// 2100000000): every member with read access lists and views the rows and
// reads the files, a writer adds and removes them. The Go hooks in
// server/attachments.go decide whether the write is valid: exactly one parent,
// a parent that is not void, at most 25 rows per document (a correction counts
// the rows of the document it replaces), and the upload's size and type. The
// server stamps name, size and uploaded_by from the upload and the request's
// user, whatever the client sent; core FileField sends size and its uploader,
// so the create rule does not refuse them. A row never changes (no update
// rule): the only updates are the server's move of a corrected document's
// files to the correction when it posts, and its store of the thumbnail.
//
// FILES. The file field is protected (only a request that passes the view rule
// with a file token reads it), holds one file of at most 20 MB, and takes only
// the allow-list below: HTML, SVG and executables are refused, because a stored
// file opens from the app's own origin. server/attachments.go holds the same
// list (attachmentMimeTypes) and checks it first, so the refusal is a message
// the client keeps. thumbs declares the 40 px box core Thumbnail asks for.
//
// THUMBNAIL. For a type core renders (a HEIC or HEIF photo, a WebP, a PDF, an
// office document), a background job stores a generated JPEG of at most
// 480 x 360 in thumbnail after the create (server/attachment_thumbnails.go);
// core Thumbnail asks ?thumb=40x40 of it too. Any other row has none. The
// update guard admits that one write. Quota counts size only: the thumbnail
// is not the person's file.
//
// field is empty for the Attachments section and a custom File field's key
// otherwise. Deleting a draft bill or expense deletes its rows and files
// (cascadeDelete).
//
// The rule constants repeat 2100000008's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`

const MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/plain',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const AUTODATES = [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
]

const parentRef = (name, collectionId) => ({
    name,
    type: 'relation',
    required: false,
    collectionId,
    cascadeDelete: true,
    maxSelect: 1,
})

migrate(
    app => {
        const bills = app.findCollectionByNameOrId('books_bills')
        const expenses = app.findCollectionByNameOrId('books_expenses')
        app.save(
            new Collection({
                id: 'pbc_books_attachments',
                name: 'books_attachments',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: null,
                deleteRule: WRITE,
                fields: [
                    parentRef('bill', bills.id),
                    parentRef('expense', expenses.id),
                    { name: 'field', type: 'text', max: 40 },
                    {
                        name: 'file',
                        type: 'file',
                        required: true,
                        maxSelect: 1,
                        maxSize: 20971520,
                        protected: true,
                        thumbs: ['40x40'],
                        mimeTypes: MIME_TYPES,
                    },
                    {
                        name: 'thumbnail',
                        type: 'file',
                        required: false,
                        maxSelect: 1,
                        maxSize: 2097152,
                        protected: true,
                        thumbs: ['40x40'],
                        mimeTypes: ['image/jpeg'],
                    },
                    { name: 'name', type: 'text', max: 255 },
                    { name: 'size', type: 'number', onlyInt: true, min: 0 },
                    {
                        name: 'uploaded_by',
                        type: 'relation',
                        collectionId: '_pb_users_auth_',
                        cascadeDelete: false,
                        maxSelect: 1,
                    },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_attachments_bill ON books_attachments (bill, created)',
                    'CREATE INDEX idx_books_attachments_expense ON books_attachments (expense, created)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_attachments'))
    }
)
