package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// A reconciliation holds one bank statement of one account: its date, its
// closing balance and the journal lines that are on it.
const (
	reconciliationsCollection = "books_reconciliations"

	reconcileInProgress = "in_progress"
	reconcileFinished   = "finished"
)

// reconciliationsResource is built in Go, as the lists of `banking` are: a
// reconciliation is finished and reopened, not edited and deleted as a record
// of resources.json is.
var reconciliationsResource = resource{
	Name:       "reconciliations",
	Singular:   "reconciliation",
	Summary:    "The bank statements that were checked against the books",
	Collection: reconciliationsCollection,
	Sort:       "-statement_date,id",
	Label:      "statement_date",
	Columns:    []string{"statement_date", "account", "status", "statement_balance"},
	DeleteHelp: "Only a reconciliation that is in progress can be deleted. Its lines are then in no reconciliation.\n" +
		"`discard` is another name of this command.",
	Filters: []filterFlag{
		{Flag: "account", Field: "account", Help: "only the reconciliations of this account: the id of an account"},
		{Flag: "status", Field: "status", Help: "only the reconciliations with this status: in_progress or finished"},
	},
	Fields: []field{
		{Name: "account", Type: typeID, Required: true, Ref: "accounts", Help: "the bank or credit card account of the statement"},
		{Name: "statement_date", Type: typeString, Required: true, Help: "the closing date of the statement, YYYY-MM-DD: after the date of the last finished statement of the account"},
		{Name: "statement_balance", Type: typeInteger, Required: true, Help: "the closing balance of the statement, in cents. For a bank account, above 0 is money in the account. For a credit card, above 0 is money you owe."},
		{Name: "has_statement_totals", Type: typeBool, Help: "true when the statement gives its totals, and you give them in statement_out and statement_in"},
		{Name: "statement_out", Type: typeInteger, Help: "the total of the money out on the statement, in cents: the payments from a bank account, the charges of a credit card"},
		{Name: "statement_in", Type: typeInteger, Help: "the total of the money in on the statement, in cents: the deposits of a bank account, the payments to a credit card"},
		{Name: "status", Type: typeString, ReadOnly: true, Enum: []string{reconcileInProgress, reconcileFinished}, Help: "in_progress: lines can be cleared; finished: `finish` closed it"},
		{Name: "beginning_balance", Type: typeInteger, ReadOnly: true, Help: "the closing balance of the statement before this one, in cents; Books sets it"},
		{Name: "cleared_out", Type: typeInteger, ReadOnly: true, Help: "the total of the cleared credit lines (the payments from a bank account, the charges of a credit card), in cents; Books sets it when the reconciliation is finished"},
		{Name: "cleared_in", Type: typeInteger, ReadOnly: true, Help: "the total of the cleared debit lines (the deposits of a bank account, the payments to a credit card), in cents; Books sets it when the reconciliation is finished"},
		{Name: "cleared_out_count", Type: typeInteger, ReadOnly: true, Help: "the number of cleared credit lines; Books sets it when the reconciliation is finished"},
		{Name: "cleared_in_count", Type: typeInteger, ReadOnly: true, Help: "the number of cleared debit lines; Books sets it when the reconciliation is finished"},
		{Name: "finished_by_name", Type: typeString, ReadOnly: true, Help: "the name of the person who finished it"},
		{Name: "finished_at", Type: typeString, ReadOnly: true, Help: "the time it was finished"},
		{Name: "currency", Type: typeString, ReadOnly: true, Help: "the currency of the books"},
	},
}

func reconciliationArg() []argSpec {
	return []argSpec{{Name: "id", Help: "the id of the reconciliation, as `reconcile list` prints it"}}
}

func newReconcileCmd(c *client.Client) *cobra.Command {
	group := newGroup("reconcile", "Reconcile: check a bank or credit card account against its statement")
	group.Aliases = []string{"reconciliations", "reconciliation"}
	group.AddCommand(
		buildListCmd(c, &reconciliationsResource, commandDef{
			Name:    "list",
			Short:   "List the reconciliations",
			Aliases: []string{"ls"},
			Long: "List the reconciliations, the newest statement first. An account has at most one that is\n" +
				"in progress.\n\n" + fmt.Sprint(defaultListLimit) + " to a page. " + pagingText,
		}),
		newReconcileStartCmd(c),
		newReconcileShowCmd(c),
		newReconcileClearCmd(c),
		newReconcileUnclearCmd(c),
		newReconcileEditCmd(c),
		newReconcileFinishCmd(c),
		newReconcileUndoCmd(c),
		newReconcileDeleteCmd(c),
	)
	return group
}

func newReconcileStartCmd(c *client.Client) *cobra.Command {
	var input, chosen string
	cmd := newCommand(commandDef{
		Name:    "start",
		Short:   "Start the reconciliation of an account from a JSON object",
		Aliases: []string{"add", "new"},
		Long: "Start the reconciliation of a bank or credit card account with the closing date and the closing\n" +
			"balance of its statement. Books sets the beginning balance: the closing balance of the last\n" +
			"finished statement of the account.\n\n" +
			"Books refuses a second reconciliation while the account has one in progress, and a date that is\n" +
			"not after the last finished statement.\n\n" +
			"The command prints the reconciliation as `reconcile show` does: `open` holds the lines to clear.",
		Input:  inputSchema(&reconciliationsResource, true),
		Output: reconciliationSchema(),
	}, func(cmd *cobra.Command, _ []string, o output.Options, _ bool) error {
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		body, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(&reconciliationsResource, body, true); err != nil {
			return err
		}
		id := chosenID(cmd, chosen)
		show := cmd.Parent().CommandPath() + " show " + id
		if err := refuseStoredID(cmd, c, reconciliationsCollection, id, reconciliationsResource.Singular, show); err != nil {
			return err
		}
		body["id"], body["status"] = id, reconcileInProgress
		send := func() error {
			_, err := client.CreateRecord[rawRecord](cmd.Context(), c, reconciliationsCollection, body)
			return err
		}
		// Books refuses a resend with "has a reconciliation in progress", not
		// with a refusal of the id: the read of the id says whether it is
		// the one an earlier send stored.
		stored := func() (bool, error) { return recordExists(cmd.Context(), c, reconciliationsCollection, id) }
		if err := sendResent(cmd.Context(), send, stored); err != nil {
			return explain(err, "reconciliation "+id, checkThenResend(show, id))
		}
		o.Info(cmd.ErrOrStderr(), "started reconciliation %s", id)
		return writeReconciliation(cmd, c, o, id)
	})
	bindInput(cmd, &input)
	bindID(cmd, &chosen, "the id of the new reconciliation")
	return cmd
}
