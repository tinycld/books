/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// Books dashboard views (dashboard spec §4 "New views"): the totals the
// Invoices widget sums, so the client reads one row per day, not every invoice
// or payment.
//
// books_invoice_due_totals: one row per due date of the posted invoices with an
// open balance; id is the due date, balance the sum of their open balances in
// integer cents, count the number of those invoices.
//
// books_payment_day_totals: one row per date of the posted received payments;
// id is the date, amount the sum of their amounts in integer cents, count the
// number of those payments.
//
// Each query is one grouped SELECT: PocketBase's view parser refuses UNION ALL.
// The CASTs make PocketBase type balance and amount as number fields. Nothing
// writes the views: Books registers them with core's change signal
// (server/dashboard.go), so a write to an invoice or a payment reaches the
// clients that read them.
//
// AUTHORIZATION. Every member with read access lists and views the rows; a
// view has no create, update or delete.
//
// The rule constants repeat 2100000012's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`

const INVOICE_DUE_TOTALS = 'books_invoice_due_totals'
const PAYMENT_DAY_TOTALS = 'books_payment_day_totals'

migrate(
    app => {
        app.save(
            new Collection({
                type: 'view',
                name: INVOICE_DUE_TOTALS,
                listRule: READ,
                viewRule: READ,
                viewQuery:
                    "SELECT i.due_date AS id, i.due_date AS due_date, CAST(SUM(i.balance) AS INTEGER) AS balance, COUNT(i.id) AS count FROM books_invoices i WHERE i.status = 'posted' AND i.balance > 0 GROUP BY i.due_date",
            })
        )
        app.save(
            new Collection({
                type: 'view',
                name: PAYMENT_DAY_TOTALS,
                listRule: READ,
                viewRule: READ,
                viewQuery:
                    "SELECT p.date AS id, p.date AS date, CAST(SUM(p.amount) AS INTEGER) AS amount, COUNT(p.id) AS count FROM books_payments p WHERE p.status = 'posted' GROUP BY p.date",
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId(PAYMENT_DAY_TOTALS))
        app.delete(app.findCollectionByNameOrId(INVOICE_DUE_TOTALS))
    }
)
