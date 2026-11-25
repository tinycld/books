package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// bankMatchInput is the --input of `banking match`.
var bankMatchInput = resource{
	Name: "banking match",
	Fields: []field{
		{Name: "lines", Type: typeIDs, Required: true, Ref: "journal-entries.lines", Help: "the journal lines on the connected account that are this bank transaction: `line` of a suggestion of `banking show`, 1 to 50"},
	},
}

func newBankingMatchCmd(c *client.Client) *cobra.Command {
	var input, chosen string
	cmd := newCommand(commandDef{
		Name:  "match",
		Short: "Match a bank transaction to transactions that are in Books already",
		Long: "Say that a bank transaction that is For review is one or more posted transactions of Books: a\n" +
			"received payment, a bill payment, a deposit. Books posts nothing, and the transaction is Reviewed.\n\n" +
			"`lines` are ids of journal lines on the connected account. `banking show` prints the lines that\n" +
			"Books suggests. Books refuses lines whose total is not the bank amount.",
		Args:   bankTransactionArg(),
		Input:  inputSchema(&bankMatchInput, true),
		Output: bankTransactionSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		given, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(&bankMatchInput, given, true); err != nil {
			return err
		}
		if lines, _ := given["lines"].([]any); len(lines) == 0 {
			return usagef(`"lines" is required: one or more ids of journal lines`)
		}
		id := chosenID(cmd, chosen)
		show := cmd.Parent().CommandPath() + " show " + args[0]
		if err := refuseStoredOf(cmd, c, bankMatchesCollection, id, "match", "bank_transaction", bankTransactionsResource.Singular); err != nil {
			return err
		}
		body := map[string]any{"id": id, "bank_transaction": args[0], "lines": given["lines"]}
		send := func() error {
			_, err := client.CreateRecord[rawRecord](cmd.Context(), c, bankMatchesCollection, body)
			return err
		}
		stored := func() (bool, error) { return recordExists(cmd.Context(), c, bankMatchesCollection, id) }
		if err := sendResent(cmd.Context(), send, stored); err != nil {
			return prefixID(&bankTransactionsResource, args[0], explain(err, "the match "+id+" of bank transaction "+args[0], checkThenResend(show, id)))
		}
		o.Info(cmd.ErrOrStderr(), "matched bank transaction %s: `%s unmatch %s` takes it back", args[0], cmd.Parent().CommandPath(), args[0])
		return writeBankTransaction(cmd, c, o, args[0])
	})
	bindInput(cmd, &input)
	bindID(cmd, &chosen, "the id of the new match")
	return cmd
}

func newBankingUnmatchCmd(c *client.Client) *cobra.Command {
	return newCommand(commandDef{
		Name:  "unmatch",
		Short: "Take back the match of a bank transaction",
		Long: "Remove the match of a bank transaction: it is For review again, and the transactions of Books\n" +
			"it was matched to do not change. It does not ask first. For a categorized transaction, use `undo`.",
		Args:   bankTransactionArg(),
		Output: bankTransactionSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		return removeReview(cmd, c, o, bankMatchesCollection, args[0],
			"is not matched: `undo` takes back a `categorize` or a `split`", "unmatched")
	})
}

// newBankingStatusCmd moves a bank transaction between For review and
// Excluded: one change of its status, which is all Books lets a caller change.
func newBankingStatusCmd(c *client.Client, name, short, long, status, state, done string) *cobra.Command {
	return newCommand(commandDef{
		Name:   name,
		Short:  short,
		Long:   long,
		Args:   bankTransactionArg(),
		Output: bankTransactionSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		// Books lets a caller change the status only from For review to
		// Excluded and back, and answers "not found" to another change. So
		// the command reads the status: it says what to do for a Reviewed
		// transaction, and sends nothing when the status is the one asked
		// for (a second run after a lost answer).
		txn, err := fetchRecord(cmd.Context(), c, &bankTransactionsResource, args[0])
		if err != nil {
			return err
		}
		switch txn.cell("status") {
		case bankStatusReviewed:
			return refusedf("bank transaction %s is Reviewed: take back its entry with `undo` or its match with `unmatch` first", args[0])
		case status:
			o.Info(cmd.ErrOrStderr(), "bank transaction %s is %s already: nothing was changed", args[0], state)
			return writeBankTransaction(cmd, c, o, args[0])
		}
		if _, err := client.UpdateRecord[rawRecord](cmd.Context(), c, bankTransactionsCollection, args[0], map[string]any{"status": status}); err != nil {
			return prefixID(&bankTransactionsResource, args[0], err)
		}
		o.Info(cmd.ErrOrStderr(), "%s bank transaction %s", done, args[0])
		return writeBankTransaction(cmd, c, o, args[0])
	})
}

func newBankingExcludeCmd(c *client.Client) *cobra.Command {
	return newBankingStatusCmd(c, "exclude", "Leave a bank transaction out of the books",
		"Exclude a bank transaction that is For review: a duplicate, or one that is not of this business.\n"+
			"Books posts nothing for it. `restore` moves it back.\n\n"+
			"A Reviewed transaction cannot be excluded: take back its entry with `undo` or its match with `unmatch` first.",
		bankStatusExcluded, "Excluded", "excluded")
}

func newBankingRestoreCmd(c *client.Client) *cobra.Command {
	return newBankingStatusCmd(c, "restore", "Move an excluded bank transaction back to For review",
		"Move a bank transaction that is Excluded back to For review.",
		bankStatusForReview, "For review", "restored")
}
