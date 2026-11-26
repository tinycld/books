/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Indexes each numbered document collection on its sequence, the number without
// its prefix. A document's URL holds its sequence (`/books/invoices/1005`), and
// its route reads the document by that sequence, so the read must not scan the
// table. books_statements (2100000033) and books_journal_entries (2100000002)
// have such an index already.
//
// The index is not unique: a correction of a posted document takes the number
// of the document it replaces, so the void original and the correction share a
// sequence. A draft has sequence 0, so the index leaves drafts out.

const INDEXES = [
    [
        'books_invoices',
        'CREATE INDEX idx_books_invoices_sequence ON books_invoices (sequence) WHERE sequence > 0',
        'idx_books_invoices_sequence',
    ],
    [
        'books_estimates',
        'CREATE INDEX idx_books_estimates_sequence ON books_estimates (sequence) WHERE sequence > 0',
        'idx_books_estimates_sequence',
    ],
    [
        'books_sales_receipts',
        'CREATE INDEX idx_books_sales_receipts_sequence ON books_sales_receipts (sequence) WHERE sequence > 0',
        'idx_books_sales_receipts_sequence',
    ],
    [
        'books_payments',
        'CREATE INDEX idx_books_payments_sequence ON books_payments (sequence) WHERE sequence > 0',
        'idx_books_payments_sequence',
    ],
    [
        'books_credit_memos',
        'CREATE INDEX idx_books_credit_memos_sequence ON books_credit_memos (sequence) WHERE sequence > 0',
        'idx_books_credit_memos_sequence',
    ],
    [
        'books_refund_receipts',
        'CREATE INDEX idx_books_refund_receipts_sequence ON books_refund_receipts (sequence) WHERE sequence > 0',
        'idx_books_refund_receipts_sequence',
    ],
    [
        'books_bills',
        'CREATE INDEX idx_books_bills_sequence ON books_bills (sequence) WHERE sequence > 0',
        'idx_books_bills_sequence',
    ],
    [
        'books_expenses',
        'CREATE INDEX idx_books_expenses_sequence ON books_expenses (sequence) WHERE sequence > 0',
        'idx_books_expenses_sequence',
    ],
    [
        'books_bill_payments',
        'CREATE INDEX idx_books_bill_payments_sequence ON books_bill_payments (sequence) WHERE sequence > 0',
        'idx_books_bill_payments_sequence',
    ],
    [
        'books_vendor_credits',
        'CREATE INDEX idx_books_vendor_credits_sequence ON books_vendor_credits (sequence) WHERE sequence > 0',
        'idx_books_vendor_credits_sequence',
    ],
    [
        'books_vendor_refunds',
        'CREATE INDEX idx_books_vendor_refunds_sequence ON books_vendor_refunds (sequence) WHERE sequence > 0',
        'idx_books_vendor_refunds_sequence',
    ],
    [
        'books_deposits',
        'CREATE INDEX idx_books_deposits_sequence ON books_deposits (sequence) WHERE sequence > 0',
        'idx_books_deposits_sequence',
    ],
    [
        'books_write_offs',
        'CREATE INDEX idx_books_write_offs_sequence ON books_write_offs (sequence) WHERE sequence > 0',
        'idx_books_write_offs_sequence',
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
