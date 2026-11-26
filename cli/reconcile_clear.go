package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// reconcileLinesInput is the --input of `reconcile clear` and `unclear`.
var reconcileLinesInput = resource{
	Name: "reconcile clear",
	Fields: []field{
		{Name: "lines", Type: typeIDs, Required: true, Ref: "journal-entries.lines", Help: "the journal lines of the account: `line` of a row of `reconcile show`"},
	},
}

// refuseFinished refuses a write to a finished reconciliation. Books answers
// such a write with "not found", for a record that exists.
func refuseFinished(cmd *cobra.Command, rec record) error {
	if rec.cell("status") != reconcileFinished {
		return nil
	}
	return refusedf("reconciliation %s is finished: a Books admin opens it again with `%s undo %s`",
		rec.id(), cmd.Parent().CommandPath(), rec.id())
}

// clearedRowIDs are the ids of the cleared rows of a reconciliation, by the
// journal line of each.
func clearedRowIDs(cmd *cobra.Command, c *client.Client, id string) (map[string]string, error) {
	rows, err := client.ListAll[rawRecord](cmd.Context(), c, clearedRowsCollection,
		client.Filter("reconciliation = {:id}", map[string]any{"id": id}), "")
	if err != nil {
		return nil, err
	}
	byLine := make(map[string]string, len(rows))
	for _, row := range rows {
		line, _ := row["line"].(string)
		rowID, _ := row["id"].(string)
		byLine[line] = rowID
	}
	return byLine, nil
}

// newReconcileLinesCmd is `clear` or `unclear`: one batch that adds or removes
// the cleared row of each line of the input.
func newReconcileLinesCmd(c *client.Client, name, short, long string, clear bool) *cobra.Command {
	var input string
	cmd := newCommand(commandDef{
		Name:   name,
		Short:  short,
		Long:   long,
		Args:   reconciliationArg(),
		Input:  inputSchema(&reconcileLinesInput, true),
		Output: reconciliationSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		given, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(&reconcileLinesInput, given, true); err != nil {
			return err
		}
		lines, _ := given["lines"].([]any)
		if len(lines) == 0 {
			return usagef(`"lines" is required: one or more ids of journal lines`)
		}
		if len(lines) > maxBatchWrites {
			return usagef(`"lines" has %d ids: one command takes %d; send the rest in a second command`, len(lines), maxBatchWrites)
		}
		rec, err := fetchRecord(cmd.Context(), c, &reconciliationsResource, args[0])
		if err != nil {
			return err
		}
		if err := refuseFinished(cmd, rec); err != nil {
			return err
		}
		// A line that is in the asked state already gets no write, so a run
		// sent again after a lost answer sends only what is left.
		ops := func() ([]batchOp, error) {
			cleared, err := clearedRowIDs(cmd, c, args[0])
			if err != nil {
				return nil, err
			}
			ops := []batchOp{}
			for i, value := range lines {
				line, _ := value.(string)
				rowID, isCleared := cleared[line]
				label := fmt.Sprintf("lines[%d]", i)
				switch {
				case clear && !isCleared:
					ops = append(ops, createOp(clearedRowsCollection, label, map[string]any{"id": newRecordID(), "line": line, "reconciliation": args[0]}))
					cleared[line] = ""
				case !clear && isCleared:
					ops = append(ops, deleteOp(clearedRowsCollection, rowID, label))
					delete(cleared, line)
				}
			}
			return ops, nil
		}
		first, err := ops()
		if err != nil {
			return err
		}
		if len(first) > 0 {
			send := func() error { return sendBatch(cmd.Context(), c, first) }
			stored := func() (bool, error) {
				left, err := ops()
				return len(left) == 0, err
			}
			if err := sendResent(cmd.Context(), send, stored); err != nil {
				next := "Run the same command again: a line that is " + name + "ed already is not sent a second time."
				return prefixID(&reconciliationsResource, args[0], explain(err, "the "+name+" of reconciliation "+args[0], next))
			}
		}
		// A line named twice is one line.
		distinct := map[any]bool{}
		for _, line := range lines {
			distinct[line] = true
		}
		switch {
		case len(first) < len(distinct):
			o.Info(cmd.ErrOrStderr(), "%sed %d of %d lines in reconciliation %s; the others were %sed already", name, len(first), len(distinct), args[0], name)
		case len(first) == 1:
			o.Info(cmd.ErrOrStderr(), "%sed 1 line in reconciliation %s", name, args[0])
		default:
			o.Info(cmd.ErrOrStderr(), "%sed %d lines in reconciliation %s", name, len(first), args[0])
		}
		return writeReconciliation(cmd, c, o, args[0])
	})
	bindInput(cmd, &input)
	return cmd
}

func newReconcileClearCmd(c *client.Client) *cobra.Command {
	return newReconcileLinesCmd(c, "clear", "Mark journal lines as on the statement",
		"Clear journal lines in a reconciliation that is in progress: each is on the statement. `lines` holds\n"+
			"ids of journal lines of the account; `reconcile show` prints them in `open`.\n\n"+
			"Books refuses a line that is dated after the statement date, and a line that another reconciliation\n"+
			"holds. All the lines are written, or none. A line that is cleared already is left as it is, so the\n"+
			"command can run again.", true)
}

func newReconcileUnclearCmd(c *client.Client) *cobra.Command {
	return newReconcileLinesCmd(c, "unclear", "Take journal lines out of a reconciliation",
		"Take cleared journal lines out of a reconciliation that is in progress. `lines` holds ids of journal\n"+
			"lines; `reconcile show` prints them in `cleared`. A line that is not cleared is left as it is, so the\n"+
			"command can run again. It does not ask first.", false)
}
