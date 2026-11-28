/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books bin locations (inventory-adjust spec §4): the places stock is kept, the
// quantity of each item in each bin, and the moves of stock between bins.
//
// BINS are a list a writer keeps: a name (unique without regard to case), a note
// and an inactive mark. sort_key is the name case- and accent-folded; only the
// Go guard sets it, on every create and update, whatever the request sent
// (validateBin, server/bins.go). The bin list sorts and pages on (sort_key, id),
// so it is not hidden. The Go guard refuses the delete of a bin while anything
// names it.
//
// BIN STOCK is derived: one row for each item and bin that ever held stock, its
// quantity in that bin. bin '' is No bin. Only Books writes it (no create, update
// or delete rule; server/bin_stock.go is its one writer); every Books reader lists
// it. The rows of an item add up to its quantity on hand.
//
// BIN TRANSFERS are moves of a quantity of one item from one bin to another ('' is
// No bin on either side). A writer creates one; created_by belongs to the server.
// There is no update and no delete rule: a move back corrects a move.
//
// PRODUCTS gain default_bin (the bin a stock move that names none goes to) and
// low_stock (server-written: reorder point above 0 and quantity on hand at or
// below it). ADJUSTMENT LINES gain bin, posted_value (the sum of the values of
// the line's stock moves, written at the post and kept by a void; the create and
// update rules keep it unset) and value_given (the writer's: true when the line's
// value was typed, so an increase at a typed 0 comes in at 0, not at the last
// cost). ADJUSTMENTS gain value_change (the sum of
// the values of its stock moves, written at the post), replaces (the posted
// adjustment a correction replaces, set at create only) and replaced_by (written
// by the server); the create and update rules are set again with those server
// fields. STOCK MOVES gain bin and document_number (the number of the move's
// document), both written by the server.
//
// Books search over inventory adjustments: fts_books_inventory_adjustments, as
// fts_books_purchase_orders (2100000048).
//
// The rule constants repeat 2100000038's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const MAX_QUANTITY = 1000000
const MAX_STORED = 9007199254740991

// The server fields of 2100000038, with the server fields of this migration.
const ADJUSTMENT_SERVER_FIELDS = [
    'number',
    'sequence',
    'currency',
    'entry',
    'source',
    'document',
    'posted_by',
    'posted_at',
    'voided_by',
    'voided_at',
    'sort_key',
    'value_change',
    'replaced_by',
]
// The rules of 2100000038, for the down step.
const SHIPPED_ADJUSTMENT_SERVER_FIELDS = ADJUSTMENT_SERVER_FIELDS.filter(
    f => f !== 'value_change' && f !== 'replaced_by'
)
// The line field only Books writes: posted_value, the sum of the values of the
// line's stock moves, written at the post (server/inventory_adjustments.go).
const LINE_SERVER_FIELDS = ['posted_value']
const adjustmentCreateRule = fields =>
    `${WRITE} && @request.body.status = "draft" && @request.body.kind = "manual" && ${unset(...fields)}`
const adjustmentUpdateRule = (...fields) =>
    `${WRITE} && ${unset(...fields, 'kind')} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`

const NEW_INDEXES = [
    ['books_products', 'idx_books_products_default_bin', 'CREATE INDEX idx_books_products_default_bin ON books_products (default_bin)'],
    ['books_products', 'idx_books_products_low_stock', 'CREATE INDEX idx_books_products_low_stock ON books_products (low_stock)'],
    ['books_stock_moves', 'idx_books_stock_moves_bin', 'CREATE INDEX idx_books_stock_moves_bin ON books_stock_moves (bin)'],
    [
        'books_inventory_adjustment_lines',
        'idx_books_inv_adjust_ln_bin',
        'CREATE INDEX idx_books_inv_adjust_ln_bin ON books_inventory_adjustment_lines (bin)',
    ],
    [
        'books_inventory_adjustments',
        'idx_books_inv_adjust_replaces',
        'CREATE INDEX idx_books_inv_adjust_replaces ON books_inventory_adjustments (replaces)',
    ],
]

const relation = (name, collectionId, extra = {}) => ({
    name,
    type: 'relation',
    collectionId,
    cascadeDelete: false,
    maxSelect: 1,
    ...extra,
})

migrate(
    app => {
        const products = app.findCollectionByNameOrId('books_products')

        app.save(
            new Collection({
                id: 'pbc_books_bins',
                name: 'books_bins',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: WRITE,
                deleteRule: WRITE,
                fields: [
                    { name: 'name', type: 'text', required: true, max: 100 },
                    { name: 'note', type: 'text', max: 500 },
                    { name: 'inactive', type: 'bool' },
                    { name: 'sort_key', type: 'text', max: 200 },
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bins_name ON books_bins (lower(name))',
                    'CREATE INDEX idx_books_bins_sort ON books_bins (sort_key, id)',
                ],
            })
        )
        const bins = app.findCollectionByNameOrId('books_bins')

        app.save(
            new Collection({
                id: 'pbc_books_bin_stock',
                name: 'books_bin_stock',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('product', products.id, { required: true, cascadeDelete: true }),
                    // Empty is No bin.
                    relation('bin', bins.id),
                    { name: 'quantity', type: 'number' },
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_bin_stock_product_bin ON books_bin_stock (product, bin)',
                    'CREATE INDEX idx_books_bin_stock_bin ON books_bin_stock (bin)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_bin_xfers',
                name: 'books_bin_transfers',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && ${unset('created_by')}`,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('product', products.id, { required: true }),
                    // Empty is No bin on either side.
                    relation('from_bin', bins.id),
                    relation('to_bin', bins.id),
                    { name: 'quantity', type: 'number', min: 0.01, max: MAX_QUANTITY },
                    { name: 'memo', type: 'text', max: 200 },
                    relation('created_by', '_pb_users_auth_'),
                    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                ],
                indexes: [
                    'CREATE INDEX idx_books_bin_transfers_product ON books_bin_transfers (product, created)',
                    'CREATE INDEX idx_books_bin_transfers_from_bin ON books_bin_transfers (from_bin)',
                    'CREATE INDEX idx_books_bin_transfers_to_bin ON books_bin_transfers (to_bin)',
                    'CREATE INDEX idx_books_bin_transfers_created_by ON books_bin_transfers (created_by)',
                ],
            })
        )

        products.fields.add(new RelationField({ name: 'default_bin', collectionId: bins.id, cascadeDelete: false, maxSelect: 1 }))
        products.fields.add(new BoolField({ name: 'low_stock' }))
        app.save(products)

        const lines = app.findCollectionByNameOrId('books_inventory_adjustment_lines')
        lines.fields.add(new RelationField({ name: 'bin', collectionId: bins.id, cascadeDelete: false, maxSelect: 1 }))
        lines.fields.add(
            new NumberField({ name: 'posted_value', onlyInt: true, min: -MAX_STORED, max: MAX_STORED })
        )
        lines.fields.add(new BoolField({ name: 'value_given' }))
        lines.createRule = `${WRITE} && ${unset(...LINE_SERVER_FIELDS)}`
        lines.updateRule = `${WRITE} && ${unset(...LINE_SERVER_FIELDS)}`
        app.save(lines)

        const adjustments = app.findCollectionByNameOrId('books_inventory_adjustments')
        adjustments.fields.add(
            new NumberField({ name: 'value_change', onlyInt: true, min: -MAX_STORED, max: MAX_STORED })
        )
        adjustments.fields.add(
            new RelationField({ name: 'replaces', collectionId: adjustments.id, cascadeDelete: false, maxSelect: 1 })
        )
        adjustments.fields.add(
            new RelationField({ name: 'replaced_by', collectionId: adjustments.id, cascadeDelete: false, maxSelect: 1 })
        )
        adjustments.createRule = adjustmentCreateRule(ADJUSTMENT_SERVER_FIELDS)
        adjustments.updateRule = adjustmentUpdateRule(...ADJUSTMENT_SERVER_FIELDS, 'replaces')
        app.save(adjustments)

        const moves = app.findCollectionByNameOrId('books_stock_moves')
        moves.fields.add(new RelationField({ name: 'bin', collectionId: bins.id, cascadeDelete: false, maxSelect: 1 }))
        moves.fields.add(new TextField({ name: 'document_number', max: 40 }))
        app.save(moves)

        for (const [name, , index] of NEW_INDEXES) {
            const collection = app.findCollectionByNameOrId(name)
            collection.indexes = [...collection.indexes, index]
            app.save(collection)
        }

        app.db()
            .newQuery(
                "CREATE VIRTUAL TABLE fts_books_inventory_adjustments USING fts5(record_id UNINDEXED, number, memo, tokenize='porter unicode61')"
            )
            .execute()
    },
    app => {
        app.db().newQuery('DROP TABLE IF EXISTS fts_books_inventory_adjustments').execute()

        for (const [name, indexName] of [...NEW_INDEXES].reverse()) {
            const collection = app.findCollectionByNameOrId(name)
            collection.indexes = collection.indexes.filter(index => !index.includes(indexName))
            app.save(collection)
        }

        const moves = app.findCollectionByNameOrId('books_stock_moves')
        moves.fields.removeByName('document_number')
        moves.fields.removeByName('bin')
        app.save(moves)

        const adjustments = app.findCollectionByNameOrId('books_inventory_adjustments')
        adjustments.createRule = adjustmentCreateRule(SHIPPED_ADJUSTMENT_SERVER_FIELDS)
        adjustments.updateRule = adjustmentUpdateRule(...SHIPPED_ADJUSTMENT_SERVER_FIELDS)
        adjustments.fields.removeByName('replaced_by')
        adjustments.fields.removeByName('replaces')
        adjustments.fields.removeByName('value_change')
        app.save(adjustments)

        const lines = app.findCollectionByNameOrId('books_inventory_adjustment_lines')
        lines.createRule = WRITE
        lines.updateRule = WRITE
        lines.fields.removeByName('value_given')
        lines.fields.removeByName('posted_value')
        lines.fields.removeByName('bin')
        app.save(lines)

        const products = app.findCollectionByNameOrId('books_products')
        products.fields.removeByName('low_stock')
        products.fields.removeByName('default_bin')
        app.save(products)

        app.delete(app.findCollectionByNameOrId('books_bin_transfers'))
        app.delete(app.findCollectionByNameOrId('books_bin_stock'))
        app.delete(app.findCollectionByNameOrId('books_bins'))
    }
)
