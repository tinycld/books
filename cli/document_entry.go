package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// newDocumentEntryCmd shows the journal entry Books wrote for a transaction,
// in the shape `journal-entries show` prints.
func newDocumentEntryCmd(c *client.Client, doc *document) *cobra.Command {
	journal := findDocument(journalDocument)
	return newCommand(commandDef{
		Name:  "entry",
		Short: "Show the journal entry of one " + doc.Singular,
		Long: "Show the journal entry that Books wrote for one " + doc.Singular + ", with its lines:\n" +
			"the accounts it debits and credits. It is what `tinycld books journal-entries show`\n" +
			"prints for the id in the `" + doc.Entry + "` field.\n\n" +
			"A draft has no journal entry: Books writes it when the " + doc.Singular + " is posted.",
		Args:   idArg(&doc.resource),
		Output: documentSchema(journal),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		current, err := fetchHeader(cmd, c, doc, args[0])
		if err != nil {
			return err
		}
		entryID := current.cell(doc.Entry)
		if entryID == "" {
			status := current.cell("status")
			if status != "draft" {
				return refusedf("%s %s is %s and has no journal entry", doc.Singular, current.id(), status)
			}
			return refusedf("%s %s is draft: it has no journal entry; Books writes one when the %s is posted: post it with `%s post`",
				doc.Singular, current.id(), doc.Singular, cmd.Parent().CommandPath())
		}
		rec, err := fetchDocument(cmd.Context(), c, journal, entryID)
		if err != nil {
			return fmt.Errorf("the journal entry of %s %s: %w", doc.Singular, current.id(), err)
		}
		return writeDocument(cmd, o, journal, rec)
	})
}
