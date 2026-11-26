// Package cli contributes the `tinycld books` command group.
//
// Every command is an HTTP client of the PocketBase record API. Books has no
// CLI-only endpoint and must not grow one: the collection rules and the Go
// guards in server/ are the whole authorization and validation, so a write
// from here is checked exactly as a write from the app.
//
// The commands are built for agents. `tinycld books schema` prints the
// contract: --json output, JSON input from --input, the exit codes of
// tinycld.org/cli/exitcode, and the schema of every command. A new command goes
// through newCommand, which gives it all four.
package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
)

func Register(root *cobra.Command, c *client.Client) {
	books := newGroup("books", "Books: the lists (accounts, customers, vendors, products, sales tax) and the transactions")
	books.Aliases = []string{"book"}
	for i := range resources {
		group := newResourceCmd(c, &resources[i])
		if resources[i].Name == "accounts" {
			group.AddCommand(newAccountTypesCmd())
		}
		books.AddCommand(group)
	}
	for i := range documents {
		books.AddCommand(newDocumentCmd(c, &documents[i]))
	}
	books.AddCommand(newSchemaCmd(books))
	root.AddCommand(books)
}
