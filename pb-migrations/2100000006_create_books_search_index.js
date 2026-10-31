/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books search: one FTS5 table per search source. server/search_index.go names
// the same columns and keeps each row in step with its record through core's
// fts.RegisterSync (delete then insert on every create and update, delete on
// delete). The columns are what a person recalls a record by; never a tax ID,
// a phone, notes or a purchase description. porter + unicode61, as mail,
// boards and calendar index: a word matches by its stem, case and accents are
// ignored.
//
// The backfill copies the rows that exist when this migration runs. On a new
// database there are none; every later write reaches the index through the
// sync hooks.
const INDEXES = [
    {
        table: 'fts_books_accounts',
        source: 'books_accounts',
        columns: ['name', 'number', 'description'],
    },
    {
        table: 'fts_books_journal_entries',
        source: 'books_journal_entries',
        columns: ['number', 'memo'],
    },
    {
        table: 'fts_books_customers',
        source: 'books_customers',
        columns: ['display_name', 'company', 'email'],
    },
    {
        table: 'fts_books_vendors',
        source: 'books_vendors',
        columns: ['display_name', 'company', 'email', 'legal_name'],
    },
    {
        table: 'fts_books_products',
        source: 'books_products',
        columns: ['name', 'sku', 'sales_description'],
    },
]

migrate(
    app => {
        for (const index of INDEXES) {
            const columns = index.columns.join(', ')
            app.db()
                .newQuery(
                    `CREATE VIRTUAL TABLE ${index.table} USING fts5(record_id UNINDEXED, ${columns}, tokenize='porter unicode61')`
                )
                .execute()
            app.db()
                .newQuery(
                    `INSERT INTO ${index.table} (record_id, ${columns}) SELECT id, ${columns} FROM ${index.source}`
                )
                .execute()
        }
    },
    app => {
        for (const index of INDEXES) {
            app.db().newQuery(`DROP TABLE IF EXISTS ${index.table}`).execute()
        }
    }
)
