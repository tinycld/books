/// <reference path="../../tinycld/server/pb_data/types.d.ts" />
// The reconciliation report and the undo (reconciliation report spec §4 "Schema").
//
// books_reconciliations gains finished_by_name: the finisher's name, stamped by the
// update request hook at the finish (server/reconcile.go), so "Finished … by Ana Ruiz"
// stays after that user is deleted. The undo clears it again.
//
// The update rule gains a second alternative, the undo: a writer's update of a
// finished reconciliation that sends status "in_progress" and no other field. The
// Go request hook refuses a user whose Books level is not admin, with a text a
// bookkeeper can read (a rule failure is a 404 with no text), and the model hook
// refuses an undo of a reconciliation that is not the latest of its account or
// whose account has one in progress.
//
// books_reconciled_lines is a view: one row for each cleared row of a finished
// reconciliation, with the journal line's position, the reconciliation's currency,
// the memo (the line's, else the entry's) and the payee. One SELECT: PocketBase's
// view parser refuses UNION ALL. Each computed column is cast so the view parser
// gives it a type; reconciliation, account and entry stay bare so they keep their
// relation type. Books registers the view with core's change signal
// (server/register.go).
//
// The rule constants repeat 2100000039's: a migration cannot import another.
const AUTH = '@request.auth.id != "" && @request.auth.disabled != true'
const ME = '@collection.books_access:me.user ?= @request.auth.id'
const READ = `${AUTH} && ${ME} && @collection.books_access:me.can_read ?= true`
const WRITE = `${AUTH} && ${ME} && @collection.books_access:me.can_write ?= true`
const unset = (...fields) => fields.map(f => `@request.body.${f}:isset = false`).join(' && ')

// The fields of a reconciliation that only the server writes.
const STAMPED = [
    'beginning_balance',
    'cleared_out',
    'cleared_in',
    'cleared_out_count',
    'cleared_in_count',
    'created_by',
    'finished_by',
    'finished_by_name',
    'finished_at',
    'currency',
]

// 2100000039's list, for the rules the down migration restores.
const OLD_STAMPED = STAMPED.filter(f => f !== 'finished_by_name')

// Every field of a reconciliation but status, id and the two autodates: an undo
// sends none of them.
const OTHER = [
    'account',
    'statement_date',
    'statement_balance',
    'has_statement_totals',
    'statement_out',
    'statement_in',
    ...STAMPED,
]

const RECONCILED_LINES_VIEW = `SELECT rl.id AS id, rl.reconciliation AS reconciliation, rl.account AS account,
       rl.entry AS entry, rl.date AS date, rl.debit AS debit, rl.credit AS credit,
       CAST(l.position AS NUMERIC) AS position,
       CAST(r.currency AS TEXT) AS currency,
       CAST(CASE WHEN l.memo != '' THEN l.memo ELSE e.memo END AS TEXT) AS memo,
       CAST(COALESCE(c.display_name, v.display_name, '') AS TEXT) AS payee
FROM books_reconciliation_lines rl
JOIN books_reconciliations r ON r.id = rl.reconciliation AND r.status = 'finished'
JOIN books_journal_lines l ON l.id = rl.line
JOIN books_journal_entries e ON e.id = rl.entry
LEFT JOIN books_customers c ON c.id = l.customer
LEFT JOIN books_vendors v ON v.id = l.vendor`

migrate(
    app => {
        const reconciliations = app.findCollectionByNameOrId('books_reconciliations')
        reconciliations.fields.add(new TextField({ name: 'finished_by_name', max: 200 }))
        reconciliations.createRule = `${WRITE} && @request.body.status = "in_progress" && ${unset(...STAMPED)}`
        reconciliations.updateRule =
            `(${WRITE} && status = "in_progress" && ${unset('account', ...STAMPED)})` +
            ` || (${WRITE} && status = "finished" && @request.body.status = "in_progress" && ${unset(...OTHER)})`
        app.save(reconciliations)
        app.save(
            new Collection({
                id: 'pbc_books_recd_lin',
                type: 'view',
                name: 'books_reconciled_lines',
                listRule: READ,
                viewRule: READ,
                viewQuery: RECONCILED_LINES_VIEW,
            })
        )
    },
    app => {
        app.delete(app.findCollectionByNameOrId('books_reconciled_lines'))
        const reconciliations = app.findCollectionByNameOrId('books_reconciliations')
        reconciliations.fields.removeByName('finished_by_name')
        reconciliations.createRule = `${WRITE} && @request.body.status = "in_progress" && ${unset(...OLD_STAMPED)}`
        reconciliations.updateRule = `${WRITE} && status = "in_progress" && ${unset('account', ...OLD_STAMPED)}`
        app.save(reconciliations)
    }
)
