package cli

import (
	"fmt"
	"maps"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

// newDocumentApplyCmd adds one row to the table of the type that has `apply`
// in documents.json: one invoice a credit memo is applied to. It is one write
// of one record, so Books stores it or refuses it as a whole. The CLI computes
// nothing: Books lowers both balances and refuses an amount that is too large.
func newDocumentApplyCmd(c *client.Client, doc *document, table *lineTable) *cobra.Command {
	var input string
	res := table.asResource()
	cmd := newCommand(commandDef{
		Name:  "apply",
		Short: "Apply one posted " + doc.Singular + ": add one " + table.Singular + " from a JSON object",
		Long: "Add one " + table.Singular + " to a posted " + doc.Singular + ". --input names a JSON file that\n" +
			"holds it, or - to read it from standard input.\n\n" +
			"Books changes the balances in the same step, and refuses an amount that is\n" +
			"more than is open. The command prints the " + doc.Singular + " with every " + table.Singular + ";\n" +
			"`unapply` takes one away again.\n\n" +
			"`tinycld books schema " + doc.Name + " apply` prints the fields.",
		Args:   idArg(&doc.resource),
		Input:  inputSchema(res, true),
		Output: documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(res, body, true); err != nil {
			return err
		}
		row := maps.Clone(body)
		row["id"] = newRecordID()
		row[table.Parent] = args[0]
		if _, err := client.CreateRecord[rawRecord](cmd.Context(), c, table.Collection, row); err != nil {
			return applyCreateError(doc, table, args[0], err)
		}
		rec, err := readBack(cmd, c, doc, args[0], "applied")
		if err != nil {
			return err
		}
		o.Info(cmd.ErrOrStderr(), "applied %s %s (%s): %s %s", doc.Singular, rec.label(&doc.resource), rec.id(), table.Singular, row["id"])
		return writeDocument(cmd, o, doc, rec)
	})
	bindInput(cmd, &input)
	return cmd
}

// applyCreateError words the failure of the create of one row. Books answers a
// missing credit or a missing invoice with a 400 and a field error, so a 404
// is a server that has no collection for the rows (older than this CLI), and
// not a document that is gone: the message must not say so.
func applyCreateError(doc *document, table *lineTable, id string, err error) error {
	if exitcode.Of(exitcode.Classify(err)) == exitcode.NotFound {
		return fmt.Errorf("no %s was added to %s %s: the server has no collection %s (is it older than this CLI?): %w",
			table.Singular, doc.Singular, id, table.Collection, err)
	}
	return prefixID(&doc.resource, id, err)
}

// newDocumentUnapplyCmd removes one row that `apply` added. The row must be a
// row of the document the caller names: its id alone would remove a row of
// another document.
func newDocumentUnapplyCmd(c *client.Client, doc *document, table *lineTable) *cobra.Command {
	res := table.asResource()
	return newCommand(commandDef{
		Name:  "unapply",
		Short: "Remove one " + table.Singular + " of a " + doc.Singular,
		Long: "Remove one " + table.Singular + " of a " + doc.Singular + ": Books puts the balances back. `show`\n" +
			"prints each " + table.Singular + " with its id. It does not ask first: `apply` adds the\n" +
			table.Singular + " again.",
		Args: append(idArg(&doc.resource),
			argSpec{Name: table.Singular + "-id", Help: "the id of the " + table.Singular + ", as `show` prints it"}),
		Output: documentSchema(doc),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		raw, err := client.GetRecord[rawRecord](cmd.Context(), c, table.Collection, args[1])
		if err != nil {
			return prefixID(res, args[1], err)
		}
		if owner, _ := raw[table.Parent].(string); owner != args[0] {
			return exitcode.New(exitcode.NotFound, fmt.Errorf("%s %s is not of %s %s", table.Singular, args[1], doc.Singular, args[0]))
		}
		if err := client.DeleteRecord(cmd.Context(), c, table.Collection, args[1]); err != nil {
			return prefixID(res, args[1], err)
		}
		rec, err := readBack(cmd, c, doc, args[0], "unapplied")
		if err != nil {
			return err
		}
		o.Info(cmd.ErrOrStderr(), "removed %s %s of %s %s (%s)", table.Singular, args[1], doc.Singular, rec.label(&doc.resource), rec.id())
		return writeDocument(cmd, o, doc, rec)
	})
}
