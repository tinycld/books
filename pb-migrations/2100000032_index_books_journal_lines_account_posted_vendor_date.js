/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Indexes books_journal_lines on (account, posted, vendor, date) for the Vendor
// Balance reads of the posted lines of the Accounts payable account.
//
// Core's report engine keeps a line with `[[t1.posted]] IS true`, keeps its
// account with `[[t3.type]] = 'accounts_payable'` (read by
// idx_books_accounts_type (type=?)), and reads the day as
// NULLIF(substr([[t1.date]], 1, 10), ''), which no plain index on `date` serves.
//
// The recorded plans of server/report_vendor_balance_scale_test.go (dataset L,
// docs/plans/vendor-balance-evidence/perf-plans.md) read the lines so. After
// ANALYZE, each read of the lines in runs 1 to 7 is
//   SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
// but for the detail statement of run 6 "vendor opened". There core cuts the
// rows `w` to the open groups by the stored link column (core
// server/reports/run.go, detailPass), here `t1.vendor IN (SELECT g0 FROM gord …)`,
// and that cut is
//   SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=?)
// so the statement reads only the opened vendor's lines, not every posted line
// of the account (measured 26.7 ms with (account, posted, date) and 2.2 ms with
// this index on dataset S; 2.6 ms on three times S). With no statistics, run 1
// reads the lines by this index (account=?), and runs 2 to 7 (the run 6 cut too)
// by idx_books_jlines_account_date (account=?).
//
// `posted` is the second column for two reasons. In the run 6 cut above, the
// planner reaches `vendor` through ANY(account) AND ANY(posted). And without an
// index that has `posted` after `account`, runs 6 "vendor opened" and 7 "CSV
// export" on dataset S after ANALYZE read the lines in the statement without
// `w` by
//   SEARCH books_journal_lines USING AUTOMATIC PARTIAL COVERING INDEX (posted=?)
// (docs/plans/vendor-balance-ledger.md, "Checkpoint 3 — continued (after core
// checkpoint 0, core 5126e3a)", implementer row): SQLite costs the materialized read of `w`
// inside CO-ROUTINE a1 as if it ran once for each outer row, so an automatic
// covering index on `posted` costs less than idx_books_jlines_account_date,
// whose only usable key is `account`.

const ACCOUNT_POSTED_VENDOR_DATE_INDEX =
    'CREATE INDEX idx_books_jlines_account_posted_vendor_date ON books_journal_lines (account, posted, vendor, date)'

migrate(
    app => {
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        lines.indexes.push(ACCOUNT_POSTED_VENDOR_DATE_INDEX)
        app.save(lines)
    },
    app => {
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        lines.indexes = lines.indexes.filter(
            index => !index.includes('idx_books_jlines_account_posted_vendor_date')
        )
        app.save(lines)
    }
)
