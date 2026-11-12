package books

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"

	"github.com/pocketbase/pocketbase/core"
)

// transfer_account_types.json is the one list of account types a transfer may
// move money between. The client mirrors it in tinycld/books/lib/transfer.ts
// (tests/transfer.test.ts compares the two).
//
//go:embed transfer_account_types.json
var transferAccountTypesJSON []byte

var transferAccountTypes = mustParseTransferAccountTypes(transferAccountTypesJSON)

const (
	docTypeJournal  = "journal"
	docTypeTransfer = "transfer"
)

func mustParseTransferAccountTypes(raw []byte) []string {
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		panic("books: transfer_account_types.json: " + err.Error())
	}
	return out
}

func isTransferAccountType(key string) bool {
	return slices.Contains(transferAccountTypes, key)
}

// entryNouns is the one place an entry's words follow its document type, so
// refusals (entryName), the audit log (entryLabel) and search (entryHitTitle)
// cannot drift apart when another type is added.
func entryNouns(docType string) (noun, this, draft string) {
	switch docType {
	case docTypeTransfer:
		return "Transfer", "This transfer", "Draft transfer"
	case docTypeInvoice:
		return "Invoice", "This invoice", "Draft invoice"
	case docTypeSalesReceipt:
		return "Sales receipt", "This sales receipt", "Draft sales receipt"
	}
	return "Journal entry", "This journal entry", "Draft journal entry"
}

// checkTransfer holds a transfer to its shape: money leaves one balance-sheet
// account (line 1, a credit) and enters another (line 2, a debit). It runs
// after validateLines, so the lines already balance, each has one side, and
// each account exists and is active; entryLines sorts by position, so line 1
// is From.
func checkTransfer(tx core.App, entry *core.Record, lines []*core.Record) error {
	if len(lines) != 2 {
		return refuse("A transfer has two lines: the account the money comes from and the account it goes to.")
	}
	if lines[0].GetInt("credit") == 0 {
		return refuse("Line 1: a transfer moves money out of this account, so it takes a credit.")
	}
	// validateLines makes this unreachable for two balanced lines whose line 1
	// is a credit; it stays as a guard should that check ever change.
	if lines[1].GetInt("debit") == 0 {
		return refuse("Line 2: a transfer moves money into this account, so it takes a debit.")
	}
	if lines[0].GetString("account") == lines[1].GetString("account") {
		return refuse("Line 2: choose an account other than the one the money comes from.")
	}
	for i, line := range lines {
		n := i + 1
		account, err := tx.FindRecordById("books_accounts", line.GetString("account"))
		if err != nil {
			return fmt.Errorf("books: read the account of line %d: %w", n, err)
		}
		if !isTransferAccountType(account.GetString("type")) {
			return refuse("Line %d: %s cannot be used in a transfer. Choose a bank, credit card, asset, liability or equity account.",
				n, account.GetString("name"))
		}
	}
	if entry.GetString("auto_reverse_on") != "" {
		return refuse("A transfer cannot reverse automatically.")
	}
	return nil
}
