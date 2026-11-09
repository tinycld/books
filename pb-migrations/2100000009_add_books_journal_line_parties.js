/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// The customer or vendor of a journal line ("Name" in the line table). A line
// names one customer or one vendor, never both, and both are optional. The Go
// line guards (server/lines.go) refuse both, an inactive party on a new or
// changed line, and a change after posting; the customer and vendor delete
// guards refuse to delete a party named on a line, because PocketBase would
// otherwise blank these optional relations on delete and the line would lose
// its name silently. cascadeDelete is off: a delete never removes a line.
//
// This is its own migration, not part of 2100000002, because the ledger
// migration runs before the customers (2100000003) and vendors (2100000004)
// collections exist.
migrate(
    app => {
        const customers = app.findCollectionByNameOrId('books_customers')
        const vendors = app.findCollectionByNameOrId('books_vendors')
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        lines.fields.add(
            new RelationField({
                name: 'customer',
                collectionId: customers.id,
                cascadeDelete: false,
                maxSelect: 1,
            })
        )
        lines.fields.add(
            new RelationField({
                name: 'vendor',
                collectionId: vendors.id,
                cascadeDelete: false,
                maxSelect: 1,
            })
        )
        app.save(lines)
    },
    app => {
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        for (const name of ['customer', 'vendor']) {
            lines.fields.removeByName(name)
        }
        app.save(lines)
    }
)
