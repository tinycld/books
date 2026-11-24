/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books inventory: the Inventory product type, the company costing method, the
// stock moves and open layers the costing engine keeps, and inventory
// adjustments (docs/adr/0003-inventory-costing.md).
//
// PRODUCTS gain the fields of the type "inventory" (the type is in the select
// of 2100000005, edited in place). asset_account is the
// inventory asset account; expense_account (2100000005) is the cost of goods
// sold account of an Inventory item. opening_quantity, opening_value and
// opening_date are the stock the item starts with; the product guard posts
// them as an "opening" inventory adjustment. quantity_on_hand and stock_value
// belong to the server: the product guard keeps the stored values whatever a
// request sends, and only the stock replay (server/stock.go) writes them.
//
// SETTINGS gain costing_method (fifo or average) and costing_locked. The
// server sets costing_locked when the first stock move is written and never
// clears it; the settings guard refuses a change of the method after that.
//
// STOCK MOVES AND LAYERS are derived rows. Only Books writes them (no create,
// update or delete rule); every Books reader lists them. A move is one line of
// a posted document that moves stock. quantity is signed (in above zero, out
// below zero, 0 for a revaluation). given says the move carries its own value
// (given_value); the engine prices every other move. value is the engine's
// result, the signed change of the stock value; posted_value is what the
// ledger holds for the move. They differ only inside the transaction that
// replays the product, until the recost adjustment posts the difference.
// A layer is stock still on hand: FIFO keeps one per stock-in, average cost
// keeps one per product.
//
// INVENTORY ADJUSTMENTS are documents with a draft: a writer creates a draft,
// writes its lines, and moves it to posted; a posted one moves only to void.
// kind is "manual" for a person's; Books makes "opening" (a product's opening
// stock) and "recost" (the change of the cost of a posted document after a
// replay) itself, and the create rule refuses those kinds. A line has a signed
// quantity and a signed value, each of which may be 0, not both.
//
// MONEY is integer minor units. A quantity has at most 2 decimals. DATES are
// YYYY-MM-DD text. The rule constants repeat 2100000027's.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

const DAY = '^\\d{4}-\\d{2}-\\d{2}$'
const OPTIONAL_DAY = '^(\\d{4}-\\d{2}-\\d{2})?$'
const OPTIONAL_CURRENCY = '^([A-Z]{3})?$'
const MAX_STORED = 9007199254740991
const MAX_QUANTITY = 1000000

const PRODUCT_FIELDS = [
    'asset_account',
    'preferred_vendor',
    'reorder_point',
    'opening_quantity',
    'opening_value',
    'opening_date',
    'quantity_on_hand',
    'stock_value',
]

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
]

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
        const accounts = app.findCollectionByNameOrId('books_accounts')
        const vendors = app.findCollectionByNameOrId('books_vendors')
        const entries = app.findCollectionByNameOrId('books_journal_entries')

        const products = app.findCollectionByNameOrId('books_products')
        products.fields.add(
            new RelationField({ name: 'asset_account', collectionId: accounts.id, cascadeDelete: false, maxSelect: 1 })
        )
        products.fields.add(
            new RelationField({ name: 'preferred_vendor', collectionId: vendors.id, cascadeDelete: false, maxSelect: 1 })
        )
        products.fields.add(new NumberField({ name: 'reorder_point', min: 0, max: MAX_QUANTITY }))
        products.fields.add(new NumberField({ name: 'opening_quantity', min: 0, max: MAX_QUANTITY }))
        products.fields.add(new NumberField({ name: 'opening_value', onlyInt: true, min: 0, max: MAX_STORED }))
        products.fields.add(new TextField({ name: 'opening_date', max: 10, pattern: OPTIONAL_DAY }))
        products.fields.add(new NumberField({ name: 'quantity_on_hand' }))
        products.fields.add(new NumberField({ name: 'stock_value', onlyInt: true, min: -MAX_STORED, max: MAX_STORED }))
        products.indexes = [
            ...products.indexes,
            'CREATE INDEX idx_books_products_asset_account ON books_products (asset_account)',
            'CREATE INDEX idx_books_products_preferred_vendor ON books_products (preferred_vendor)',
        ]
        app.save(products)

        const settings = app.findCollectionByNameOrId('books_settings')
        settings.fields.add(
            new SelectField({ name: 'costing_method', maxSelect: 1, values: ['fifo', 'average'] })
        )
        settings.fields.add(new BoolField({ name: 'costing_locked' }))
        app.save(settings)
        // The one settings row, seeded by 2100000001 (server/settings.go settingsID).
        const row = app.findRecordById('books_settings', 'bookssettings01')
        row.set('costing_method', 'fifo')
        app.save(row)

        app.save(
            new Collection({
                id: 'pbc_books_stock_moves',
                name: 'books_stock_moves',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('product', products.id, { required: true }),
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    { name: 'seq', type: 'number', required: true, onlyInt: true, min: 1 },
                    {
                        name: 'kind',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['opening', 'receipt', 'sale', 'customer_return', 'vendor_return', 'adjustment'],
                    },
                    // The collection of the document, the document and its line.
                    { name: 'source', type: 'text', required: true, max: 100 },
                    { name: 'document', type: 'text', required: true, max: 15 },
                    { name: 'line', type: 'text', max: 15 },
                    { name: 'quantity', type: 'number', min: -MAX_QUANTITY, max: MAX_QUANTITY },
                    { name: 'given', type: 'bool' },
                    { name: 'given_value', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    // The removal whose unit cost a return takes; '' for none.
                    { name: 'return_of', type: 'text', max: 15 },
                    { name: 'value', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'posted_value', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    // The stock after this move, for the movement reports.
                    { name: 'quantity_after', type: 'number' },
                    { name: 'value_after', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    relation('asset_account', accounts.id, { required: true }),
                    relation('offset_account', accounts.id, { required: true }),
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE UNIQUE INDEX idx_books_stock_moves_seq ON books_stock_moves (seq)',
                    'CREATE INDEX idx_books_stock_moves_product ON books_stock_moves (product, date, seq)',
                    'CREATE INDEX idx_books_stock_moves_document ON books_stock_moves (source, document)',
                    'CREATE INDEX idx_books_stock_moves_asset_account ON books_stock_moves (asset_account)',
                    'CREATE INDEX idx_books_stock_moves_offset_account ON books_stock_moves (offset_account)',
                ],
            })
        )
        const moves = app.findCollectionByNameOrId('books_stock_moves')

        app.save(
            new Collection({
                id: 'pbc_books_stock_layers',
                name: 'books_stock_layers',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    relation('product', products.id, { required: true, cascadeDelete: true }),
                    // The stock-in the layer came from; empty for the one layer of
                    // the average cost method.
                    relation('move', moves.id),
                    { name: 'date', type: 'text', max: 10, pattern: OPTIONAL_DAY },
                    { name: 'quantity', type: 'number', min: 0 },
                    { name: 'value', type: 'number', onlyInt: true, min: 0, max: MAX_STORED },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_stock_layers_product ON books_stock_layers (product, position)',
                    'CREATE INDEX idx_books_stock_layers_move ON books_stock_layers (move)',
                ],
            })
        )

        app.save(
            new Collection({
                id: 'pbc_books_inv_adjust',
                name: 'books_inventory_adjustments',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: `${WRITE} && @request.body.status = "draft" && @request.body.kind = "manual" && ${unset(...ADJUSTMENT_SERVER_FIELDS)}`,
                updateRule: `${WRITE} && ${unset(...ADJUSTMENT_SERVER_FIELDS, 'kind')} && (status = "draft" || (status = "posted" && @request.body.status = "void"))`,
                deleteRule: `${WRITE} && status = "draft"`,
                fields: [
                    {
                        name: 'status',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['draft', 'posted', 'void'],
                    },
                    {
                        name: 'kind',
                        type: 'select',
                        required: true,
                        maxSelect: 1,
                        values: ['manual', 'opening', 'recost'],
                    },
                    { name: 'number', type: 'text', max: 40 },
                    { name: 'sequence', type: 'number', onlyInt: true, min: 0 },
                    { name: 'date', type: 'text', required: true, max: 10, pattern: DAY },
                    // The adjustment account; empty takes Inventory shrinkage.
                    relation('account', accounts.id),
                    { name: 'memo', type: 'text', max: 4000 },
                    // What Books made the adjustment for: a product (opening) or a
                    // posted document (recost). Empty on a manual one.
                    { name: 'source', type: 'text', max: 100 },
                    { name: 'document', type: 'text', max: 15 },
                    { name: 'currency', type: 'text', max: 3, pattern: OPTIONAL_CURRENCY },
                    relation('entry', entries.id),
                    { name: 'posted_at', type: 'date' },
                    userRef('posted_by'),
                    { name: 'voided_at', type: 'date' },
                    userRef('voided_by'),
                    { name: 'sort_key', type: 'text', hidden: true, max: 200 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_inv_adjust_status_date ON books_inventory_adjustments (status, date)',
                    'CREATE INDEX idx_books_inv_adjust_document ON books_inventory_adjustments (source, document)',
                    'CREATE INDEX idx_books_inv_adjust_account ON books_inventory_adjustments (account)',
                ],
            })
        )
        const adjustments = app.findCollectionByNameOrId('books_inventory_adjustments')

        app.save(
            new Collection({
                id: 'pbc_books_inv_adjust_ln',
                name: 'books_inventory_adjustment_lines',
                type: 'base',
                listRule: READ,
                viewRule: READ,
                createRule: WRITE,
                updateRule: WRITE,
                deleteRule: WRITE,
                fields: [
                    relation('adjustment', adjustments.id, { required: true, cascadeDelete: true }),
                    relation('product', products.id, { required: true }),
                    { name: 'quantity', type: 'number', min: -MAX_QUANTITY, max: MAX_QUANTITY },
                    { name: 'value', type: 'number', onlyInt: true, min: -MAX_STORED, max: MAX_STORED },
                    { name: 'position', type: 'number', onlyInt: true, min: 0 },
                    ...AUTODATES,
                ],
                indexes: [
                    'CREATE INDEX idx_books_inv_adjust_ln_adjustment ON books_inventory_adjustment_lines (adjustment, position)',
                    'CREATE INDEX idx_books_inv_adjust_ln_product ON books_inventory_adjustment_lines (product)',
                ],
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_inventory_adjustment_lines'))
        app.delete(app.findCollectionByNameOrId('books_inventory_adjustments'))
        app.delete(app.findCollectionByNameOrId('books_stock_layers'))
        app.delete(app.findCollectionByNameOrId('books_stock_moves'))

        const settings = app.findCollectionByNameOrId('books_settings')
        settings.fields.removeByName('costing_method')
        settings.fields.removeByName('costing_locked')
        app.save(settings)

        const products = app.findCollectionByNameOrId('books_products')
        products.indexes = products.indexes.filter(
            index =>
                !index.includes('idx_books_products_asset_account') &&
                !index.includes('idx_books_products_preferred_vendor')
        )
        for (const field of PRODUCT_FIELDS) {
            products.fields.removeByName(field)
        }
        app.save(products)
    }
)
