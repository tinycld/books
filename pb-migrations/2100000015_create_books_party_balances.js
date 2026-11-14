/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books party balances: what each customer owes, as a view over the ledger. A
// row is one customer with at least one posted line on an accounts-receivable
// account; its id is the customer id, and balance is debits minus credits in
// integer cents, so a credit is negative. A customer with no posted A/R line
// has no row. Nothing writes the view: Books registers it with core's change
// signal (server/party_balances.go), so a write to a line or an account
// reaches the clients that read it.
//
// The query is one grouped SELECT: PocketBase's view parser refuses UNION ALL.
// The CAST makes PocketBase type balance as a number field.
//
// The same migration indexes books_journal_lines on customer, so a read of one
// customer's row does not scan every line.
//
// AUTHORIZATION. Every member with read access lists and views the rows; a
// view has no create, update or delete.
//
// The rule constants repeat 2100000012's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`

const LINE_CUSTOMER_INDEX =
    "CREATE INDEX idx_books_jlines_customer ON books_journal_lines (customer) WHERE customer != ''"

migrate(
    app => {
        const view = new Collection({
            type: 'view',
            name: 'books_party_balances',
            listRule: READ,
            viewRule: READ,
            viewQuery:
                "SELECT l.customer AS id, l.customer AS customer, CAST(SUM(l.debit) - SUM(l.credit) AS INTEGER) AS balance FROM books_journal_lines l JOIN books_accounts a ON a.id = l.account WHERE l.posted = TRUE AND a.type = 'accounts_receivable' AND l.customer != '' GROUP BY l.customer",
        })
        app.save(view)
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        lines.indexes.push(LINE_CUSTOMER_INDEX)
        app.save(lines)
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_party_balances'))
        const lines = app.findCollectionByNameOrId('books_journal_lines')
        lines.indexes = lines.indexes.filter(index => !index.includes('idx_books_jlines_customer'))
        app.save(lines)
    }
)
