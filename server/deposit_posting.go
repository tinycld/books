package books

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// postDeposit posts a draft deposit while its update moves it from draft to
// posted, inside the update's transaction: any refusal rolls back every row it
// wrote (the entry, the number, the items). The header guards have already run
// on r. In order (bank deposit spec §3.7): the posted original of a
// correction; Deposit to is still an active bank account; a correction
// releases its original's items, so it may deposit them again; each item's
// line is read again (checkDepositItems) and each other funds line checked
// again; the total is above 0. The entry (debit Deposit to for the total,
// credit each Undeposited funds account for the net of its items, debit it
// for a net below 0, and post each other funds line on its account with its
// description and party) posts through postDocument, so postEntry runs every
// ledger rule (the close date among them) and numbers it from the deposit
// sequence; then the items are marked posted with their amounts, the deposit
// takes its number, entry and totals, and a correction's original becomes
// void with replaced_by.
func postDeposit(tx core.App, r *core.Record, now time.Time) error {
	original, err := correctedDeposit(tx, r)
	if err != nil {
		return err
	}
	account, err := checkDepositTo(tx, r)
	if err != nil {
		return err
	}
	if original != nil {
		if err := releaseDepositItems(tx, original.Id); err != nil {
			return err
		}
	}
	items, err := checkDepositItems(tx, r)
	if err != nil {
		return err
	}
	lines, err := checkDepositLines(tx, r)
	if err != nil {
		return err
	}
	var itemsTotal, linesTotal int64
	nets := map[string]int64{}
	var fundsAccounts []string
	for _, it := range items {
		if _, seen := nets[it.account]; !seen {
			fundsAccounts = append(fundsAccounts, it.account)
		}
		nets[it.account] += it.amount
		itemsTotal += it.amount
	}
	for _, l := range lines {
		linesTotal += int64(l.GetInt("amount"))
	}
	total := itemsTotal + linesTotal
	if total <= 0 {
		return refuse(msgDepositTotalAboveZero)
	}
	if total > maxStoredAmount {
		return refuse(msgPaymentAmountTooLarge)
	}
	posting := []postingLine{{Account: account.Id, Debit: total}}
	for _, id := range fundsAccounts {
		posting = appendSigned(posting, postingLine{Account: id}, -nets[id])
	}
	for _, l := range lines {
		posting = appendSigned(posting, postingLine{
			Account:  l.GetString("account"),
			Memo:     l.GetString("description"),
			Customer: l.GetString("customer"),
			Vendor:   l.GetString("vendor"),
		}, -int64(l.GetInt("amount")))
	}
	actor := r.GetString("posted_by")
	post := documentPost{
		DocType:    docTypeDeposit,
		DocumentID: r.Id,
		Date:       r.GetString("date"),
		Memo:       r.GetString("memo"),
		Actor:      actor,
		Lines:      posting,
	}
	if original != nil {
		post.Replaces = original.GetString("entry")
	}
	entry, err := postDocument(tx, post)
	if err != nil {
		return err
	}
	if err := markDepositItemsPosted(tx, r.Id, items); err != nil {
		return err
	}
	r.Set("number", entry.GetString("number"))
	r.Set("sequence", entry.GetInt("sequence"))
	r.Set("entry", entry.Id)
	r.Set("total", total)
	r.Set("items_total", itemsTotal)
	r.Set("lines_total", linesTotal)
	r.Set("posted_at", now)
	r.Set("sort_key", salesDocSortKey(r))
	if original == nil {
		return nil
	}
	return voidReplacedDeposit(tx, original, r, actor, now)
}

// appendSigned appends l with signed as its side: a debit when above 0, a
// credit when below, and no line at 0.
func appendSigned(lines []postingLine, l postingLine, signed int64) []postingLine {
	switch {
	case signed > 0:
		l.Debit = signed
	case signed < 0:
		l.Credit = -signed
	default:
		return lines
	}
	return append(lines, l)
}

// correctedDeposit is the posted deposit a correction replaces, nil for a
// deposit that replaces none. Only a posted deposit with its entry can be
// corrected: a void one is already replaced or voided. The draft guard and the
// post both check it, the post inside the posting transaction.
func correctedDeposit(tx core.App, r *core.Record) (*core.Record, error) {
	id := r.GetString("replaces")
	if id == "" {
		return nil, nil
	}
	original, err := tx.FindRecordById(depositsCollection, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, refuse(msgDepositEditMissing)
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the deposit being edited: %w", err)
	}
	if original.GetString("status") != statusPosted {
		return nil, refuse(msgDepositOnlyPostedEdits)
	}
	if original.GetString("entry") == "" {
		return nil, refuse(msgSalesDocNoEntry, depositName(original))
	}
	return original, nil
}

// depositItem is one item as the post reads it: the stored row, with the
// account and the amount of its line.
type depositItem struct {
	record  *core.Record
	line    *core.Record
	entry   *core.Record
	account string
	amount  int64
}

// checkDepositItems reads the deposit's items in position order and each
// one's line again, and refuses, keyed items.<rank>: a line that is no longer
// an undeposited item (checkDepositItemLine: "Payment 1004 is void."), one a
// posted deposit holds ("Payment 1004 is already in Deposit 1002."), and one
// dated after the deposit ("Payment 1004 is dated after the deposit date.").
func checkDepositItems(tx core.App, r *core.Record) ([]depositItem, error) {
	records, err := tx.FindRecordsByFilter(depositItemsCollection, "deposit = {:id}", "position,id", 0, 0,
		dbx.Params{"id": r.Id})
	if err != nil {
		return nil, fmt.Errorf("books: read the deposit's items: %w", err)
	}
	if len(records) > maxDepositItems {
		return nil, refuse(msgDepositTooManyItems)
	}
	items := make([]depositItem, len(records))
	for i, it := range records {
		field := fmt.Sprintf("items.%d", i)
		line, entry, err := checkDepositItemLine(tx, field, it.GetString("line"))
		if err != nil {
			return nil, err
		}
		holder, err := depositHoldingLine(tx, line.Id)
		if err != nil {
			return nil, err
		}
		if holder != nil && holder.Id != r.Id {
			return nil, refuseNamedField(field, msgDepositItemInDeposit, entryName(entry), holder.GetString("number"))
		}
		// Both are stored YYYY-MM-DD text, so they compare as days.
		if entry.GetString("date") > r.GetString("date") {
			return nil, refuseNamedField(field, msgDepositItemAfterDate, entryName(entry))
		}
		items[i] = depositItem{
			record: it, line: line, entry: entry, account: line.GetString("account"),
			amount: int64(line.GetInt("debit")) - int64(line.GetInt("credit")),
		}
	}
	return items, nil
}

// checkDepositLines reads the deposit's other funds lines in position order
// and checks each again (checkDepositLineFields).
func checkDepositLines(tx core.App, r *core.Record) ([]*core.Record, error) {
	lines, err := tx.FindRecordsByFilter(depositLinesCollection, "deposit = {:id}", "position,id", 0, 0,
		dbx.Params{"id": r.Id})
	if err != nil {
		return nil, fmt.Errorf("books: read the deposit's lines: %w", err)
	}
	if len(lines) > maxDepositLines {
		return nil, refuse(msgDepositTooManyLines)
	}
	for i, l := range lines {
		if err := checkDepositLineFields(tx, r, l, i); err != nil {
			return nil, err
		}
	}
	return lines, nil
}

// markDepositItemsPosted writes each item's copy of its line again, its amount
// and posted = true. The partial unique index on posted items refuses a line
// that another post marked first.
func markDepositItemsPosted(app core.App, depositID string, items []depositItem) error {
	return writeDepositItems(app, depositID, func(tx core.App) error {
		for _, it := range items {
			if err := copyDepositItem(tx, it.record, it.line, it.entry); err != nil {
				return err
			}
			it.record.Set("posted", true)
			if err := tx.Save(it.record); err != nil {
				return err
			}
		}
		return nil
	})
}

// releaseDepositItems marks every item of a deposit not posted, so its lines
// are undeposited items again: a void, and a correction's post for its
// original.
func releaseDepositItems(app core.App, depositID string) error {
	return writeDepositItems(app, depositID, func(tx core.App) error {
		items, err := tx.FindAllRecords(depositItemsCollection, dbx.HashExp{"deposit": depositID, "posted": true})
		if err != nil {
			return fmt.Errorf("books: read the deposit's items: %w", err)
		}
		for _, it := range items {
			it.Set("posted", false)
			if err := tx.Save(it); err != nil {
				return err
			}
		}
		return nil
	})
}

// writeDepositItems runs write in a transaction (the caller's, or a new one)
// under depositItemsMark, so the item guard lets Books' own item writes
// through. write gets the transaction and makes every read and write on it.
func writeDepositItems(app core.App, depositID string, write func(tx core.App) error) error {
	return app.RunInTransaction(func(tx core.App) error {
		defer setTxMark(tx, depositItemsMark, depositID)()
		return write(tx)
	})
}

// depositHolding is the posted deposit that holds a posted item of the entry,
// nil when none does. A line is held by at most one posted deposit (the
// partial unique index); when posted deposits hold more than one line of the
// entry, the deposit of the first item found is returned.
func depositHolding(tx core.App, entryID string) (*core.Record, error) {
	return depositHoldingBy(tx, "entry", entryID)
}

// depositHoldingLine is depositHolding for one journal line.
func depositHoldingLine(tx core.App, lineID string) (*core.Record, error) {
	return depositHoldingBy(tx, "line", lineID)
}

// depositHoldingBy reads the first posted item whose field (entry or line, a
// constant of this file) is id, and its deposit.
func depositHoldingBy(tx core.App, field, id string) (*core.Record, error) {
	item, err := tx.FindFirstRecordByFilter(depositItemsCollection, field+" = {:id} && posted = true", dbx.Params{"id": id})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("books: read the posted deposit items of %s %s: %w", field, id, err)
	}
	deposit, err := tx.FindRecordById(depositsCollection, item.GetString("deposit"))
	if err != nil {
		return nil, fmt.Errorf("books: read the deposit that holds %s %s: %w", field, id, err)
	}
	return deposit, nil
}

// refuseHeldByDeposit refuses the void of an entry whose line a posted
// deposit holds: "Payment 1004 is in Deposit 1002. Remove it from the deposit
// first." transitionEntry calls it on every void.
func refuseHeldByDeposit(tx core.App, entry *core.Record) error {
	deposit, err := depositHolding(tx, entry.Id)
	if err != nil || deposit == nil {
		return err
	}
	return refuseNamed(msgDepositItemHeld, entryName(entry), deposit.GetString("number"))
}

// voidReplacedDeposit sets the original of a posted correction void with
// replaced_by. Its entry is already void (the correction's entry replaced it)
// and its items were released before the correction's were checked.
func voidReplacedDeposit(tx core.App, original, correction *core.Record, actor string, now time.Time) error {
	defer setTxMark(tx, depositReplacingMark, original.Id)()
	fresh, err := tx.FindRecordById(depositsCollection, original.Id)
	if err != nil {
		return err
	}
	fresh.Set("status", statusVoid)
	fresh.Set("replaced_by", correction.Id)
	fresh.Set("voided_by", actor)
	fresh.Set("voided_at", now)
	return tx.Save(fresh)
}

// voidDeposit voids a posted deposit's entry while the deposit moves from
// posted to void, inside the update's transaction: the entry's own hook posts
// the void reversal in the original period under the same number (voidEntry),
// the close date applies to it as to any post, and a bank match on its bank
// line is removed (unmatchEntry). The items are released, so their lines are
// undeposited items again.
func voidDeposit(tx core.App, r *core.Record, now time.Time) error {
	entryID := r.GetString("entry")
	if entryID == "" {
		return refuse(msgSalesDocNoEntry, depositName(r))
	}
	entry, err := tx.FindRecordById("books_journal_entries", entryID)
	if err != nil {
		return fmt.Errorf("books: read the deposit's journal entry: %w", err)
	}
	entry.Set("status", statusVoid)
	entry.Set("voided_by", r.GetString("voided_by"))
	if err := tx.Save(entry); err != nil {
		return err
	}
	r.Set("voided_at", now)
	return releaseDepositItems(tx, r.Id)
}
