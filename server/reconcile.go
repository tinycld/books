// A reconciliation compares one bank or credit card account with one bank
// statement (reconcile spec §3, §4). A writer starts a books_reconciliations
// row, clears each posted line that is on the statement with a
// books_reconciliation_lines row, and finishes at a difference of $0.00. Go
// stamps what the server owns and refuses what a rule cannot see: the
// account's type and state, the one reconciliation in progress, the statement
// date against the last finished one, each cleared line, and the difference
// at the finish. A reconciliation posts nothing, so the close date does not
// apply to it.

package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	reconciliationsCollection     = "books_reconciliations"
	reconciliationLinesCollection = "books_reconciliation_lines"
	reconcileLinesView            = "books_reconcile_lines"
	reconciledLinesView           = "books_reconciled_lines"
	reconcileInProgress           = "in_progress"
	reconcileFinished             = "finished"

	msgReconcileAccountType  = "Only a bank or credit card account can be reconciled."
	msgReconcileInactive     = "%s is inactive. A reconciliation starts only on an active account."
	msgReconcileInProgress   = "%s has a reconciliation in progress. Resume it or discard it."
	msgReconcileDateAfter    = "The date must be after %s, the last reconciled statement."
	msgReconcileStartsOpen   = "A reconciliation starts in progress. Finish it after its transactions are cleared."
	msgReconcileAccountFixed = "A reconciliation's account cannot change. Discard it and start one on the other account."
	msgReconcileFinished     = "This reconciliation is finished."
	msgReconcileDifference   = "The difference is %s. It must be %s to finish."
	msgReconcileLineMissing  = "This transaction no longer exists."
	msgReconcileLineVoid     = "%s is void."
	msgReconcileLineDraft    = "%s is not posted."
	msgReconcileLineAccount  = "%s is not on %s."
	msgReconcileLineLate     = "%s is dated after %s."
	msgReconcileLineTaken    = "%s is cleared in another reconciliation."
	msgReconciledEntry       = "%s is reconciled on %s (statement of %s). It cannot be voided or changed."
	msgAccountReconciling    = "%s has a reconciliation. Discard it first."
	msgAccountReconciled     = "%s has reconciled statements."
	// refuse adds the final period of these three.
	msgUndoNotAdmin   = "Only a Books admin can undo a reconciliation"
	msgUndoNotLatest  = "Only the latest reconciliation of %s can be undone. Undo the statement of %s first"
	msgUndoChangesRow = "An undo cannot change the reconciliation"
	// refuse adds the final period.
	msgReconcileUndone = "This reconciliation was undone after it was loaded. Load it again"
)

// reconcileAccountTypes are the account types a reconciliation can name. The
// detail type is not read.
var reconcileAccountTypes = map[string]bool{"bank": true, "credit_card": true}

// The fields of a finished reconciliation that never change, but by an undo. A
// user field may: PocketBase clears created_by or finished_by when that user is
// deleted. finished_by_name is a copy of the name, so it stays.
var reconcileFinishedFields = []string{
	"account", "statement_date", "statement_balance", "has_statement_totals", "statement_out",
	"statement_in", "status", "beginning_balance", "cleared_out", "cleared_in",
	"cleared_out_count", "cleared_in_count", "finished_at", "finished_by_name", "currency",
}

// reconcileUndoClears are the fields an undo sets back to empty: the sums and
// the finisher the finish stamped.
var reconcileUndoClears = map[string]any{
	"cleared_out": 0, "cleared_in": 0, "cleared_out_count": 0, "cleared_in_count": 0,
	"finished_at": "", "finished_by": "", "finished_by_name": "",
}

// registerReconcile binds the reconciliation hooks, each once. The request
// hooks stamp who started and who finished (a superuser's value is kept, so the
// seed can name its user) and refuse an undo by a user who is not a Books
// admin. The model hooks read other rows, so they run on every save, a Go
// caller's too, inside serialized: two starts on one account, a clear beside a
// finish, or a finish beside a void would each pass a check made outside one.
func registerReconcile(app core.App) {
	app.OnRecordCreateRequest(reconciliationsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordUpdateRequest(reconciliationsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		from, to := e.Record.Original().GetString("status"), e.Record.GetString("status")
		if from == reconcileInProgress && to == reconcileFinished {
			stampActor(e.Record, "finished_by", e.Auth)
			stampActorName(e.Record, "finished_by_name", e.Auth)
		}
		if from == reconcileFinished && to == reconcileInProgress {
			if err := checkUndoLevel(e.App, e.Auth); err != nil {
				return err
			}
		}
		return e.Next()
	})
	app.OnRecordCreate(reconciliationsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error { return checkReconcileStart(tx, e.Record) })
	})
	app.OnRecordUpdate(reconciliationsCollection).BindFunc(func(e *core.RecordEvent) error {
		var plan reconcileUpdatePlan
		return serializedThen(e,
			func(tx core.App) error {
				stored, err := storedReconciliation(tx, e.Record.Id)
				if err != nil {
					return err
				}
				plan, err = checkReconcileUpdate(tx, stored, e.Record)
				return err
			},
			func(tx core.App) error { return applyReconcileUpdate(tx, e.Record, plan) })
	})
	app.OnRecordDelete(reconciliationsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error {
			stored, err := storedReconciliation(tx, e.Record.Id)
			if err != nil {
				return err
			}
			if stored.GetString("status") == reconcileFinished {
				return refuse(msgReconcileFinished)
			}
			return nil
		})
	})
	app.OnRecordCreate(reconciliationLinesCollection).BindFunc(func(e *core.RecordEvent) error {
		err := serialized(e, func(tx core.App) error { return checkReconcileClear(tx, e.Record) })
		if isNotUnique(err) {
			return clearTakenRefusal(e.App, e.Record.GetString("entry"))
		}
		return err
	})
	app.OnRecordDelete(reconciliationLinesCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error { return checkReconcileUnclear(tx, e.Record) })
	})
}

// reconcileAmount is one cleared line's amounts in minor units.
type reconcileAmount struct {
	debit, credit int64
}

// reconcileSum is what the cleared lines of a reconciliation add up to, in the
// account's own balance sense (lib/reconcile.ts reconcileTotals gives the same
// figures; testdata/reconcile_cases.json pins both).
type reconcileSum struct {
	clearedOut, clearedIn      int64
	outCount, inCount          int64
	clearedBalance, difference int64
}

// reconcileSums adds the cleared lines. The credit side (out) lowers a bank
// account's balance and raises the amount owed on a credit card; the debit
// side (in) does the reverse. The difference is the statement balance less the
// cleared balance.
func reconcileSums(accountType string, beginning, statement int64, lines []reconcileAmount) reconcileSum {
	var s reconcileSum
	for _, l := range lines {
		if l.credit > 0 {
			s.clearedOut += l.credit
			s.outCount++
		}
		if l.debit > 0 {
			s.clearedIn += l.debit
			s.inCount++
		}
	}
	if accountType == "credit_card" {
		s.clearedBalance = beginning + s.clearedOut - s.clearedIn
	} else {
		s.clearedBalance = beginning - s.clearedOut + s.clearedIn
	}
	s.difference = statement - s.clearedBalance
	return s
}

// checkReconcileStart stamps a new reconciliation's currency, beginning
// balance and zero sums, and refuses an account that cannot be reconciled, a
// second one in progress and a statement date on or before the last finished
// one. A missing account is left to PocketBase's relation validation.
func checkReconcileStart(tx core.App, r *core.Record) error {
	if r.GetString("status") != reconcileInProgress {
		return refuse(msgReconcileStartsOpen)
	}
	account, err := tx.FindRecordById("books_accounts", r.GetString("account"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the account to reconcile: %w", err)
	}
	if !reconcileAccountTypes[account.GetString("type")] {
		return refuse(msgReconcileAccountType)
	}
	if account.GetBool("inactive") {
		return refuseNamed(msgReconcileInactive, accountDisplayName(account))
	}
	open, err := tx.CountRecords(reconciliationsCollection,
		dbx.HashExp{"account": account.Id, "status": reconcileInProgress})
	if err != nil {
		return fmt.Errorf("books: count the account's reconciliations in progress: %w", err)
	}
	if open > 0 {
		return refuseNamed(msgReconcileInProgress, accountDisplayName(account))
	}
	last, err := lastFinishedReconciliation(tx, account.Id)
	if err != nil {
		return err
	}
	if err := checkStatementDate(last, r.GetString("statement_date")); err != nil {
		return err
	}
	beginning := 0
	if last != nil {
		beginning = last.GetInt("statement_balance")
	}
	r.Set("beginning_balance", beginning)
	r.Set("currency", account.GetString("currency"))
	for _, f := range []string{"cleared_out", "cleared_in", "cleared_out_count", "cleared_in_count"} {
		r.Set(f, 0)
	}
	r.Set("finished_by", "")
	r.Set("finished_at", "")
	return nil
}

// lastFinishedReconciliation is the account's finished reconciliation with the
// latest statement date, or nil when it has none.
func lastFinishedReconciliation(tx core.App, accountID string) (*core.Record, error) {
	rows, err := tx.FindRecordsByFilter(reconciliationsCollection,
		"account = {:account} && status = {:status}", "-statement_date", 1, 0,
		dbx.Params{"account": accountID, "status": reconcileFinished})
	if err != nil {
		return nil, fmt.Errorf("books: read the account's last reconciliation: %w", err)
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}

// checkStatementDate refuses a statement date on or before the last finished
// one. Both are YYYY-MM-DD days, so they compare as text; a malformed day is
// left to the field's pattern.
func checkStatementDate(last *core.Record, date string) error {
	if last == nil {
		return nil
	}
	lastDate := last.GetString("statement_date")
	if date <= lastDate {
		return refuseField("statement_date", msgReconcileDateAfter, formatDay(lastDate))
	}
	return nil
}

// storedReconciliation reads the reconciliation as the transaction sees it.
// The record an update or a delete carries was loaded before the write, and a
// finish by another request can commit after that load; its Original() would
// still say in progress.
func storedReconciliation(tx core.App, id string) (*core.Record, error) {
	stored, err := tx.FindRecordById(reconciliationsCollection, id)
	if err != nil {
		return nil, fmt.Errorf("books: read the stored reconciliation: %w", err)
	}
	return stored, nil
}

// checkUndoLevel refuses an undo request by a user whose Books level is not
// admin. The update rule lets a writer's undo reach the request hook, so a
// bookkeeper reads this text and not the rule's 404. A save from Go (no
// request) and a superuser's request pass.
func checkUndoLevel(app core.App, auth *core.Record) error {
	if auth == nil || auth.IsSuperuser() {
		return nil
	}
	level, err := levelFor(app, auth)
	if err != nil {
		return err
	}
	if level != LevelAdmin {
		return refuse(msgUndoNotAdmin)
	}
	return nil
}

// reconcileUpdatePlan is what the update check found, for the writes after
// the save: the cleared rows a finish marks finished, and those an undo marks
// not finished.
type reconcileUpdatePlan struct {
	finish []*core.Record
	undo   []*core.Record
}

// checkReconcileUpdate keeps a finished reconciliation and the account of any
// reconciliation fixed, applies the date rule to a new statement date and
// unclears the rows after an earlier one, and at the finish checks the
// difference from the stored cleared rows and stamps the sums and the time.
// The unclear runs here, before the save, so the rows' delete hook still reads
// the reconciliation in progress when the same update also finishes it.
func checkReconcileUpdate(tx core.App, stored, next *core.Record) (reconcileUpdatePlan, error) {
	if isReconcileUndo(stored, next) {
		if err := checkReconcileUndo(tx, stored, next); err != nil {
			return reconcileUpdatePlan{}, err
		}
		rows, err := tx.FindAllRecords(reconciliationLinesCollection, dbx.HashExp{"reconciliation": next.Id})
		if err != nil {
			return reconcileUpdatePlan{}, fmt.Errorf("books: read the cleared rows to undo: %w", err)
		}
		return reconcileUpdatePlan{undo: rows}, nil
	}
	if stored.GetString("status") == reconcileFinished {
		for _, f := range reconcileFinishedFields {
			if fmt.Sprint(stored.Get(f)) != fmt.Sprint(next.Get(f)) {
				return reconcileUpdatePlan{}, refuse(msgReconcileFinished)
			}
		}
		return reconcileUpdatePlan{}, nil
	}
	// A record loaded finished and stored in progress was undone by another
	// request after the load: saving it would put the finish's sums and
	// finisher back on a row in progress.
	if next.Original().GetString("status") == reconcileFinished {
		return reconcileUpdatePlan{}, refuse(msgReconcileUndone)
	}
	if stored.GetString("account") != next.GetString("account") {
		return reconcileUpdatePlan{}, refuse(msgReconcileAccountFixed)
	}
	date := next.GetString("statement_date")
	if date != stored.GetString("statement_date") {
		last, err := lastFinishedReconciliation(tx, next.GetString("account"))
		if err != nil {
			return reconcileUpdatePlan{}, err
		}
		if err := checkStatementDate(last, date); err != nil {
			return reconcileUpdatePlan{}, err
		}
		if date < stored.GetString("statement_date") {
			if err := unclearAfter(tx, next.Id, date); err != nil {
				return reconcileUpdatePlan{}, err
			}
		}
	}
	if next.GetString("status") != reconcileFinished {
		return reconcileUpdatePlan{}, nil
	}
	finish, err := checkReconcileFinish(tx, next)
	if err != nil {
		return reconcileUpdatePlan{}, err
	}
	return reconcileUpdatePlan{finish: finish}, nil
}

// isReconcileUndo reports whether the update returns a finished reconciliation
// to In progress. The record must have been loaded finished: a stale record
// loaded while it was in progress, saved after another request finished it,
// still says in progress, and is an update of a finished row, not an undo.
func isReconcileUndo(stored, next *core.Record) bool {
	return stored.GetString("status") == reconcileFinished &&
		next.Original().GetString("status") == reconcileFinished &&
		next.GetString("status") == reconcileInProgress
}

// checkReconcileUndo returns a finished reconciliation to In progress. It
// refuses an undo that changes any other field, one of a reconciliation that is
// not the latest finished one of its account, and one while the account has a
// reconciliation in progress (the unique index on the account's open one is
// the last guard of two undos). It then clears the sums and the finisher; a Go
// caller that sent one of those has it overwritten, and the update rule pins
// them for an API caller.
func checkReconcileUndo(tx core.App, stored, next *core.Record) error {
	allowed := map[string]bool{"status": true}
	for f := range reconcileUndoClears {
		allowed[f] = true
	}
	if len(changedFields(stored, next, allowed)) > 0 {
		return refuse(msgUndoChangesRow)
	}
	accountID := stored.GetString("account")
	account, err := tx.FindRecordById("books_accounts", accountID)
	if err != nil {
		return fmt.Errorf("books: read the account of the reconciliation to undo: %w", err)
	}
	last, err := lastFinishedReconciliation(tx, accountID)
	if err != nil {
		return err
	}
	if last != nil && last.Id != stored.Id {
		return refuse(msgUndoNotLatest, accountDisplayName(account), formatDay(last.GetString("statement_date")))
	}
	open, err := tx.CountRecords(reconciliationsCollection,
		dbx.HashExp{"account": accountID, "status": reconcileInProgress})
	if err != nil {
		return fmt.Errorf("books: count the account's reconciliations in progress: %w", err)
	}
	if open > 0 {
		return refuseNamed(msgReconcileInProgress, accountDisplayName(account))
	}
	for f, v := range reconcileUndoClears {
		next.Set(f, v)
	}
	return nil
}

// unclearAfter deletes the reconciliation's cleared rows dated after day.
func unclearAfter(tx core.App, reconciliationID, day string) error {
	later, err := tx.FindRecordsByFilter(reconciliationLinesCollection,
		"reconciliation = {:id} && date > {:date}", "", 0, 0,
		dbx.Params{"id": reconciliationID, "date": day})
	if err != nil {
		return fmt.Errorf("books: read the cleared rows after the new statement date: %w", err)
	}
	for _, row := range later {
		if err := tx.Delete(row); err != nil {
			return fmt.Errorf("books: unclear a row after the new statement date: %w", err)
		}
	}
	return nil
}

// checkReconcileFinish sums the stored cleared rows, refuses a difference
// that is not 0 and stamps the sums, the counts and the time. It returns the
// rows the finish marks finished.
func checkReconcileFinish(tx core.App, r *core.Record) ([]*core.Record, error) {
	account, err := tx.FindRecordById("books_accounts", r.GetString("account"))
	if err != nil {
		return nil, fmt.Errorf("books: read the reconciled account: %w", err)
	}
	rows, err := tx.FindAllRecords(reconciliationLinesCollection, dbx.HashExp{"reconciliation": r.Id})
	if err != nil {
		return nil, fmt.Errorf("books: read the cleared rows to finish: %w", err)
	}
	amounts := make([]reconcileAmount, 0, len(rows))
	for _, row := range rows {
		amounts = append(amounts, reconcileAmount{debit: int64(row.GetInt("debit")), credit: int64(row.GetInt("credit"))})
	}
	sums := reconcileSums(account.GetString("type"), int64(r.GetInt("beginning_balance")),
		int64(r.GetInt("statement_balance")), amounts)
	if sums.difference != 0 {
		currency := r.GetString("currency")
		return nil, refuse(msgReconcileDifference, formatMoney(sums.difference, currency), formatMoney(0, currency))
	}
	r.Set("cleared_out", sums.clearedOut)
	r.Set("cleared_in", sums.clearedIn)
	r.Set("cleared_out_count", sums.outCount)
	r.Set("cleared_in_count", sums.inCount)
	r.Set("finished_at", types.NowDateTime())
	return rows, nil
}

// applyReconcileUpdate marks a finished reconciliation's rows finished, and an
// undone one's rows not finished, in the update's transaction after it is
// saved. It is a model write: the rows' rules do not apply to the server.
func applyReconcileUpdate(tx core.App, r *core.Record, plan reconcileUpdatePlan) error {
	for _, row := range plan.finish {
		row.Set("finished", true)
		if err := tx.Save(row); err != nil {
			return fmt.Errorf("books: finish a cleared row of %s: %w", r.Id, err)
		}
	}
	for _, row := range plan.undo {
		row.Set("finished", false)
		if err := tx.Save(row); err != nil {
			return fmt.Errorf("books: undo a cleared row of %s: %w", r.Id, err)
		}
	}
	return nil
}

// checkReconcileClear stamps a cleared row from its line and refuses a line
// that cannot be cleared in the reconciliation, in this order: the
// reconciliation is finished; the line's entry is void or a void reversal; the
// entry or the line is not posted; the line is on another account; it is dated
// after the statement date; it is cleared already. A missing reconciliation is
// left to PocketBase's relation validation. line is a text field (a relation
// would add a cascade lookup to every journal line delete), so a line id that
// is no journal line is refused here; an empty one is left to the field's
// required validation.
func checkReconcileClear(tx core.App, r *core.Record) error {
	recon, err := tx.FindRecordById(reconciliationsCollection, r.GetString("reconciliation"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the reconciliation to clear in: %w", err)
	}
	if recon.GetString("status") != reconcileInProgress {
		return refuse(msgReconcileFinished)
	}
	if r.GetString("line") == "" {
		return nil
	}
	line, err := tx.FindRecordById("books_journal_lines", r.GetString("line"))
	if errors.Is(err, sql.ErrNoRows) {
		return refuse(msgReconcileLineMissing)
	}
	if err != nil {
		return fmt.Errorf("books: read the line to clear: %w", err)
	}
	entry, err := tx.FindRecordById("books_journal_entries", line.GetString("entry"))
	if err != nil {
		return fmt.Errorf("books: read the entry of the line to clear: %w", err)
	}
	name := entryName(entry)
	switch {
	case entry.GetString("status") == statusVoid, entry.GetString("origin") == originVoidReversal:
		return refuseNamed(msgReconcileLineVoid, name)
	case entry.GetString("status") != statusPosted, !line.GetBool("posted"):
		return refuseNamed(msgReconcileLineDraft, name)
	case line.GetString("account") != recon.GetString("account"):
		account, err := tx.FindRecordById("books_accounts", recon.GetString("account"))
		if err != nil {
			return fmt.Errorf("books: read the reconciled account: %w", err)
		}
		return refuseNamed(msgReconcileLineAccount, name, accountDisplayName(account))
	case line.GetString("date") > recon.GetString("statement_date"):
		return refuseNamed(msgReconcileLineLate, name, formatDay(recon.GetString("statement_date")))
	}
	taken, err := tx.CountRecords(reconciliationLinesCollection, dbx.HashExp{"line": line.Id})
	if err != nil {
		return fmt.Errorf("books: look up the line's cleared row: %w", err)
	}
	if taken > 0 {
		return refuseNamed(msgReconcileLineTaken, name)
	}
	r.Set("account", line.GetString("account"))
	r.Set("entry", entry.Id)
	r.Set("date", line.GetString("date"))
	r.Set("debit", line.GetInt("debit"))
	r.Set("credit", line.GetInt("credit"))
	r.Set("finished", false)
	return nil
}

// clearTakenRefusal is the text of the unique index on line, the last guard of
// two presses on one line.
func clearTakenRefusal(app core.App, entryID string) error {
	entry, err := app.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the entry of a cleared line: %w", err)
	}
	return refuseNamed(msgReconcileLineTaken, entryName(entry))
}

// checkReconcileUnclear refuses to delete a cleared row of a finished
// reconciliation. A reconciliation that is gone is the cascade of its own
// delete, which only a reconciliation in progress allows.
func checkReconcileUnclear(tx core.App, r *core.Record) error {
	if r.GetBool("finished") {
		return refuse(msgReconcileFinished)
	}
	recon, err := tx.FindRecordById(reconciliationsCollection, r.GetString("reconciliation"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the reconciliation to unclear in: %w", err)
	}
	if recon.GetString("status") != reconcileInProgress {
		return refuse(msgReconcileFinished)
	}
	return nil
}

// unreconcileEntry refuses the void of an entry that has a reconciled line,
// and deletes the entry's cleared rows of a reconciliation in progress. It runs
// in the transaction of the entry's void (transitionEntry), so an edit, which
// voids the original, is refused the same way and the correction is a line to
// clear.
func unreconcileEntry(tx core.App, entryID string) error {
	rows, err := tx.FindAllRecords(reconciliationLinesCollection, dbx.HashExp{"entry": entryID})
	if err != nil {
		return fmt.Errorf("books: read the cleared rows of the voided entry: %w", err)
	}
	for _, row := range rows {
		if row.GetBool("finished") {
			return reconciledEntryRefusal(tx, entryID, row)
		}
	}
	for _, row := range rows {
		if err := tx.Delete(row); err != nil {
			return fmt.Errorf("books: unclear a line of the voided entry: %w", err)
		}
	}
	return nil
}

func reconciledEntryRefusal(tx core.App, entryID string, row *core.Record) error {
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the reconciled entry: %w", err)
	}
	recon, err := tx.FindRecordById(reconciliationsCollection, row.GetString("reconciliation"))
	if err != nil {
		return fmt.Errorf("books: read the reconciliation of a reconciled line: %w", err)
	}
	account, err := tx.FindRecordById("books_accounts", recon.GetString("account"))
	if err != nil {
		return fmt.Errorf("books: read the reconciled account: %w", err)
	}
	return refuseNamed(msgReconciledEntry, entryName(entry), accountDisplayName(account),
		formatDay(recon.GetString("statement_date")))
}

// isLineReconciled reports whether the journal line is in a finished
// reconciliation: one lookup on the unique line index of
// books_reconciliation_lines. The finish sets finished on its rows in its own
// transaction.
func isLineReconciled(tx core.App, lineID string) (bool, error) {
	n, err := tx.CountRecords(reconciliationLinesCollection, dbx.HashExp{"line": lineID, "finished": true})
	if err != nil {
		return false, fmt.Errorf("books: look up the line's reconciliation: %w", err)
	}
	return n > 0, nil
}

// refuseAccountReconciliations refuses a delete or a type change of an account
// that a reconciliation names: a finished one keeps it for good, one in
// progress until it is discarded.
func refuseAccountReconciliations(tx core.App, account *core.Record) error {
	finished, err := tx.CountRecords(reconciliationsCollection,
		dbx.HashExp{"account": account.Id, "status": reconcileFinished})
	if err != nil {
		return fmt.Errorf("books: count the account's finished reconciliations: %w", err)
	}
	if finished > 0 {
		return refuseNamed(msgAccountReconciled, accountDisplayName(account))
	}
	open, err := tx.CountRecords(reconciliationsCollection,
		dbx.HashExp{"account": account.Id, "status": reconcileInProgress})
	if err != nil {
		return fmt.Errorf("books: count the account's reconciliations in progress: %w", err)
	}
	if open > 0 {
		return refuseNamed(msgAccountReconciling, accountDisplayName(account))
	}
	return nil
}
