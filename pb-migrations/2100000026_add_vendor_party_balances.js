/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books party balances gain vendor rows (vendor pages spec §4). A row is one
// party: a customer with posted lines on an accounts-receivable account
// (balance = debits minus credits), or a vendor with posted lines on an
// accounts-payable account (balance = credits minus debits), in integer cents,
// so "owed" is positive on both. A journal line names one customer or one
// vendor, never both (the line-party guard), so each group is one party and the
// row id is that party's id; the other party column is ''.
//
// The query stays one grouped SELECT: PocketBase's view parser refuses UNION
// ALL. The CASE id column is accepted by the parser (server/party_balances_test.go
// TestPartyBalances_VendorFieldTypes), and customer and vendor stay relations.
// The rules are those 2100000015 set; the change signal sources are unchanged
// (server/party_balances.go).
//
// The same migration indexes books_journal_lines on vendor, so a read of one
// vendor's row does not scan every line.

// The query of 2100000015, restored by the down path.
const CUSTOMER_ONLY =
    "SELECT l.customer AS id, l.customer AS customer, CAST(SUM(l.debit) - SUM(l.credit) AS INTEGER) AS balance FROM books_journal_lines l JOIN books_accounts a ON a.id = l.account WHERE l.posted = TRUE AND a.type = 'accounts_receivable' AND l.customer != '' GROUP BY l.customer"

const BOTH_PARTIES =
    "SELECT (CASE WHEN l.customer != '' THEN l.customer ELSE l.vendor END) AS id, l.customer AS customer, l.vendor AS vendor, CAST(SUM(CASE WHEN a.type = 'accounts_receivable' THEN l.debit - l.credit ELSE l.credit - l.debit END) AS INTEGER) AS balance FROM books_journal_lines l JOIN books_accounts a ON a.id = l.account WHERE l.posted = TRUE AND ((a.type = 'accounts_receivable' AND l.customer != '') OR (a.type = 'accounts_payable' AND l.vendor != '')) GROUP BY l.customer, l.vendor"

const VENDOR_INDEX =
    "CREATE INDEX idx_books_jlines_vendor ON books_journal_lines (vendor) WHERE vendor != ''"

migrate(
    app => {
        const view = app.findCollectionByNameOrId('books_party_balances')
        view.viewQuery = BOTH_PARTIES
        app.save(view)
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        lines.indexes.push(VENDOR_INDEX)
        app.save(lines)
    },
    app => {
        const view = app.findCollectionByNameOrId('books_party_balances')
        view.viewQuery = CUSTOMER_ONLY
        app.save(view)
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        lines.indexes = lines.indexes.filter(index => !index.includes('idx_books_jlines_vendor'))
        app.save(lines)
    }
)
