/// <reference path="../pb_data/types.d.ts" />

// Initial migration for books. Creates a single `books_items`
// collection matching the shape declared in types.ts / collections.ts.
// Replace or extend this as you build out the package.
//
// Auth rules: every TinyCld collection ships with rules. Without them
// PocketBase falls back to "superusers only". Each row has an `owner`
// relation to the user, and the rules allow access to that user only.

migrate(
    app => {
        const collection = new Collection({
            type: 'base',
            name: 'books_items',
            listRule: 'owner = @request.auth.id',
            viewRule: 'owner = @request.auth.id',
            createRule: 'owner = @request.auth.id',
            updateRule: 'owner = @request.auth.id',
            deleteRule: 'owner = @request.auth.id',
            fields: [
                {
                    name: 'name',
                    type: 'text',
                    required: true,
                    min: 1,
                    max: 200,
                },
                {
                    name: 'owner',
                    type: 'relation',
                    required: true,
                    collectionId: '_pb_users_auth_',
                    cascadeDelete: true,
                    maxSelect: 1,
                },
                {
                    name: 'created',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: false,
                },
                {
                    name: 'updated',
                    type: 'autodate',
                    onCreate: true,
                    onUpdate: true,
                },
            ],
            indexes: [
                'CREATE INDEX `idx_books_items_owner` ON `books_items` (`owner`)',
            ],
        })
        app.save(collection)
    },
    app => {
        const collection = app.findCollectionByNameOrId('books_items')
        app.delete(collection)
    }
)
