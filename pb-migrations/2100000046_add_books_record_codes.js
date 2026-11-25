/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Record codes: a required, unique short code on each customer, vendor and product, the
// name a person types to find it (ARD for Aspen Ridge Dental). Unique per collection;
// sub-customers share the customer namespace.
//
// RULE. deriveCode and nextFreeCode copy core's deriveCode and uniqueKey (separator '-',
// max 15; tinycld/core/lib/short-code.ts) and Go's (server/record_codes.go); a migration
// cannot import. server/record_codes_migration_test.go checks this copy against the Go
// rule. A name with no usable letters, or one that gives NEW (the create route's
// segment), takes the collection's base (CUST, VEND, ITEM).
//
// BACKFILL. Existing rows get codes in (created, id) order, so the oldest record keeps the
// bare code and later ones take -2, -3. The rows are written with a bound UPDATE, not
// app.save, so the Go guards do not run over half-migrated data. The field turns
// required, with its pattern and unique index, only after every row has a code.
//
// SEARCH. Each FTS table is rebuilt with code as its first column (the shape of
// 2100000006); server/search_index.go names the same columns.
const CODE_MAX = 15
const CODE_PATTERN = '^[A-Z0-9][A-Z0-9-]{1,14}$'

const TARGETS = [
    {
        collection: 'books_customers',
        nameField: 'display_name',
        base: 'CUST',
        index: 'idx_books_customers_code',
        fts: 'fts_books_customers',
        oldColumns: ['display_name', 'company', 'email'],
    },
    {
        collection: 'books_vendors',
        nameField: 'display_name',
        base: 'VEND',
        index: 'idx_books_vendors_code',
        fts: 'fts_books_vendors',
        oldColumns: ['display_name', 'company', 'email', 'legal_name'],
    },
    {
        collection: 'books_products',
        nameField: 'name',
        base: 'ITEM',
        index: 'idx_books_products_code',
        fts: 'fts_books_products',
        oldColumns: ['name', 'sku', 'sales_description'],
    },
]

function deriveCode(name) {
    const folded = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    const words = folded.split(/[^A-Za-z0-9]+/).filter(word => word !== '')
    if (words.length === 0) return ''
    const raw = words.length > 1 ? words.map(word => word[0]).join('') : words[0]
    const code = raw.toUpperCase().slice(0, CODE_MAX)
    return code.length >= 2 ? code : ''
}

function nextFreeCode(base, taken) {
    if (!taken[base]) return base
    for (let n = 2; ; n++) {
        const suffix = `-${n}`
        const candidate = base.slice(0, CODE_MAX - suffix.length) + suffix
        if (!taken[candidate]) return candidate
    }
}

function rebuildSearch(app, target, columns) {
    const list = columns.join(', ')
    app.db().newQuery(`DROP TABLE IF EXISTS ${target.fts}`).execute()
    app.db()
        .newQuery(
            `CREATE VIRTUAL TABLE ${target.fts} USING fts5(record_id UNINDEXED, ${list}, tokenize='porter unicode61')`
        )
        .execute()
    app.db()
        .newQuery(`INSERT INTO ${target.fts} (record_id, ${list}) SELECT id, ${list} FROM ${target.collection}`)
        .execute()
}

migrate(
    app => {
        for (const target of TARGETS) {
            const collection = app.findCollectionByNameOrId(target.collection)
            collection.fields.add(new TextField({ name: 'code', max: CODE_MAX }))
            app.save(collection)

            const rows = arrayOf(new DynamicModel({ id: '', name: '' }))
            app.db()
                .select('id', `${target.nameField} AS name`)
                .from(target.collection)
                .orderBy('created ASC', 'id ASC')
                .all(rows)
            const taken = {}
            for (const row of rows) {
                const derived = deriveCode(row.name)
                const base = derived === '' || derived === 'NEW' ? target.base : derived
                const code = nextFreeCode(base, taken)
                taken[code] = true
                app.db()
                    .newQuery(`UPDATE ${target.collection} SET code = {:code} WHERE id = {:id}`)
                    .bind({ code, id: row.id })
                    .execute()
            }

            const withCodes = app.findCollectionByNameOrId(target.collection)
            const field = withCodes.fields.getByName('code')
            field.required = true
            field.pattern = CODE_PATTERN
            withCodes.addIndex(target.index, true, 'code', '')
            app.save(withCodes)

            rebuildSearch(app, target, ['code', ...target.oldColumns])
        }
    },
    app => {
        for (const target of TARGETS) {
            const collection = app.findCollectionByNameOrId(target.collection)
            collection.removeIndex(target.index)
            collection.fields.removeByName('code')
            app.save(collection)
            rebuildSearch(app, target, target.oldColumns)
        }
    }
)
