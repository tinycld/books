package books

import (
	"cmp"
	"database/sql"
	"errors"
	"fmt"
	"strings"

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
// and takes its number. Customer (a sales document's) or Vendor (a purchase
// document's) is named on every line; the other is empty.
type documentPost struct {
	DocType, DocumentID, Date, Memo, Actor, Customer, Vendor, Replaces string
	Lines                                                              []postingLine
}

// postingLine is one line of a document's entry: one side is 0.
type postingLine struct {
	Account       string
	Debit, Credit int64
}

// postDocument creates the entry draft and its lines, in order, each naming
// the party, posts it as the actor and returns the posted entry. It runs
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
			line.Set("vendor", p.Vendor)
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
	return ensureControlAccount(tx, controlAccount{
		match: dbx.HashExp{"type": "accounts_receivable"},
		name:  "Accounts receivable", typ: "accounts_receivable", detailType: "accounts_receivable", number: "1100",
	})
}

// ensurePayables returns the active Accounts payable account a bill credits:
// the first in chart order, as ensureReceivables picks. A chart with none gets
// "Accounts payable" (or "Accounts payable 2" when an inactive one holds the
// name), numbered 2000 when no account holds that number. It runs inside the
// posting transaction, so a refused post rolls it back.
func ensurePayables(tx core.App) (*core.Record, error) {
	return ensureControlAccount(tx, controlAccount{
		match: dbx.HashExp{"type": "accounts_payable"},
		name:  "Accounts payable", typ: "accounts_payable", detailType: "accounts_payable", number: "2000",
	})
}

// controlAccount is an account Books creates when a posting needs it and the
// chart has none: the accounts that match, and what a new one is.
type controlAccount struct {
	match                         dbx.HashExp
	name, typ, detailType, number string
}

// ensureControlAccount returns the first active account that matches a, in
// chart order (by number, unnumbered last, then id; accounts have no sort
// key), or creates one in tx: named a.name (a.name 2 when an inactive
// top-level account keeps the name), numbered a.number when no account holds
// that number, else unnumbered.
func ensureControlAccount(tx core.App, a controlAccount) (*core.Record, error) {
	match := dbx.HashExp{"inactive": false}
	for k, v := range a.match {
		match[k] = v
	}
	found := &core.Record{}
	err := tx.RecordQuery("books_accounts").
		AndWhere(match).
		OrderBy("[[number]] = '' ASC", "[[number]] ASC", "[[id]] ASC").
		Limit(1).
		One(found)
	if err == nil {
		return found, nil
	}
	label := strings.ToLower(a.name)
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("books: read the %s account: %w", label, err)
	}
	number := a.number
	taken, err := tx.CountRecords("books_accounts", dbx.HashExp{"number": number})
	if err != nil {
		return nil, fmt.Errorf("books: read account numbers: %w", err)
	}
	if taken > 0 {
		number = ""
	}
	name, err := freeTopLevelName(tx, a.name)
	if err != nil {
		return nil, err
	}
	col, err := tx.FindCachedCollectionByNameOrId("books_accounts")
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("name", name)
	r.Set("type", a.typ)
	r.Set("detail_type", a.detailType)
	r.Set("number", number)
	if err := tx.Save(r); err != nil {
		return nil, fmt.Errorf("books: create the %s account: %w", label, err)
	}
	return r, nil
}

// ensureUndepositedFunds returns the active Undeposited funds account (detail
// type undeposited_funds) money waits in before a bank deposit: the first in
// chart order, as ensureReceivables picks. A chart with none gets
// "Undeposited funds" (or "Undeposited funds 2" when an inactive one holds the
// name), an other current asset numbered 1200 when no account holds that
// number. It runs inside the caller's transaction, so a refused write rolls it
// back. Receive payment and bank deposit (later units) call it; no sales
// receipt path does: a sales receipt posts to its Deposit to account and never
// creates one.
func ensureUndepositedFunds(tx core.App) (*core.Record, error) {
	return ensureControlAccount(tx, controlAccount{
		match: dbx.HashExp{"detail_type": "undeposited_funds"},
		name:  "Undeposited funds", typ: "other_current_asset", detailType: "undeposited_funds", number: "1200",
	})
}
