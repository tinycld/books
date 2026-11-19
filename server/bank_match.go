// A bank match says that one imported bank transaction and one or more posted
// journal lines on its connection's account are the same money movement
// (bank-match spec §3, §4). A writer creates a books_bank_matches row to match
// and deletes it to undo; Go writes everything else: the books_bank_match_lines
// rows that make "a line is matched once" an index, and the bank transaction's
// move to and from reviewed. A match posts nothing, so the close date does not
// apply to it.

package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	bankMatchesCollection     = "books_bank_matches"
	bankMatchLinesCollection  = "books_bank_match_lines"
	bankTxnStatusReviewed     = "reviewed"
	bankTxnStatusExcluded     = "excluded"
	msgBankMatchReviewed      = "This transaction is already reviewed."
	msgBankMatchExcluded      = "This transaction is excluded. Move it to For review first."
	msgBankMatchNotPosted     = "%s is not posted."
	msgBankMatchVoid          = "%s is void."
	msgBankMatchNotOnAccount  = "%s is not on %s."
	msgBankMatchMoneyInForOut = "%s is money in; this bank transaction is money out."
	msgBankMatchMoneyOutForIn = "%s is money out; this bank transaction is money in."
	msgBankMatchTaken         = "%s is already matched to another bank transaction."
	msgBankMatchTotal         = "The chosen Books transactions total %s. The bank transaction is %s."
)

// registerBankMatch binds the match hooks, each once. The request hook only
// stamps who matched (a superuser's value is kept, so the seed can name its
// user). The model hooks read other rows, so they run on every save, a Go
// caller's too, inside serialized: two matches of one line, or a match beside
// a void of its entry, would each pass a check made outside one.
func registerBankMatch(app core.App) {
	app.OnRecordCreateRequest(bankMatchesCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordCreate(bankMatchesCollection).BindFunc(func(e *core.RecordEvent) error {
		var plan bankMatchPlan
		return serializedThen(e,
			func(tx core.App) error {
				var err error
				plan, err = checkBankMatch(tx, e.Record)
				return err
			},
			func(tx core.App) error { return saveBankMatch(tx, e.Record, plan) })
	})
	app.OnRecordDelete(bankMatchesCollection).BindFunc(func(e *core.RecordEvent) error {
		return serializedThen(e,
			func(core.App) error { return nil },
			func(tx core.App) error { return returnToReview(tx, e.Record.GetString("bank_transaction")) })
	})
}

// bankMatchLine is one checked line of a match: the journal line, its entry
// and the amount it adds to the match.
type bankMatchLine struct {
	line, entry string
	amount      int64
}

// bankMatchPlan is what the check found, for the writes after the save.
type bankMatchPlan struct {
	txn   *core.Record
	lines []bankMatchLine
}

// checkBankMatch stamps the match's connection and refuses a bank transaction
// that is not For review, each line that cannot be matched, and a sum that is
// not the bank amount. A missing bank transaction or line, no line, and more
// than 50 lines are left to PocketBase's field validation, which runs next.
func checkBankMatch(tx core.App, r *core.Record) (bankMatchPlan, error) {
	txn, err := tx.FindRecordById("books_bank_transactions", r.GetString("bank_transaction"))
	if errors.Is(err, sql.ErrNoRows) {
		return bankMatchPlan{}, nil
	}
	if err != nil {
		return bankMatchPlan{}, fmt.Errorf("books: read the bank transaction to match: %w", err)
	}
	r.Set("connection", txn.GetString("connection"))
	switch txn.GetString("status") {
	case bankTxnStatusReviewed:
		return bankMatchPlan{}, refuse(msgBankMatchReviewed)
	case bankTxnStatusExcluded:
		return bankMatchPlan{}, refuse(msgBankMatchExcluded)
	}
	ids := r.GetStringSlice("lines")
	if len(ids) == 0 {
		return bankMatchPlan{}, nil
	}
	connection, err := tx.FindRecordById("books_bank_connections", txn.GetString("connection"))
	if err != nil {
		return bankMatchPlan{}, fmt.Errorf("books: read the bank transaction's connection: %w", err)
	}
	account, err := tx.FindRecordById("books_accounts", connection.GetString("account"))
	if err != nil {
		return bankMatchPlan{}, fmt.Errorf("books: read the connected account: %w", err)
	}
	bankAmount := int64(txn.GetInt("amount"))
	plan := bankMatchPlan{txn: txn}
	var total int64
	for _, id := range ids {
		line, err := checkMatchLine(tx, id, account, bankAmount)
		if err != nil {
			return bankMatchPlan{}, err
		}
		if line == nil {
			return bankMatchPlan{}, nil
		}
		plan.lines = append(plan.lines, *line)
		total += line.amount
	}
	if want := absCents(bankAmount); total != want {
		s, err := loadSettings(tx)
		if err != nil {
			return bankMatchPlan{}, err
		}
		return bankMatchPlan{}, refuse(msgBankMatchTotal, formatMoney(total, s.Currency), formatMoney(want, s.Currency))
	}
	return plan, nil
}

// checkMatchLine refuses a line that cannot be matched to a bank transaction
// of bankAmount on account, in this order: its entry is not posted, is void or
// is a void reversal; the line is on another account; its side does not fit
// (money in matches a debit, money out a credit); it is matched already. A
// missing line gives nil: checkBankMatch then skips the sum check, and
// PocketBase's relation validation of lines refuses the create.
func checkMatchLine(tx core.App, lineID string, account *core.Record, bankAmount int64) (*bankMatchLine, error) {
	line, err := tx.FindRecordById("books_journal_lines", lineID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the line to match: %w", err)
	}
	entry, err := tx.FindRecordById("books_journal_entries", line.GetString("entry"))
	if err != nil {
		return nil, fmt.Errorf("books: read the entry of the line to match: %w", err)
	}
	name := entryName(entry)
	switch {
	case entry.GetString("status") == statusVoid, entry.GetString("origin") == originVoidReversal:
		return nil, refuseNamed(msgBankMatchVoid, name)
	case entry.GetString("status") != statusPosted, !line.GetBool("posted"):
		return nil, refuseNamed(msgBankMatchNotPosted, name)
	case line.GetString("account") != account.Id:
		return nil, refuseNamed(msgBankMatchNotOnAccount, name, accountDisplayName(account))
	}
	debit, credit := int64(line.GetInt("debit")), int64(line.GetInt("credit"))
	amount := credit
	switch {
	case bankAmount > 0 && debit == 0:
		return nil, refuseNamed(msgBankMatchMoneyOutForIn, name)
	case bankAmount > 0:
		amount = debit
	case credit == 0:
		return nil, refuseNamed(msgBankMatchMoneyInForOut, name)
	}
	matched, err := isLineMatched(tx, line.Id)
	if err != nil {
		return nil, err
	}
	if matched {
		return nil, refuseNamed(msgBankMatchTaken, name)
	}
	return &bankMatchLine{line: line.Id, entry: entry.Id, amount: amount}, nil
}

// saveBankMatch writes one match-line row for each line and moves the bank
// transaction to reviewed, in the match's transaction after it is saved. The
// unique index on line is the last guard: a refusal there is the "already
// matched" text.
func saveBankMatch(tx core.App, match *core.Record, plan bankMatchPlan) error {
	col, err := tx.FindCachedCollectionByNameOrId(bankMatchLinesCollection)
	if err != nil {
		return fmt.Errorf("books: find %s: %w", bankMatchLinesCollection, err)
	}
	for _, l := range plan.lines {
		row := core.NewRecord(col)
		row.Set("match", match.Id)
		row.Set("bank_transaction", plan.txn.Id)
		row.Set("line", l.line)
		row.Set("entry", l.entry)
		row.Set("amount", l.amount)
		if err := tx.Save(row); err != nil {
			if isNotUnique(err) {
				return matchTakenRefusal(tx, l.entry)
			}
			return fmt.Errorf("books: store a matched line: %w", err)
		}
	}
	return setBankTxnStatus(tx, plan.txn.Id, bankTxnStatusReviewed)
}

func matchTakenRefusal(tx core.App, entryID string) error {
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the entry of a matched line: %w", err)
	}
	return refuseNamed(msgBankMatchTaken, entryName(entry))
}

// returnToReview moves an undone match's bank transaction back to For review.
// A bank transaction that is gone is the cascade of its own delete, which
// removes the match after it.
func returnToReview(tx core.App, txnID string) error {
	_, err := tx.FindRecordById("books_bank_transactions", txnID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the bank transaction of an undone match: %w", err)
	}
	return setBankTxnStatus(tx, txnID, bankTxnStatusForReview)
}

func setBankTxnStatus(tx core.App, txnID, status string) error {
	txn, err := tx.FindRecordById("books_bank_transactions", txnID)
	if err != nil {
		return fmt.Errorf("books: read the matched bank transaction: %w", err)
	}
	txn.Set("status", status)
	if err := tx.Save(txn); err != nil {
		return fmt.Errorf("books: move the bank transaction to %s: %w", status, err)
	}
	return nil
}

// isLineMatched reports whether a bank transaction is matched to the journal
// line: one lookup on the unique line index of books_bank_match_lines.
func isLineMatched(tx core.App, lineID string) (bool, error) {
	n, err := tx.CountRecords(bankMatchLinesCollection, dbx.HashExp{"line": lineID})
	if err != nil {
		return false, fmt.Errorf("books: look up the line's match: %w", err)
	}
	return n > 0, nil
}

// unmatchEntry deletes every match that holds a line of the entry, through
// tx.Delete so the match's delete hook returns each bank transaction to For
// review. It runs in the transaction of the entry's void (transitionEntry).
func unmatchEntry(tx core.App, entryID string) error {
	rows, err := tx.FindAllRecords(bankMatchLinesCollection, dbx.HashExp{"entry": entryID})
	if err != nil {
		return fmt.Errorf("books: read the matches of the voided entry: %w", err)
	}
	seen := map[string]bool{}
	for _, row := range rows {
		id := row.GetString("match")
		if seen[id] {
			continue
		}
		seen[id] = true
		match, err := tx.FindRecordById(bankMatchesCollection, id)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return fmt.Errorf("books: read a match of the voided entry: %w", err)
		}
		if err := tx.Delete(match); err != nil {
			return fmt.Errorf("books: remove a match of the voided entry: %w", err)
		}
	}
	return nil
}
