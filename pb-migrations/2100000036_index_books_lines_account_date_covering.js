/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Indexes books_journal_lines and books_cash_basis_lines on
// (account, date, posted, vendor, currency, debit, credit, id) for the reads of
// the posted lines of a set of accounts in a period (the Expenses by Vendor's
// Cost of goods sold, Expense and Other expense accounts; human decision D11 of
// the Expenses by Vendor plan, 2026-11-21).
//
// Once the book has statistics (PocketBase's `PRAGMA optimize`, a real ANALYZE
// with sqlite_stat1 and sqlite_stat4 rows), the planner costs a set of three
// account types at least the whole table, so with only
// idx_books_jlines_account_date (account, date) it reads the lines by
//   SCAN books_journal_lines
// (the Expenses by Vendor L book, docs/plans/expenses-by-vendor-ledger.md,
// scale run 2). This index holds every column the report's vendor rows and
// Total read of a line. With it, after ANALYZE, the L book's plans (scale run 4,
// docs/plans/expenses-by-vendor-evidence/perf-plans.md) read the ledger lines by
//   SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
// and the Cash basis rows by one outermost
//   SCAN books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering
// a scan of the covering index; neither read touches a table row.
//
// It also indexes books_cash_basis_lines on (account, posted, vendor, date), the
// mirror of idx_books_jlines_account_posted_vendor_date (migration
// 2100000032) for the Cash basis rows. In the Expenses by Vendor's run 7
// "vendor opened", core cuts the rows `w` to the opened vendor
// (`[[t1.vendor]] IN (SELECT g0 FROM gord ...)`, core server/reports/run.go,
// detailPass), and SQLite pushes that term into both parts of the UNION ALL of
// the ledger lines and the Cash basis rows. The ledger part reads
//   SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
// but no index of books_cash_basis_lines reaches `vendor`, so under the L
// statistics (two accounts of 193,500 rows each) the Cash part read
//   SCAN books_cash_basis_lines
// for one vendor's rows. With this index it reads
//   SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
//
// No existing index is dropped: idx_books_jlines_account_date and
// idx_books_cash_basis_lines_account_date stay for the reads that use them now.
//
// The 1099 report (spec §8, §11 Q21; human decision of 2026-11-22) reads the
// card mark (card_payment) of every row, the doc type of every ledger line and
// the payment_entry of every cash row. The lines hold copies of their entry's
// card_payment and doc_type (migrations 2100000002 and 2100000021), and the
// covering indexes end with what the report reads, so its run 3 ("Not tracked
// for 1099") reads both line tables by USING COVERING INDEX and no entry row.
// Probe 3 at L (docs/plans/report-1099-ledger.md, checkpoint 4, phase C): the
// statement that builds the rows took a CPU median of 603 ms with these
// columns against 1,435 ms with the entry read, with the same rows.

const LINES_COVERING_INDEX =
    'CREATE INDEX idx_books_jlines_account_date_covering ON books_journal_lines (account, date, posted, vendor, currency, debit, credit, id, card_payment, doc_type)'

const CASH_LINES_COVERING_INDEX =
    'CREATE INDEX idx_books_cash_basis_lines_account_date_covering ON books_cash_basis_lines (account, date, posted, vendor, currency, debit, credit, id, card_payment, payment_entry, doc_type)'

const CASH_LINES_ACCOUNT_POSTED_VENDOR_DATE_INDEX =
    'CREATE INDEX idx_books_cash_basis_lines_account_posted_vendor_date ON books_cash_basis_lines (account, posted, vendor, date)'

const INDEXES = [
    ['books_journal_lines', LINES_COVERING_INDEX, 'idx_books_jlines_account_date_covering'],
    [
        'books_cash_basis_lines',
        CASH_LINES_COVERING_INDEX,
        'idx_books_cash_basis_lines_account_date_covering',
    ],
    [
        'books_cash_basis_lines',
        CASH_LINES_ACCOUNT_POSTED_VENDOR_DATE_INDEX,
        'idx_books_cash_basis_lines_account_posted_vendor_date',
    ],
]

migrate(
    app => {
        for (const [name, index] of INDEXES) {
            const collection = app.findCollectionByNameOrId(name)
            collection.indexes.push(index)
            app.save(collection)
        }
    },
    app => {
        for (const [name, , indexName] of INDEXES) {
            const collection = app.findCollectionByNameOrId(name)
            collection.indexes = collection.indexes.filter(index => !index.includes(indexName))
            app.save(collection)
        }
    }
)
