// Package cli contributes the `tinycld books` command group.
//
// Every command is an HTTP client of the PocketBase record API. Books has no
// CLI-only endpoint and must not grow one: the collection rules and the Go
// guards in server/ are the whole authorization and validation, so a write
// from here is checked exactly as a write from the app.
//
// The commands are built for agents. docs/cli-conventions.md is the contract:
// --json output, JSON input from --input, the exit codes of
// tinycld.org/cli/exitcode, and `books schema`. A new command goes through
// newCommand, which gives it all four.
package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
)

func Register(root *cobra.Command, c *client.Client) {
	books := newGroup("books", "Books: accounts, customers, vendors, products and sales tax")
	books.Aliases = []string{"book"}
	for i := range resources {
		group := newResourceCmd(c, &resources[i])
		if resources[i].Name == "accounts" {
			group.AddCommand(newAccountTypesCmd())
		}
		books.AddCommand(group)
	}
	root.AddCommand(books)
}
