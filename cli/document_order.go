package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// alreadyThere prints a document whose status is the one a command asks for:
// nothing is sent, so a second run after a lost answer changes nothing.
func alreadyThere(cmd *cobra.Command, c *client.Client, doc *document, o output.Options, current record) error {
	o.Info(cmd.ErrOrStderr(), "%s %s is %s already: nothing was changed", doc.Singular, current.label(&doc.resource), current.cell("status"))
	rec, err := fetchDocument(cmd.Context(), c, doc, current.id())
	if err != nil {
		return err
	}
	return writeDocument(cmd, o, doc, rec)
}

// newOrderCloseCmd closes an open order by hand. The server stamps who closed
// it and when, sets the reason `manual`, and refuses a user who is not a Books
// admin.
func newOrderCloseCmd(c *client.Client, doc *document) *cobra.Command {
	return newCommand(commandDef{
		Name:  "close",
		Short: "Close one open " + doc.Singular,
		Long: "Close one open " + doc.Singular + ": nothing more can be made from it. Books\n" +
			"stores the reason `manual`. Only a Books admin can close one; Books also closes\n" +
			"a " + doc.Singular + " by itself when every line is received (the reason `received`).\n\n" +
			"The command asks before it closes. Without a terminal, pass --yes.",
		Args:   idArg(&doc.resource),
		Output: documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, yes bool) error {
		if !yes && !canPrompt(o) {
			return usagef("refusing to prompt without a terminal; pass --yes to close")
		}
		current, err := fetchHeader(cmd, c, doc, args[0])
		if err != nil {
			return err
		}
		if current.cell("status") == statusClosed {
			return alreadyThere(cmd, c, doc, o, current)
		}
		revision, err := revisionOf(doc, current)
		if err != nil {
			return err
		}
		question := fmt.Sprintf("Close %s %q? Nothing more can be made from it.", doc.Singular, current.label(&doc.resource))
		ok, err := confirm(o, yes, cmd.InOrStdin(), cmd.ErrOrStderr(), question)
		if err != nil {
			return usagef("no answer read; pass --yes to close without asking")
		}
		if !ok {
			o.Info(cmd.ErrOrStderr(), "not closed")
			rec, err := fetchDocument(cmd.Context(), c, doc, current.id())
			if err != nil {
				return err
			}
			return writeDocument(cmd, o, doc, rec)
		}
		body := map[string]any{"status": statusClosed, "revision": revision + 1}
		return patchStatus(cmd, c, doc, o, current.id(), body, "closed")
	})
}

// newOrderReopenCmd opens again an order that was closed by hand. A closed
// order cannot be edited, so the write states no revision. The server clears
// the close stamp, refuses a user who is not a Books admin, and refuses an
// order that closed because every line is received.
func newOrderReopenCmd(c *client.Client, doc *document) *cobra.Command {
	made := "document"
	if doc.Convert != nil {
		made = findDocument(doc.Convert.To).Singular
	}
	return newCommand(commandDef{
		Name:  "reopen",
		Short: "Open one closed " + doc.Singular + " again",
		Long: "Open again one " + doc.Singular + " that a Books admin closed. Only a Books admin\n" +
			"can reopen one. A " + doc.Singular + " that Books closed because every line is received\n" +
			"has no reopen: it opens again by itself when a " + made + " of it is voided, deleted\n" +
			"or corrected to less.",
		Args:   idArg(&doc.resource),
		Output: documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		current, err := fetchHeader(cmd, c, doc, args[0])
		if err != nil {
			return err
		}
		if current.cell("status") == statusOpen {
			return alreadyThere(cmd, c, doc, o, current)
		}
		return patchStatus(cmd, c, doc, o, current.id(), map[string]any{"status": statusOpen}, "reopened")
	})
}
