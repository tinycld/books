package cli

import (
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// The kinds of a categorization.
const (
	bankKindCategorize = "categorize"
	bankKindTransfer   = "transfer"
)

// bankCategorizeInput is the --input of `banking categorize`: one account for
// the whole bank amount.
var bankCategorizeInput = resource{
	Name: "banking categorize",
	Fields: []field{
		{Name: "account", Type: typeID, Required: true, Ref: "accounts", Help: "the account of the chart that the whole amount goes to; for a transfer, the other bank or card account"},
		{Name: "kind", Type: typeString, Enum: []string{bankKindCategorize, bankKindTransfer}, Help: "categorize (the default), or transfer for money moved to or from another of your accounts"},
		{Name: "customer", Type: typeID, Ref: "customers", Help: "the customer the money came from; not with vendor"},
		{Name: "vendor", Type: typeID, Ref: "vendors", Help: "the vendor the money went to; not with customer"},
		{Name: "memo", Type: typeString, Help: "the memo of the journal entry"},
	},
}

// bankSplitInput is the --input of `banking split` without its `lines`, which
// are objects and so are checked by checkSplitLines.
var bankSplitInput = resource{
	Name: "banking split",
	Fields: []field{
		{Name: "customer", Type: typeID, Ref: "customers", Help: "the customer the money came from; not with vendor"},
		{Name: "vendor", Type: typeID, Ref: "vendors", Help: "the vendor the money went to; not with customer"},
		{Name: "memo", Type: typeString, Help: "the memo of the journal entry"},
	},
}

// splitLineKeys are the keys of one line of a split.
var splitLineKeys = []string{"account", "amount", "memo"}

func bankSplitInputSchema() map[string]any {
	schema := inputSchema(&bankSplitInput, true)
	schema["properties"].(map[string]any)["lines"] = map[string]any{
		"type":        "array",
		"items":       bankSplitLineSchema(),
		"minItems":    1,
		"maxItems":    50,
		"description": "the accounts the bank amount is divided over. Books refuses lines that do not add up to the bank amount.",
	}
	schema["required"] = []string{"lines"}
	return schema
}

// checkSplitLines refuses a `lines` the server would refuse for its shape.
func checkSplitLines(value any) error {
	list, ok := value.([]any)
	if !ok || len(list) == 0 {
		return usagef(`"lines" is required: an array of objects with account and amount`)
	}
	for i, item := range list {
		line, ok := item.(map[string]any)
		if !ok {
			return usagef(`lines[%d] must be an object with account and amount`, i)
		}
		for _, key := range slices.Sorted(maps.Keys(line)) {
			if !slices.Contains(splitLineKeys, key) {
				return usagef(`lines[%d] has no key %q; keys: %s`, i, key, strings.Join(splitLineKeys, ", "))
			}
		}
		if account, _ := line["account"].(string); account == "" {
			return usagef(`lines[%d]: "account" is required: the id of an account`, i)
		}
		amount, ok := line["amount"].(json.Number)
		if !ok {
			return usagef(`lines[%d]: "amount" is required: a whole number of cents`, i)
		}
		if _, err := amount.Int64(); err != nil {
			return usagef(`lines[%d]: "amount" must be a whole number of cents, without a fraction or an exponent`, i)
		}
		if memo, given := line["memo"]; given {
			if _, ok := memo.(string); !ok {
				return usagef(`lines[%d]: "memo" must be a string`, i)
			}
		}
	}
	return nil
}

// sendCategorization creates the categorization of a bank transaction, with its
// resends, and prints the transaction as `show` does.
func sendCategorization(cmd *cobra.Command, c *client.Client, o output.Options, txn, chosen string, body map[string]any) error {
	id := chosenID(cmd, chosen)
	show := cmd.Parent().CommandPath() + " show " + txn
	if err := refuseStoredOf(cmd, c, bankCategorizationsCollection, id, "categorization", "bank_transaction", bankTransactionsResource.Singular); err != nil {
		return err
	}
	body["id"], body["bank_transaction"] = id, txn
	send := func() error {
		_, err := client.CreateRecord[rawRecord](cmd.Context(), c, bankCategorizationsCollection, body)
		return err
	}
	stored := func() (bool, error) { return recordExists(cmd.Context(), c, bankCategorizationsCollection, id) }
	if err := sendResent(cmd.Context(), send, stored); err != nil {
		return prefixID(&bankTransactionsResource, txn, explain(err, "the categorization "+id+" of bank transaction "+txn, checkThenResend(show, id)))
	}
	o.Info(cmd.ErrOrStderr(), "added bank transaction %s to Books: `%s undo %s` voids its entry", txn, cmd.Parent().CommandPath(), txn)
	return writeBankTransaction(cmd, c, o, txn)
}

func newBankingCategorizeCmd(c *client.Client) *cobra.Command {
	var input, chosen string
	cmd := newCommand(commandDef{
		Name:  "categorize",
		Short: "Add a bank transaction to Books under one account",
		Long: "Add a bank transaction that is For review to Books: Books posts a journal entry between the\n" +
			"connected bank account and the account you name, for the whole bank amount, and the\n" +
			"transaction is Reviewed. With kind transfer, the account is another bank or card account of yours.\n\n" +
			"To divide the amount over more than one account, use `split`. For a customer payment or a bill\n" +
			"payment that is in Books already, use `match`.",
		Args:   bankTransactionArg(),
		Input:  inputSchema(&bankCategorizeInput, true),
		Output: bankTransactionSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		given, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		if err := checkInput(&bankCategorizeInput, given, true); err != nil {
			return err
		}
		txn, err := fetchRecord(cmd.Context(), c, &bankTransactionsResource, args[0])
		if err != nil {
			return err
		}
		// A line holds the amount above 0 for the transaction's own direction:
		// the bank amount as Books sent it, without its sign. Books refuses a
		// categorization whose lines do not total the bank amount.
		amount, ok := txn.values["amount"].(json.Number)
		if !ok {
			// A malformed answer of the server: exit 1, not a refusal of the input.
			return fmt.Errorf("bank transaction %s has no amount", args[0])
		}
		body := maps.Clone(given)
		line := map[string]any{"account": body["account"], "amount": json.Number(strings.TrimPrefix(amount.String(), "-"))}
		delete(body, "account")
		if body["kind"] == nil || body["kind"] == "" {
			body["kind"] = bankKindCategorize
		}
		body["lines"] = []any{line}
		return sendCategorization(cmd, c, o, args[0], chosen, body)
	})
	bindInput(cmd, &input)
	bindID(cmd, &chosen, "the id of the new categorization")
	return cmd
}

func newBankingSplitCmd(c *client.Client) *cobra.Command {
	var input, chosen string
	cmd := newCommand(commandDef{
		Name:  "split",
		Short: "Add a bank transaction to Books divided over two or more accounts",
		Long: "Add a bank transaction that is For review to Books with one line for each account. An amount\n" +
			"is in cents and above 0 for the transaction's own direction: for money out of 86.47, the lines\n" +
			"6000 and 2647. Books refuses lines that do not add up to the bank amount; the command adds nothing up.",
		Args:   bankTransactionArg(),
		Input:  bankSplitInputSchema(),
		Output: bankTransactionSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		given, err := readInput(cmd, input)
		if err != nil {
			return err
		}
		body := maps.Clone(given)
		lines := body["lines"]
		delete(body, "lines")
		if err := checkInput(&bankSplitInput, body, true); err != nil {
			return err
		}
		if err := checkSplitLines(lines); err != nil {
			return err
		}
		body["kind"], body["lines"] = bankKindCategorize, lines
		return sendCategorization(cmd, c, o, args[0], chosen, body)
	})
	bindInput(cmd, &input)
	bindID(cmd, &chosen, "the id of the new categorization")
	return cmd
}

// removeReview deletes the one record of collection that reviews the bank
// transaction, and prints the transaction. missing is the refusal for a
// transaction that has none.
func removeReview(cmd *cobra.Command, c *client.Client, o output.Options, collection, txn, missing, done string) error {
	if _, err := fetchRecord(cmd.Context(), c, &bankTransactionsResource, txn); err != nil {
		return err
	}
	review, err := reviewOf(cmd.Context(), c, collection, txn)
	if err != nil {
		return err
	}
	if review == nil {
		return refusedf("bank transaction %s %s", txn, missing)
	}
	id, _ := review["id"].(string)
	if err := client.DeleteRecord(cmd.Context(), c, collection, id); err != nil {
		return prefixID(&bankTransactionsResource, txn, err)
	}
	o.Info(cmd.ErrOrStderr(), "%s bank transaction %s: it is For review again", done, txn)
	return writeBankTransaction(cmd, c, o, txn)
}

func newBankingUndoCmd(c *client.Client) *cobra.Command {
	return newCommand(commandDef{
		Name:  "undo",
		Short: "Void the entry that categorize or split added for a bank transaction",
		Long: "Take back a `categorize` or a `split`: Books voids the journal entry, and the bank transaction is\n" +
			"For review again. It does not ask first. For a matched transaction, use `unmatch`.",
		Args:   bankTransactionArg(),
		Output: bankTransactionSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		return removeReview(cmd, c, o, bankCategorizationsCollection, args[0],
			"has no entry that `categorize` or `split` added: `unmatch` takes back a match", "undid")
	})
}
