package books

import (
	"cmp"
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// A document (an invoice; later a sales receipt, a bill) posts by writing a
// journal entry of its own doc type with origin document. The posting rules
// stay the journal's: postDocument only builds the entry and its lines, then
// posts the draft through the same update hook a person's post takes, so
// postEntry runs every ledger rule (close date, balance, accounts, numbering,
// the correction's void). Only Books writes these entries: the request hooks
// in entries.go refuse a person's create, status change, reversal or
// correction of one.

// documentPost is one document's posting. Replaces is the journal entry of the
// posted document this one corrects ("" for none): the new entry replaces it
// and takes its number. Customer is named on every line.
type documentPost struct {
	DocType, DocumentID, Date, Memo, Actor, Customer, Replaces string
	Lines                                                      []postingLine
}

// postingLine is one line of a document's entry: one side is 0.
type postingLine struct {
	Account       string
	Debit, Credit int64
}

// postDocument creates the entry draft and its lines, in order, each naming
// the customer, posts it as the actor and returns the posted entry. It runs
// in the caller's transaction, or opens one: a refusal leaves nothing written.
func postDocument(tx core.App, p documentPost) (*core.Record, error) {
	var posted *core.Record
	err := tx.RunInTransaction(func(tx core.App) error {
		entries, err := tx.FindCachedCollectionByNameOrId("books_journal_entries")
		if err != nil {
			return err
		}
		entry := core.NewRecord(entries)
		entry.Set("date", p.Date)
		entry.Set("status", statusDraft)
		entry.Set("doc_type", p.DocType)
		entry.Set("origin", originDocument)
		entry.Set("document", p.DocumentID)
		entry.Set("memo", p.Memo)
		entry.Set("replaces", p.Replaces)
		entry.Set("created_by", p.Actor)
		if err := tx.Save(entry); err != nil {
			return err
		}
		lines, err := tx.FindCachedCollectionByNameOrId("books_journal_lines")
		if err != nil {
			return err
		}
		for i, l := range p.Lines {
			line := core.NewRecord(lines)
			line.Set("entry", entry.Id)
			line.Set("account", l.Account)
			line.Set("debit", l.Debit)
			line.Set("credit", l.Credit)
			line.Set("position", i)
			line.Set("customer", p.Customer)
			if err := tx.Save(line); err != nil {
				return err
			}
		}
		if err := postDraft(tx, entry.Id, p.Actor); err != nil {
			return err
		}
		posted, err = tx.FindRecordById("books_journal_entries", entry.Id)
		return err
	})
	if err != nil {
		return nil, err
	}
	return posted, nil
}

// compareChartOrder orders accounts as a chart does: numbered first by number,
// unnumbered last, then by id. It is the Go form of ensureReceivables' ORDER BY.
func compareChartOrder(aNumber, aID, bNumber, bID string) int {
	return cmp.Or(
		cmp.Compare(boolRank(aNumber == ""), boolRank(bNumber == "")),
		cmp.Compare(aNumber, bNumber),
		cmp.Compare(aID, bID),
	)
}

func boolRank(b bool) int {
	if b {
		return 1
	}
	return 0
}

// ensureReceivables returns the active Accounts receivable account a document
// posts to: the first in chart order (by number, unnumbered last; accounts
// have no sort key). A chart with none (a skipped starter chart,
// a hand-made chart) gets "Accounts receivable" (or "Accounts receivable 2"
// when an inactive one holds the name), numbered 1100 when no account holds
// that number, as ensureRetainedEarnings gives one retained earnings. It
// runs inside the posting transaction, so a refused post rolls it back.
func ensureReceivables(tx core.App) (*core.Record, error) {
	found := &core.Record{}
	err := tx.RecordQuery("books_accounts").
		AndWhere(dbx.HashExp{"type": "accounts_receivable", "inactive": false}).
		OrderBy("[[number]] = '' ASC", "[[number]] ASC", "[[id]] ASC").
		Limit(1).
		One(found)
	if err == nil {
		return found, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("books: read the accounts receivable account: %w", err)
	}
	number := "1100"
	taken, err := tx.CountRecords("books_accounts", dbx.HashExp{"number": number})
	if err != nil {
		return nil, fmt.Errorf("books: read account numbers: %w", err)
	}
	if taken > 0 {
		number = ""
	}
	// An inactive top-level "Accounts receivable" keeps its name.
	name, err := freeTopLevelName(tx, "Accounts receivable")
	if err != nil {
		return nil, err
	}
	col, err := tx.FindCachedCollectionByNameOrId("books_accounts")
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("name", name)
	r.Set("type", "accounts_receivable")
	r.Set("detail_type", "accounts_receivable")
	r.Set("number", number)
	if err := tx.Save(r); err != nil {
		return nil, fmt.Errorf("books: create the accounts receivable account: %w", err)
	}
	return r, nil
}
