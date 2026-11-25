package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
)

// The banking collections. A bank account is connected in the app; the
// commands of this group upload and import its statement files and review the
// transactions an import made.
const (
	bankConnectionsCollection  = "books_bank_connections"
	bankFilesCollection        = "books_bank_files"
	bankTransactionsCollection = "books_bank_transactions"
)

// The statuses of a bank transaction that a command names.
const (
	bankStatusForReview = "for_review"
	bankStatusExcluded  = "excluded"
)

// The refs of the banking lists: the command that lists the records.
const (
	bankConnectionsRef = "banking connections"
	bankFilesRef       = "banking files"
)

// The banking lists are built in Go, not read from resources.json: the group
// has no add, edit or delete of a record, so the resource engine's commands do
// not fit it. Each is a resource of the list engine only.

// bankConnectionsResource is a connected bank or card account.
var bankConnectionsResource = resource{
	Name:       "bank connections",
	Singular:   "bank connection",
	Summary:    "The bank and card accounts connected for import",
	Collection: bankConnectionsCollection,
	Sort:       "institution,id",
	Columns:    []string{"institution", "account_mask", "account"},
	Filters: []filterFlag{
		{Flag: "account", Field: "account", Help: "only the connection of this account: the id of an account"},
	},
	Fields: []field{
		{Name: "account", Type: typeID, Required: true, Ref: "accounts", Help: "the bank or credit card account of the chart that the transactions belong to"},
		{Name: "institution", Type: typeString, Help: "the name of the bank"},
		{Name: "account_mask", Type: typeString, Help: "the last 4 digits of the account number at the bank"},
	},
}

// bankFilesResource is an uploaded statement file.
var bankFilesResource = resource{
	Name:       "bank files",
	Singular:   "bank file",
	Summary:    "The statement files uploaded for a connection",
	Collection: bankFilesCollection,
	Sort:       "-created,id",
	Label:      "name",
	Columns:    []string{"name", "format", "status", "connection"},
	Filters: []filterFlag{
		{Flag: "connection", Field: "connection", Help: "only the files of this connection: an id from `banking connections`"},
		{Flag: "status", Field: "status", Help: "only the files with this status: uploaded, imported or failed"},
	},
	Fields: []field{
		{Name: "connection", Type: typeID, Required: true, Ref: bankConnectionsRef, Help: "the connection the file was uploaded for"},
		{Name: "name", Type: typeString, ReadOnly: true, Help: "the name of the file as it was uploaded"},
		{Name: "format", Type: typeString, ReadOnly: true, Enum: []string{"csv", "ofx"}, Help: "csv, or ofx for an OFX, QFX or QBO file"},
		{Name: "size", Type: typeInteger, ReadOnly: true, Help: "the size of the file in bytes"},
		{Name: "status", Type: typeString, ReadOnly: true, Enum: []string{"uploaded", "imported", "failed"}, Help: "uploaded: not imported yet; imported: `banking import` made its transactions; failed: Books could not read it"},
		{Name: "statement_balance", Type: typeInteger, ReadOnly: true, Help: "the closing balance an OFX file states, in cents; 0 when the file states none"},
		{Name: "statement_date", Type: typeString, ReadOnly: true, Help: "the date of that balance, YYYY-MM-DD; empty when the file states none"},
	},
}

// bankTransactionsResource is one line of a bank statement.
var bankTransactionsResource = resource{
	Name:       "bank transactions",
	Singular:   "bank transaction",
	Summary:    "The transactions imported from bank files",
	Collection: bankTransactionsCollection,
	Sort:       "-date,id",
	Label:      "description",
	Columns:    []string{"date", "description", "amount", "status"},
	Search:     []string{"description", "memo"},
	Filters: []filterFlag{
		{Flag: "status", Field: "status", Default: bankStatusForReview, Help: "the status to list: for_review, reviewed, excluded, or all"},
		{Flag: "connection", Field: "connection", Help: "only the transactions of this connection: an id from `banking connections`"},
	},
	Fields: []field{
		{Name: "connection", Type: typeID, ReadOnly: true, Ref: bankConnectionsRef, Help: "the connection the transaction belongs to"},
		{Name: "file", Type: typeID, ReadOnly: true, Ref: bankFilesRef, Help: "the file the transaction came from"},
		{Name: "line", Type: typeInteger, ReadOnly: true, Help: "the line of the file the transaction came from, from 1"},
		{Name: "date", Type: typeString, ReadOnly: true, Help: "the date the bank states, YYYY-MM-DD"},
		{Name: "description", Type: typeString, ReadOnly: true, Help: "the description the bank states"},
		{Name: "memo", Type: typeString, ReadOnly: true, Help: "the memo the bank states"},
		{Name: "amount", Type: typeInteger, ReadOnly: true, Help: "the amount in cents: above 0 is money in, below 0 is money out"},
		{Name: "fitid", Type: typeString, ReadOnly: true, Help: "the id the bank gives the transaction in an OFX file"},
		{Name: "check_number", Type: typeString, ReadOnly: true, Help: "the check number, when the bank states one"},
		{Name: "status", Type: typeString, ReadOnly: true, Enum: []string{bankStatusForReview, "reviewed", bankStatusExcluded}, Help: "for_review: not handled yet; reviewed: categorized or matched; excluded: left out of the books"},
	},
}

// bankingResources are the lists of the group, by the command word of each.
func bankingResources() map[string]*resource {
	return map[string]*resource{
		"connections": &bankConnectionsResource,
		"files":       &bankFilesResource,
		"list":        &bankTransactionsResource,
	}
}

func newBankingCmd(c *client.Client) *cobra.Command {
	group := newGroup("banking", "Banking: import a bank file and review its transactions")
	group.Aliases = []string{"bank"}
	paged := "\n\n" + fmt.Sprint(defaultListLimit) + " to a page. " + pagingText
	group.AddCommand(
		buildListCmd(c, &bankConnectionsResource, commandDef{
			Name:  "connections",
			Short: "List the connected bank and card accounts",
			Long: "List the bank and card accounts that are connected for import. A connection is made in the app:\n" +
				"Books, Banking, Connect account. `banking upload` takes the id of one." + paged,
		}),
		buildListCmd(c, &bankFilesResource, commandDef{
			Name:  "files",
			Short: "List the uploaded bank files",
			Long:  "List the statement files that were uploaded, the newest first." + paged,
		}),
		buildListCmd(c, &bankTransactionsResource, commandDef{
			Name:    "list",
			Short:   "List the bank transactions that are For review",
			Aliases: []string{"ls"},
			Long: "List the bank transactions, the newest first. Without --status the list holds the transactions\n" +
				"that are For review: those nobody has categorized, matched or excluded.\n" +
				"--status all lists the transactions of every status." + paged,
		}),
	)
	return group
}
