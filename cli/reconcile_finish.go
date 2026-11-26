package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// reconcileEditInput is the --input of `reconcile edit`: the values of the
// statement. The account of a reconciliation never changes.
var reconcileEditInput = resource{
	Name: "reconcile edit",
	Fields: []field{
		{Name: "statement_date", Type: typeString, Help: "the closing date of the statement, YYYY-MM-DD. With an earlier date, Books takes out the cleared lines that are dated after it."},
		{Name: "statement_balance", Type: typeInteger, Help: "the closing balance of the statement, in cents"},
		{Name: "has_statement_totals", Type: typeBool, Help: "true when the statement gives its totals"},
		{Name: "statement_out", Type: typeInteger, Help: "the total of the money out on the statement, in cents: the payments from a bank account, the charges of a credit card"},
		{Name: "statement_in", Type: typeInteger, Help: "the total of the money in on the statement, in cents: the deposits of a bank account, the payments to a credit card"},
	},
}

func newReconcileEditCmd(c *client.Client) *cobra.Command {
	var input string
	cmd := newCommand(commandDef{
		Name:    "edit",
		Short:   "Change the statement values of a reconciliation from a JSON object",
		Aliases: []string{"update", "set"},
		Long: "Change the closing date, the closing balance or the totals of the statement of a reconciliation\n" +
			"that is in progress. Only the fields in --input change. With an earlier closing date, Books takes\n" +
			"out the cleared lines that are dated after it.",
		Args:   reconciliationArg(),
		Input:  inputSchema(&reconcileEditInput, false),
		Output: reconciliationSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(&reconcileEditInput, body, false); err != nil {
			return err
		}
		rec, err := fetchRecord(cmd.Context(), c, &reconciliationsResource, args[0])
		if err != nil {
			return err
		}
		if err := refuseFinished(cmd, rec); err != nil {
			return err
		}
		if _, err := client.UpdateRecord[rawRecord](cmd.Context(), c, reconciliationsCollection, args[0], body); err != nil {
			return prefixID(&reconciliationsResource, args[0], err)
		}
		o.Info(cmd.ErrOrStderr(), "updated reconciliation %s", args[0])
		return writeReconciliation(cmd, c, o, args[0])
	})
	bindInput(cmd, &input)
	return cmd
}

// newReconcileStatusCmd finishes a reconciliation or opens it again: one
// change of its status. Books answers "not found" to a change to the status
// the reconciliation has. done is the text for stderr, with %s for the id.
func newReconcileStatusCmd(c *client.Client, name, short, long, status, state, done string) *cobra.Command {
	change := statusChange{res: &reconciliationsResource, status: status, state: state, done: done, write: writeReconciliation}
	return newCommand(commandDef{
		Name:   name,
		Short:  short,
		Long:   long,
		Args:   reconciliationArg(),
		Output: reconciliationSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		return change.run(cmd, c, o, args[0])
	})
}

func newReconcileFinishCmd(c *client.Client) *cobra.Command {
	return newReconcileStatusCmd(c, "finish", "Finish a reconciliation",
		"Finish a reconciliation: the cleared lines agree with the statement. Books computes the difference\n"+
			"between the statement and the cleared lines. When it is not zero, Books refuses, and the message\n"+
			"states the difference: clear or unclear lines, or change the statement values with `edit`.\n\n"+
			"A finished reconciliation and its lines do not change. A Books admin opens it again with `undo`.",
		reconcileFinished, "finished", "finished reconciliation %s")
}

func newReconcileUndoCmd(c *client.Client) *cobra.Command {
	return newReconcileStatusCmd(c, "undo", "Open a finished reconciliation again",
		"Open a finished reconciliation again: it is in progress, and its lines stay cleared. Only a Books\n"+
			"admin can do this, and only for the latest finished statement of the account. Books refuses\n"+
			"while the account has another reconciliation in progress: delete that one first.\n"+
			"The command does not ask first: `finish` closes the reconciliation again.",
		reconcileInProgress, "in progress", "opened reconciliation %s again")
}

// newReconcileDeleteCmd deletes a reconciliation that is in progress. Books
// answers "not found" to the delete of a finished one.
func newReconcileDeleteCmd(c *client.Client) *cobra.Command {
	cmd := newGuardedDeleteCmd(c, &reconciliationsResource, func(rec record) error {
		if rec.cell("status") == reconcileFinished {
			return refusedf("reconciliation %s is finished: it cannot be deleted; a Books admin opens it again with `undo`", rec.id())
		}
		return nil
	})
	cmd.Aliases = append(cmd.Aliases, "discard")
	return cmd
}
