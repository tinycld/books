package cli

import (
	"context"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

const (
	// reconcileLinesCollection is a view: every posted journal line on a bank
	// or card account, with the reconciliation that holds it, if any.
	reconcileLinesCollection = "books_reconcile_lines"
	// clearedRowsCollection holds one row for each cleared line.
	clearedRowsCollection = "books_reconciliation_lines"
)

// reconcileLineKeys are the keys `reconcile show` prints for each journal
// line, in print order.
var reconcileLineKeys = []string{"line", "date", "debit", "credit", "payee", "number", "doc_type", "document", "memo", "entry", "bank_matched"}

// reconcileLines reads the rows of the view for one filter, by date.
func reconcileLines(ctx context.Context, c *client.Client, filter string) ([]record, error) {
	rows, err := client.ListAll[rawRecord](ctx, c, reconcileLinesCollection, filter, "date,id")
	if err != nil {
		return nil, err
	}
	lines := make([]record, 0, len(rows))
	for _, raw := range rows {
		lines = append(lines, pick(raw, reconcileLineKeys))
	}
	return lines, nil
}

// reconciliationRecord reads a reconciliation with what `show` adds: the lines
// that are cleared in it, and the lines that can be.
func reconciliationRecord(ctx context.Context, c *client.Client, id string) (record, error) {
	rec, err := fetchRecord(ctx, c, &reconciliationsResource, id)
	if err != nil {
		return record{}, err
	}
	cleared, err := reconcileLines(ctx, c, client.Filter("reconciliation = {:id}", map[string]any{"id": id}))
	if err != nil {
		return record{}, err
	}
	// Nothing can be cleared in a finished reconciliation.
	open := []record{}
	if rec.cell("status") == reconcileInProgress {
		open, err = reconcileLines(ctx, c, client.Filter(`account = {:account} && reconciliation = "" && date <= {:date}`,
			map[string]any{"account": rec.cell("account"), "date": rec.cell("statement_date")}))
		if err != nil {
			return record{}, err
		}
	}
	rec.keys = append(rec.keys, "cleared", "open")
	rec.values["cleared"], rec.values["open"] = cleared, open
	return rec, nil
}

func reconciliationSchema() map[string]any {
	schema := recordSchema(&reconciliationsResource)
	props := schema["properties"].(map[string]any)
	amount := func(description string) map[string]any {
		return map[string]any{"type": "integer", "description": description}
	}
	text := func(description string) map[string]any {
		return map[string]any{"type": "string", "description": description}
	}
	lines := func(description string) map[string]any {
		return map[string]any{
			"type":        "array",
			"description": description,
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"line":         idSchema("the id of the journal line: what `reconcile clear` and `reconcile unclear` take in `lines`"),
					"date":         text("the date of the line's journal entry, YYYY-MM-DD"),
					"debit":        amount("the debit of the line, in cents: a deposit of a bank account, a payment to a credit card"),
					"credit":       amount("the credit of the line, in cents: a payment from a bank account, a charge of a credit card"),
					"payee":        text("the customer or the vendor of the line"),
					"number":       text("the number of the transaction"),
					"doc_type":     text("the type of the transaction, such as payment or bill_payment"),
					"document":     text("the id of the transaction; empty for a journal entry"),
					"memo":         text("the memo of the line"),
					"entry":        idSchema("the id of the journal entry (the id of a record of `books journal-entries`)"),
					"bank_matched": map[string]any{"type": "boolean", "description": "true when a Reviewed bank transaction holds the line: the bank has it"},
				},
				"required": reconcileLineKeys,
			},
		}
	}
	props["cleared"] = lines("the journal lines that are cleared in this reconciliation, by date")
	props["open"] = lines("the journal lines of the account that are in no reconciliation and are dated on or before the statement date, by date: the lines that `reconcile clear` can take. Empty for a finished reconciliation.")
	schema["required"] = append(recordKeys(&reconciliationsResource), "cleared", "open")
	return schema
}

// writeReconciliation prints a reconciliation as `show` does. Every command
// that starts or changes one ends with it, so a caller has `open` after each
// call. The cost is one read of the record and two reads of the view (one for
// a finished reconciliation): `open` is every line of the account that is in
// no reconciliation, up to the statement date.
func writeReconciliation(cmd *cobra.Command, c *client.Client, o output.Options, id string) error {
	rec, err := reconciliationRecord(cmd.Context(), c, id)
	if err != nil {
		return err
	}
	return writeRecord(cmd, o, rec)
}

func newReconcileShowCmd(c *client.Client) *cobra.Command {
	return newCommand(commandDef{
		Name:    "show",
		Short:   "Show one reconciliation, with its cleared lines and the lines that can be cleared",
		Aliases: []string{"view", "get"},
		Long: "Show one reconciliation. `cleared` holds the journal lines that are cleared in it. `open` holds the\n" +
			"lines of the account that `reconcile clear` can take: in no reconciliation, and dated on or before\n" +
			"the statement date.\n\n" +
			"The command prints no difference: Books computes it, and `reconcile finish` states it when it is\n" +
			"not zero.",
		Args:   reconciliationArg(),
		Output: reconciliationSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		return writeReconciliation(cmd, c, o, args[0])
	})
}
