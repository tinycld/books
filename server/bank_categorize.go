// A bank categorization adds a For review bank transaction to Books
// (bank-categorize spec §4 Server). A writer creates a
// books_bank_categorizations row to categorize the transaction (one account or
// a split) or to record it as a transfer, and deletes the row to undo. Go
// writes everything else in the create's transaction: the journal entry or the
// transfer, posted as the writer; the books_bank_matches row that matches the
// bank transaction to the entry's line on the connection's account (its own
// hook moves the transaction to reviewed); the entry stamp. The undo voids the
// entry, and the void returns the bank transaction to For review.

package books

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/appstate"
)

const (
	bankCategorizationsCollection = "books_bank_categorizations"
	bankCategorizeKindCategorize  = "categorize"
	bankCategorizeKindTransfer    = "transfer"
	// Spec §4 Schema: 1 to 50 lines, each memo at most 1000 characters (the
	// memo field of books_journal_lines).
	bankCategorizeMaxLines    = 50
	bankCategorizeMaxLineMemo = 1000

	msgCatBothPayees     = "Choose a customer or a vendor, not both."
	msgCatNoLine         = "Add a line with an account and an amount."
	msgCatLinesNotList   = "The lines must be a list of accounts and amounts."
	msgCatTooManyLines   = "A split holds at most 50 lines."
	msgCatLineShape      = "Line %d: enter an account and an amount."
	msgCatLineAccount    = "Line %d: choose an account."
	msgCatLineZero       = "Line %d: enter an amount other than 0."
	msgCatLineTooLarge   = "Line %d: the amount is too large."
	msgCatLineMemo       = "Line %d: the memo holds at most 1000 characters."
	msgCatNoAccount      = "Line %d: the account does not exist."
	msgCatInactive       = "Line %d: account %s is inactive."
	msgCatOwnAccount     = "Line %d: choose an account other than %s."
	msgCatPaymentAccount = "Line %d: record a customer payment with Receive payment, or a bill payment with Pay bills, then match it."
	msgCatTotal          = "The lines total %s. The bank transaction is %s."
	msgCatTransferLines  = "A transfer has one line: the other account."
	msgCatTransferAmount = "The transfer amount is %s. The bank transaction is %s."
	msgCatMatchOfAdded   = "This transaction was added to Books. Use Undo to void its entry."
)

// The three marks of a categorization's delete, keyed with
// appstate.Scoped(app, categorization id) as markVoiding keys its own: the
// request hook holds the app and the model hook the transaction, and both give
// the same key (appstate.ID reads the app's data dir, which a transaction
// shares).
//
//   - categorizeActors holds the id of the person whose request deletes the
//     row (the undo), so the void names them.
//   - categorizeUndoing marks a row whose delete hook is voiding its entry:
//     uncategorizeEntry, which that void runs, then leaves the row to the
//     delete under way.
//   - categorizeByVoid marks a row that uncategorizeEntry deletes because its
//     entry is being voided elsewhere: the delete hook then voids nothing. The
//     entries update hook runs transitionEntry before it writes the entry, so
//     the stored entry still reads posted while the row is deleted.
var (
	categorizeActors  sync.Map
	categorizeUndoing sync.Map
	categorizeByVoid  sync.Map
)

func setCategorizeMark(marks *sync.Map, app core.App, id string, value any) func() {
	key := appstate.Scoped(app, id)
	marks.Store(key, value)
	return func() { marks.Delete(key) }
}

func categorizeMark(marks *sync.Map, app core.App, id string) (any, bool) {
	return marks.Load(appstate.Scoped(app, id))
}

// registerBankCategorize binds the categorization hooks, each once. The create
// request hook only stamps who added (a superuser's value is kept, so the seed
// can name its user). The model hooks read other rows, so they run on every
// write, a Go caller's too, inside serialized. The request delete of a match
// is guarded in a request hook, so the void's own unmatchEntry (a model
// delete) passes.
func registerBankCategorize(app core.App) {
	app.OnRecordCreateRequest(bankCategorizationsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		stampActor(e.Record, "created_by", e.Auth)
		return e.Next()
	})
	app.OnRecordCreate(bankCategorizationsCollection).BindFunc(func(e *core.RecordEvent) error {
		var plan *bankCategorizePlan
		return serializedThen(e,
			func(tx core.App) error {
				var err error
				plan, err = checkBankCategorize(tx, e.Record)
				return err
			},
			func(tx core.App) error { return postBankCategorize(tx, e.Record, plan) })
	})
	app.OnRecordDeleteRequest(bankCategorizationsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Auth != nil && !e.Auth.IsSuperuser() {
			defer setCategorizeMark(&categorizeActors, e.App, e.Record.Id, e.Auth.Id)()
		}
		return e.Next()
	})
	app.OnRecordDelete(bankCategorizationsCollection).BindFunc(func(e *core.RecordEvent) error {
		return serialized(e, func(tx core.App) error { return undoBankCategorize(tx, e.Record) })
	})
	app.OnRecordDeleteRequest(bankMatchesCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		return serializedRequest(e, func(tx core.App) error {
			n, err := tx.CountRecords(bankCategorizationsCollection,
				dbx.HashExp{"bank_transaction": e.Record.GetString("bank_transaction")})
			if err != nil {
				return fmt.Errorf("books: look up the categorization of the match: %w", err)
			}
			if n > 0 {
				return refuse(msgCatMatchOfAdded)
			}
			return nil
		})
	})
}

// bankCategorizeLine is one line of the lines json, as the form sends it: an
// account id, an amount in minor units (positive for the bank transaction's
// own direction, negative for the other) and a memo.
type bankCategorizeLine struct {
	Account string `json:"account"`
	Amount  int64  `json:"amount"`
	Memo    string `json:"memo"`
}

// bankCategorizePlan is what the check found, for the writes after the save.
type bankCategorizePlan struct {
	txn        *core.Record
	bankAcct   string
	lines      []bankCategorizeLine
	bankAmount int64
}

// checkBankCategorize stamps the connection and refuses, in this order: a bank
// transaction that is not For review; both a customer and a vendor; lines of a
// bad shape; each line's account that does not exist, is inactive, is the
// connection's own, is an Accounts receivable or Accounts payable account, or
// (for a transfer) is of a type a transfer may not use; a sum that is not the
// bank amount; a transfer of more than one line or of another amount. Each
// text numbers the form's lines (1 is the first split line); posting would
// number the journal lines, where the bank line is line 1. A missing bank
// transaction and a kind that is not one of the two give nil: PocketBase's
// field validation, which runs next, refuses them.
func checkBankCategorize(tx core.App, r *core.Record) (*bankCategorizePlan, error) {
	r.Set("entry", "")
	txn, err := tx.FindRecordById("books_bank_transactions", r.GetString("bank_transaction"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the bank transaction to categorize: %w", err)
	}
	r.Set("connection", txn.GetString("connection"))
	switch txn.GetString("status") {
	case bankTxnStatusReviewed:
		return nil, refuse(msgBankMatchReviewed)
	case bankTxnStatusExcluded:
		return nil, refuse(msgBankMatchExcluded)
	}
	if r.GetString("customer") != "" && r.GetString("vendor") != "" {
		return nil, refuse(msgCatBothPayees)
	}
	kind := r.GetString("kind")
	if kind != bankCategorizeKindCategorize && kind != bankCategorizeKindTransfer {
		return nil, nil
	}
	lines, err := parseBankCategorizeLines(r)
	if err != nil {
		return nil, err
	}
	connection, err := tx.FindRecordById("books_bank_connections", txn.GetString("connection"))
	if err != nil {
		return nil, fmt.Errorf("books: read the bank transaction's connection: %w", err)
	}
	own, err := tx.FindRecordById("books_accounts", connection.GetString("account"))
	if err != nil {
		return nil, fmt.Errorf("books: read the connected account: %w", err)
	}
	for i, line := range lines {
		if err := checkBankCategorizeAccount(tx, i+1, line.Account, own, kind); err != nil {
			return nil, err
		}
	}
	bankAmount := int64(txn.GetInt("amount"))
	want := absCents(bankAmount)
	if kind == bankCategorizeKindTransfer && len(lines) != 1 {
		return nil, refuse(msgCatTransferLines)
	}
	var total int64
	for _, line := range lines {
		total += line.Amount
	}
	if total != want {
		s, err := loadSettings(tx)
		if err != nil {
			return nil, err
		}
		format := msgCatTotal
		if kind == bankCategorizeKindTransfer {
			format = msgCatTransferAmount
		}
		return nil, refuse(format, formatMoney(total, s.Currency), formatMoney(want, s.Currency))
	}
	return &bankCategorizePlan{txn: txn, bankAcct: own.Id, lines: lines, bankAmount: bankAmount}, nil
}

// parseBankCategorizeLines reads the lines json into typed lines and refuses
// a value that is not a list, no line, more than 50 lines, and a line with no
// account, an amount of 0 or too large, or a memo over 1000 characters.
func parseBankCategorizeLines(r *core.Record) ([]bankCategorizeLine, error) {
	var raw []json.RawMessage
	if err := r.UnmarshalJSONField("lines", &raw); err != nil {
		return nil, refuse(msgCatLinesNotList)
	}
	switch {
	case len(raw) == 0:
		return nil, refuse(msgCatNoLine)
	case len(raw) > bankCategorizeMaxLines:
		return nil, refuse(msgCatTooManyLines)
	}
	lines := make([]bankCategorizeLine, len(raw))
	for i, item := range raw {
		n := i + 1
		var line bankCategorizeLine
		if err := json.Unmarshal(item, &line); err != nil {
			return nil, refuse(msgCatLineShape, n)
		}
		switch {
		case line.Account == "":
			return nil, refuse(msgCatLineAccount, n)
		case line.Amount == 0:
			return nil, refuse(msgCatLineZero, n)
		case absCents(line.Amount) > maxAmount:
			return nil, refuse(msgCatLineTooLarge, n)
		case utf8.RuneCountInString(line.Memo) > bankCategorizeMaxLineMemo:
			return nil, refuse(msgCatLineMemo, n)
		}
		lines[i] = line
	}
	return lines, nil
}

// checkBankCategorizeAccount refuses line n's account when it does not exist,
// is inactive, is the connection's own account, is an Accounts receivable or
// Accounts payable account, or is of a type a transfer may not use.
func checkBankCategorizeAccount(tx core.App, n int, id string, own *core.Record, kind string) error {
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return refuse(msgCatNoAccount, n)
	}
	if err != nil {
		return fmt.Errorf("books: read the account of line %d: %w", n, err)
	}
	accountType := account.GetString("type")
	switch {
	case account.GetBool("inactive"):
		return refuse(msgCatInactive, n, account.GetString("name"))
	case account.Id == own.Id:
		return refuse(msgCatOwnAccount, n, accountDisplayName(own))
	case accountType == "accounts_receivable", accountType == "accounts_payable":
		return refuse(msgCatPaymentAccount, n)
	case kind == bankCategorizeKindTransfer && !isTransferAccountType(accountType):
		return refuse(msgNotTransferAccount, n, account.GetString("name"))
	}
	return nil
}

// bankCategorizeEntryLine is one line of the entry a categorization posts.
type bankCategorizeEntryLine struct {
	account       string
	debit, credit int64
	memo          string
	bank          bool
}

// bankCategorizeEntryLines builds the entry's lines in order. A categorize:
// line 1 on the connection's account for the bank amount (a credit for money
// out, a debit for money in), then each form line, a positive amount on the
// side opposite the bank line and a negative one on its side. A transfer, in
// the order checkTransfer holds: line 1 credits the account the money left,
// line 2 debits the account it entered.
func bankCategorizeEntryLines(plan *bankCategorizePlan, kind string) []bankCategorizeEntryLine {
	amount := absCents(plan.bankAmount)
	moneyOut := plan.bankAmount < 0
	bankLine := bankCategorizeEntryLine{account: plan.bankAcct, bank: true}
	if kind == bankCategorizeKindTransfer {
		other := bankCategorizeEntryLine{account: plan.lines[0].Account, memo: plan.lines[0].Memo}
		if moneyOut {
			bankLine.credit, other.debit = amount, amount
			return []bankCategorizeEntryLine{bankLine, other}
		}
		other.credit, bankLine.debit = amount, amount
		return []bankCategorizeEntryLine{other, bankLine}
	}
	if moneyOut {
		bankLine.credit = amount
	} else {
		bankLine.debit = amount
	}
	out := []bankCategorizeEntryLine{bankLine}
	for _, l := range plan.lines {
		line := bankCategorizeEntryLine{account: l.Account, memo: l.Memo}
		// A positive amount on a money-out transaction is a debit; a negative
		// one goes to the bank line's side, a credit. Money in mirrors it.
		if (l.Amount > 0) == moneyOut {
			line.debit = absCents(l.Amount)
		} else {
			line.credit = absCents(l.Amount)
		}
		out = append(out, line)
	}
	return out
}

// postBankCategorize writes the entry as a draft, with the payee on every
// line, and posts it as the actor through postDraft, so postEntry runs every
// ledger rule (close date, balance, accounts, checkTransfer, numbering,
// maxStoredAmount). It then saves the match of the bank transaction to the
// entry's line on the connection's account, whose own hook writes the match
// line and moves the bank transaction to reviewed, and stamps entry on the
// categorization with a model save, which no Books hook guards and core's
// audit (request hooks only) does not log. A nil plan is a create PocketBase's
// validation has already refused.
func postBankCategorize(tx core.App, r *core.Record, plan *bankCategorizePlan) error {
	if plan == nil {
		return nil
	}
	kind := r.GetString("kind")
	actor := r.GetString("created_by")
	entries, err := tx.FindCachedCollectionByNameOrId("books_journal_entries")
	if err != nil {
		return err
	}
	docType := docTypeJournal
	if kind == bankCategorizeKindTransfer {
		docType = docTypeTransfer
	}
	entry := core.NewRecord(entries)
	entry.Set("date", plan.txn.GetString("date"))
	entry.Set("status", statusDraft)
	entry.Set("doc_type", docType)
	entry.Set("origin", originManual)
	entry.Set("memo", r.GetString("memo"))
	entry.Set("created_by", actor)
	if err := tx.Save(entry); err != nil {
		return fmt.Errorf("books: write the entry of a categorization: %w", err)
	}
	linesCol, err := tx.FindCachedCollectionByNameOrId("books_journal_lines")
	if err != nil {
		return err
	}
	bankLineID := ""
	for i, l := range bankCategorizeEntryLines(plan, kind) {
		line := core.NewRecord(linesCol)
		line.Set("entry", entry.Id)
		line.Set("account", l.account)
		line.Set("debit", l.debit)
		line.Set("credit", l.credit)
		line.Set("position", i)
		line.Set("memo", l.memo)
		line.Set("customer", r.GetString("customer"))
		line.Set("vendor", r.GetString("vendor"))
		if err := tx.Save(line); err != nil {
			return fmt.Errorf("books: write a line of a categorization's entry: %w", err)
		}
		if l.bank {
			bankLineID = line.Id
		}
	}
	if err := postDraft(tx, entry.Id, actor); err != nil {
		return err
	}
	matches, err := tx.FindCachedCollectionByNameOrId(bankMatchesCollection)
	if err != nil {
		return err
	}
	match := core.NewRecord(matches)
	match.Set("bank_transaction", plan.txn.Id)
	match.Set("lines", []string{bankLineID})
	match.Set("created_by", actor)
	if err := tx.Save(match); err != nil {
		return err
	}
	r.Set("entry", entry.Id)
	if err := tx.Save(r); err != nil {
		return fmt.Errorf("books: stamp the entry of a categorization: %w", err)
	}
	return nil
}

// undoBankCategorize runs before a categorization is deleted. It voids the
// entry while it is posted, as the person who deleted the row (the entry's
// poster when no person did), so transitionEntry unmatches the bank
// transaction (back to For review) and voidEntry posts the reversal; the close
// date applies to that reversal. It voids nothing for a row whose bank
// transaction is gone (the cascade of a disconnect: the entry stays posted)
// and for a row uncategorizeEntry deletes (its entry's void is under way).
func undoBankCategorize(tx core.App, r *core.Record) error {
	if _, ok := categorizeMark(&categorizeByVoid, tx, r.Id); ok {
		return nil
	}
	_, err := tx.FindRecordById("books_bank_transactions", r.GetString("bank_transaction"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the bank transaction of an undone categorization: %w", err)
	}
	if r.GetString("entry") == "" {
		return nil
	}
	entry, err := tx.FindRecordById("books_journal_entries", r.GetString("entry"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("books: read the entry of an undone categorization: %w", err)
	}
	if entry.GetString("status") != statusPosted {
		return nil
	}
	actor := entry.GetString("posted_by")
	if id, ok := categorizeMark(&categorizeActors, tx, r.Id); ok {
		actor = id.(string)
	}
	defer setCategorizeMark(&categorizeUndoing, tx, r.Id, true)()
	entry.Set("status", statusVoid)
	entry.Set("voided_by", actor)
	return tx.Save(entry)
}

// uncategorizeEntry deletes the categorization that names the entry, in the
// transaction of the entry's void (transitionEntry), so a void or an edit made
// on the entry's own screen leaves no row behind. A row whose own delete is
// voiding the entry (the undo) is left to that delete.
func uncategorizeEntry(tx core.App, entryID string) error {
	rows, err := tx.FindAllRecords(bankCategorizationsCollection, dbx.HashExp{"entry": entryID})
	if err != nil {
		return fmt.Errorf("books: read the categorization of the voided entry: %w", err)
	}
	for _, row := range rows {
		if _, ok := categorizeMark(&categorizeUndoing, tx, row.Id); ok {
			continue
		}
		unmark := setCategorizeMark(&categorizeByVoid, tx, row.Id, true)
		err := tx.Delete(row)
		unmark()
		if err != nil {
			return fmt.Errorf("books: remove the categorization of the voided entry: %w", err)
		}
	}
	return nil
}
