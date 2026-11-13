package books

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Where a sales receipt's money goes (spec §3.3, §4.3). The Books setting
// "Sales deposited to" (books_settings.sales_deposit_account) is either empty,
// "Ask": the form shows Deposit to and the receipt names an active bank or
// Undeposited funds account; or an account: Books writes that account to every
// receipt it creates, updates or posts, whatever the client sent.

// salesDepositAccount is the account "Sales deposited to" names, "" for Ask.
// It reads the settings row through tx, so a guard sees the setting of its
// own transaction.
func salesDepositAccount(tx core.App) (string, error) {
	s, err := tx.FindRecordById("books_settings", settingsID)
	if err != nil {
		return "", fmt.Errorf("books: read the sales deposit setting: %w", err)
	}
	return s.GetString("sales_deposit_account"), nil
}

// isDepositAccount reports whether a sale may be deposited to account: an
// active bank account, or an active Undeposited funds account.
func isDepositAccount(account *core.Record) bool {
	if account.GetBool("inactive") {
		return false
	}
	return account.GetString("type") == "bank" || account.GetString("detail_type") == "undeposited_funds"
}

// checkReceiptDeposit is the deposit guard of a draft write. With an account
// set it stamps that account (stampSetDeposit). With Ask it checks the
// receipt's account on a create and on an update that changes it: a draft
// keeps an account that became inactive after it was chosen, and Post checks
// it again (checkReceiptDepositToPost). stored is the row before an update,
// nil on a create.
func checkReceiptDeposit(tx core.App, stored, r *core.Record) error {
	set, err := stampSetDeposit(tx, r)
	if err != nil || set {
		return err
	}
	id := r.GetString("deposit_to")
	if stored != nil && stored.GetString("deposit_to") == id {
		return nil
	}
	return checkDepositAccount(tx, id)
}

// checkReceiptDepositToPost is the receipt's BeforePost: it stamps the set
// account, then checks the account the receipt posts to, changed or not.
func checkReceiptDepositToPost(tx core.App, doc *core.Record) error {
	if _, err := stampSetDeposit(tx, doc); err != nil {
		return err
	}
	return checkDepositAccount(tx, doc.GetString("deposit_to"))
}

// stampSetDeposit writes the account "Sales deposited to" names to r's
// deposit_to and reports whether one is set. With Ask it changes nothing.
func stampSetDeposit(tx core.App, r *core.Record) (bool, error) {
	set, err := salesDepositAccount(tx)
	if err != nil || set == "" {
		return false, err
	}
	r.Set("deposit_to", set)
	return true, nil
}

// checkDepositAccount refuses, under deposit_to, an account a sale cannot be
// deposited to: one that does not exist, is inactive, or is neither a bank
// nor an Undeposited funds account. An empty one is refused too, with the
// text that says to add one when the chart has no deposit account at all. It
// runs before PocketBase's own required check, so these texts are the ones
// the client shows.
func checkDepositAccount(tx core.App, id string) error {
	if id == "" {
		n, err := tx.CountRecords("books_accounts", dbx.HashExp{"inactive": false},
			dbx.Or(dbx.HashExp{"type": "bank"}, dbx.HashExp{"detail_type": "undeposited_funds"}))
		if err != nil {
			return fmt.Errorf("books: count the deposit accounts: %w", err)
		}
		if n == 0 {
			return refuseField("deposit_to", msgReceiptDepositNone)
		}
		return refuseField("deposit_to", msgReceiptDepositInvalid)
	}
	account, err := tx.FindRecordById("books_accounts", id)
	if errors.Is(err, sql.ErrNoRows) {
		return refuseField("deposit_to", msgReceiptDepositInvalid)
	}
	if err != nil {
		return fmt.Errorf("books: read the receipt's deposit account: %w", err)
	}
	if !isDepositAccount(account) {
		return refuseField("deposit_to", msgReceiptDepositInvalid)
	}
	return nil
}
