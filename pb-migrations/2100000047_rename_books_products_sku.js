/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// A product's SKU becomes its vendor part number (vendor_part_no): free text of at most
// 100 characters that may repeat, such as the number a supplier sells the item under. The
// product's own identifier is its code (2100000046). The rename keeps each row's value.
//
// SEARCH. fts_books_products is rebuilt with the renamed column (the shape of
// 2100000046); server/search_index.go names the same columns.
const COLUMNS_BEFORE = ['code', 'name', 'sku', 'sales_description']
const COLUMNS_AFTER = ['code', 'name', 'vendor_part_no', 'sales_description']

function rebuildSearch(app, columns) {
    const list = columns.join(', ')
    app.db().newQuery('DROP TABLE IF EXISTS fts_books_products').execute()
    app.db()
        .newQuery(
            `CREATE VIRTUAL TABLE fts_books_products USING fts5(record_id UNINDEXED, ${list}, tokenize='porter unicode61')`
        )
        .execute()
    app.db()
        .newQuery(`INSERT INTO fts_books_products (record_id, ${list}) SELECT id, ${list} FROM books_products`)
        .execute()
}

function renameField(app, from, to) {
    const products = app.findCollectionByNameOrId('books_products')
    products.fields.getByName(from).name = to
    app.save(products)
}

migrate(
    app => {
        renameField(app, 'sku', 'vendor_part_no')
        rebuildSearch(app, COLUMNS_AFTER)
    },
    app => {
        renameField(app, 'vendor_part_no', 'sku')
        rebuildSearch(app, COLUMNS_BEFORE)
    }
)
