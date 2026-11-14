package books

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// checkOpeningEntry refuses a second live opening entry. The entry being
// replaced is the one allowed exception: it is posted, and posting the
// replacement voids it in the same transaction.
func checkOpeningEntry(app core.App, entry *core.Record) error {
	if entry.GetString("origin") != originOpeningBalance {
		return nil
	}
	others, err := app.FindRecordsByFilter("books_journal_entries",
		"origin = 'opening_balance' && status != 'void' && id != {:self} && id != {:replaces}",
		"", 1, 0, dbx.Params{"self": entry.Id, "replaces": entry.GetString("replaces")})
	if err != nil {
		return fmt.Errorf("books: read opening entries: %w", err)
	}
	if len(others) == 0 {
		return nil
	}
	return refuse("Opening balances are already entered (%s). Edit that entry.", openingEntryLabel(others[0]))
}

// Refusals of an opening entry's lines. %d is the line number, %s the
// account's name.
const (
	msgOpeningRepeatedAccount = "Opening balances: line %d repeats %s. Enter one amount for each account."
	msgOpeningProfitAndLoss   = "Opening balances: line %d is on %s, an income or expense account. Use asset, liability and equity accounts."
	msgOpeningParty           = "Opening balances: line %d names a customer or a vendor. An opening balance has neither."
)

// checkOpeningLines holds an opening entry to the shape the opening form
// keeps: one line for each account, no income or expense account, no customer
// or vendor. The form shows one amount for each balance sheet account and
// writes the entry again from those amounts, so a line it cannot show would be
// replaced by a balancing figure on the next save. It runs after
// validateLines, which proves that every account exists.
func checkOpeningLines(tx core.App, entry *core.Record, lines []*core.Record) error {
	if entry.GetString("origin") != originOpeningBalance {
		return nil
	}
	// One read for all the accounts: an opening entry can hold 1,000 lines.
	ids := make([]string, len(lines))
	for i, line := range lines {
		ids[i] = line.GetString("account")
	}
	found, err := tx.FindRecordsByIds("books_accounts", ids)
	if err != nil {
		return fmt.Errorf("books: read the accounts of the opening entry: %w", err)
	}
	accounts := make(map[string]*core.Record, len(found))
	for _, account := range found {
		accounts[account.Id] = account
	}
	seen := make(map[string]bool, len(lines))
	for i, line := range lines {
		n := i + 1
		accountID := line.GetString("account")
		account, ok := accounts[accountID]
		if !ok {
			return fmt.Errorf("books: line %d names an account that does not exist", n)
		}
		name := account.GetString("name")
		if seen[accountID] {
			return refuse(msgOpeningRepeatedAccount, n, name)
		}
		seen[accountID] = true
		t, ok := accountType(account.GetString("type"))
		if !ok {
			return refuse("%s is not an account type.", account.GetString("type"))
		}
		if t.Group == "income" || t.Group == "expense" {
			return refuse(msgOpeningProfitAndLoss, n, name)
		}
		if line.GetString("customer") != "" || line.GetString("vendor") != "" {
			return refuse(msgOpeningParty, n)
		}
	}
	return nil
}

// A draft has no number yet, so entryName would read "This journal entry".
func openingEntryLabel(r *core.Record) string {
	if r.GetString("number") == "" {
		return "a saved draft"
	}
	return entryName(r)
}
