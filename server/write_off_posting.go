package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// postWriteOff posts a write-off while it is created, inside the create's
// transaction: any refusal rolls back every row it wrote. createWriteOff has
// already run the guards on r and read the invoice again. The entry (debit the
// chosen account, credit the Accounts receivable account the invoice's entry
// debited, both naming the invoice's customer, the write-off's memo) posts
// through postDocument, so postEntry runs every ledger rule; then the
// write-off takes its customer, number, entry and stamps, the invoice's
// balance falls and its written_off rises by the amount in one save, and the
// invoice's cash-basis rows are rebuilt. The write-off's own cash-basis rows
// are written after its create (registerWriteOffGuards).
func postWriteOff(tx core.App, r, invoice *core.Record, now time.Time) error {
	receivable, err := invoiceReceivable(tx, invoice)
	if err != nil {
		return err
	}
	amount := int64(r.GetInt("amount"))
	customer := invoice.GetString("customer")
	entry, err := postDocument(tx, documentPost{
		DocType:    docTypeWriteOff,
		DocumentID: r.Id,
		Date:       r.GetString("date"),
		Memo:       r.GetString("memo"),
		Actor:      r.GetString("posted_by"),
		Customer:   customer,
		Lines: []postingLine{
			{Account: r.GetString("account"), Debit: amount},
			{Account: receivable, Credit: amount},
		},
	})
	if err != nil {
		return err
	}
	r.Set("customer", customer)
	r.Set("number", entry.GetString("number"))
	r.Set("sequence", entry.GetInt("sequence"))
	r.Set("entry", entry.Id)
	r.Set("posted_at", now)
	r.Set("sort_key", salesDocSortKey(r))
	return shiftWrittenOff(tx, invoice.Id, amount)
}

// invoiceReceivable is the Accounts receivable account the invoice's entry
// debited: the write-off credits the receivable the invoice is open on, which
// need not be the first one of the chart.
func invoiceReceivable(tx core.App, invoice *core.Record) (string, error) {
	var row struct {
		Account string `db:"account"`
	}
	err := tx.DB().NewQuery(`
		SELECT l.account AS account FROM books_journal_lines l
		JOIN books_accounts a ON a.id = l.account
		WHERE l.entry = {:entry} AND a.type = 'accounts_receivable' AND l.debit > 0
		ORDER BY l.position, l.id LIMIT 1`).
		Bind(dbx.Params{"entry": invoice.GetString("entry")}).One(&row)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("books: the entry of invoice %s debits no Accounts receivable account", invoice.Id)
	}
	if err != nil {
		return "", fmt.Errorf("books: read the receivable of invoice %s: %w", invoice.Id, err)
	}
	return row.Account, nil
}

// voidWriteOff voids a posted write-off's entry while the write-off moves from
// posted to void, inside the update's transaction: the entry's own hook posts
// the void reversal in the original period under the same number (voidEntry),
// and the close date applies to it as to any post. The invoice is open again
// for the amount (its balance rises and its written_off falls), and both
// documents' cash-basis rows are rebuilt.
func voidWriteOff(tx core.App, r *core.Record, now time.Time) error {
	entryID := r.GetString("entry")
	if entryID == "" {
		return refuse(msgSalesDocNoEntry, writeOffName(r))
	}
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the write-off's journal entry: %w", err)
	}
	entry.Set("status", statusVoid)
	entry.Set("voided_by", r.GetString("voided_by"))
	if err := tx.Save(entry); err != nil {
		return err
	}
	r.Set("voided_at", now)
	if err := shiftWrittenOff(tx, r.GetString("invoice"), -int64(r.GetInt("amount"))); err != nil {
		return err
	}
	return rebuildCashBasisOf(tx, writeOffsCollection, r.Id)
}

// shiftWrittenOff raises the invoice's written_off by amount and lowers its
// balance by the same amount (a negative amount puts both back), in one save
// under the balancing mark (saveDocumentBalance), then rebuilds the invoice's
// cash-basis rows.
func shiftWrittenOff(tx core.App, invoiceID string, amount int64) error {
	invoice, err := tx.FindRecordById(invoiceKind.Collection, invoiceID)
	if err != nil {
		return fmt.Errorf("books: read the written-off invoice: %w", err)
	}
	invoice.Set("written_off", int64(invoice.GetInt("written_off"))+amount)
	if err := saveDocumentBalance(tx, invoiceBalanceKind, invoice, int64(invoice.GetInt("balance"))-amount); err != nil {
		return err
	}
	return rebuildCashBasisOf(tx, invoiceBalanceKind.Collection, invoiceID)
}
