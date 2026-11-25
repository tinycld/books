package cli

import (
	"context"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// What a bank transaction was reviewed with, and what Books suggests for one
// that is For review.
const (
	bankSuggestionsCollection     = "books_bank_match_suggestions"
	bankMatchesCollection         = "books_bank_matches"
	bankCategorizationsCollection = "books_bank_categorizations"
)

// The keys `banking show` prints for each suggestion, for the match and for
// the categorization, in print order.
var (
	bankSuggestionKeys     = []string{"line", "entry", "date", "days_apart"}
	bankMatchKeys          = []string{"id", "lines"}
	bankCategorizationKeys = []string{"id", "kind", "entry", "customer", "vendor", "memo", "lines"}
)

func bankTransactionArg() []argSpec {
	return []argSpec{{Name: "id", Help: "the id of the bank transaction, as `banking list` prints it"}}
}

// pick is a record of the named keys of raw: a key the server does not send is
// null, as in project.
func pick(raw rawRecord, keys []string) record {
	values := make(map[string]any, len(keys))
	for _, key := range keys {
		values[key] = raw[key]
	}
	return record{keys: keys, values: values}
}

// reviewOf reads the one record of collection that reviews the bank
// transaction: its match, or its categorization. nil when it has none.
func reviewOf(ctx context.Context, c *client.Client, collection, id string) (rawRecord, error) {
	page, err := client.ListRecords[rawRecord](ctx, c, collection, client.ListOptions{
		Filter: client.Filter("bank_transaction = {:id}", map[string]any{"id": id}), Page: 1, PerPage: 1,
	})
	if err != nil || len(page.Items) == 0 {
		return nil, err
	}
	return page.Items[0], nil
}

// bankTransactionRecord reads a bank transaction with what `show` adds: the
// suggestions, the match and the categorization.
func bankTransactionRecord(ctx context.Context, c *client.Client, id string) (record, error) {
	rec, err := fetchRecord(ctx, c, &bankTransactionsResource, id)
	if err != nil {
		return record{}, err
	}
	suggested, err := client.ListAll[rawRecord](ctx, c, bankSuggestionsCollection,
		client.Filter("bank_transaction = {:id}", map[string]any{"id": id}), "days_apart,date,line")
	if err != nil {
		return record{}, err
	}
	suggestions := make([]record, 0, len(suggested))
	for _, raw := range suggested {
		suggestions = append(suggestions, pick(raw, bankSuggestionKeys))
	}
	rec.keys = append(rec.keys, "suggestions", "match", "categorization")
	rec.values["suggestions"] = suggestions
	for _, review := range []struct {
		key, collection string
		keys            []string
	}{
		{"match", bankMatchesCollection, bankMatchKeys},
		{"categorization", bankCategorizationsCollection, bankCategorizationKeys},
	} {
		raw, err := reviewOf(ctx, c, review.collection, id)
		if err != nil {
			return record{}, err
		}
		rec.values[review.key] = nil
		if raw != nil {
			rec.values[review.key] = pick(raw, review.keys)
		}
	}
	return rec, nil
}

func idSchema(description string) map[string]any {
	return map[string]any{"type": "string", "description": description}
}

// bankSplitLineSchema is one line of a categorization: an account and a part
// of the bank amount.
func bankSplitLineSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"account": idSchema("the account of the chart that the amount goes to (the id of a record of `books accounts`)"),
			"amount":  map[string]any{"type": "integer", "description": "the part of the bank amount for this account, in cents, above 0 for the transaction's own direction; below 0 takes away from the other lines"},
			"memo":    map[string]any{"type": "string", "description": "a note for this line"},
		},
		"required": []string{"account", "amount"},
	}
}

func bankTransactionSchema() map[string]any {
	schema := recordSchema(&bankTransactionsResource)
	props := schema["properties"].(map[string]any)
	props["suggestions"] = map[string]any{
		"type":        "array",
		"description": "the posted Books transactions that `banking match` can take for this bank transaction: the same account, the same amount, a date near it. Empty when the transaction is not For review.",
		"items": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"line":       idSchema("the id of the journal line: what `banking match` takes in `lines`"),
				"entry":      idSchema("the id of its journal entry (the id of a record of `books journal-entries`)"),
				"date":       map[string]any{"type": "string", "description": "the date of the journal line, YYYY-MM-DD"},
				"days_apart": map[string]any{"type": "integer", "description": "the days between that date and the bank date"},
			},
			"required": bankSuggestionKeys,
		},
	}
	props["match"] = map[string]any{
		"type":        []string{"object", "null"},
		"description": "the match of the transaction; null when it is not matched",
		"properties": map[string]any{
			"id":    idSchema("the id of the match"),
			"lines": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "the ids of the journal lines it is matched to"},
		},
		"required": bankMatchKeys,
	}
	props["categorization"] = map[string]any{
		"type":        []string{"object", "null"},
		"description": "the journal entry that `banking categorize` or `banking split` added for the transaction; null when it has none",
		"properties": map[string]any{
			"id":       idSchema("the id of the categorization"),
			"kind":     map[string]any{"type": "string", "enum": []string{"categorize", "transfer"}, "description": "categorize, or transfer for money moved to or from another of your accounts"},
			"entry":    idSchema("the id of the journal entry Books posted (the id of a record of `books journal-entries`)"),
			"customer": idSchema("the customer, or empty"),
			"vendor":   idSchema("the vendor, or empty"),
			"memo":     map[string]any{"type": "string", "description": "the memo of the entry"},
			"lines":    map[string]any{"type": "array", "items": bankSplitLineSchema(), "description": "the accounts and amounts"},
		},
		"required": bankCategorizationKeys,
	}
	schema["required"] = append(recordKeys(&bankTransactionsResource), "suggestions", "match", "categorization")
	return schema
}

// writeBankTransaction prints a bank transaction as `show` does. Every command
// that changes one ends with it.
func writeBankTransaction(cmd *cobra.Command, c *client.Client, o output.Options, id string) error {
	rec, err := bankTransactionRecord(cmd.Context(), c, id)
	if err != nil {
		return err
	}
	return writeRecord(cmd, o, rec)
}

func newBankingShowCmd(c *client.Client) *cobra.Command {
	return newCommand(commandDef{
		Name:    "show",
		Short:   "Show one bank transaction, with its suggestions and what it was reviewed with",
		Aliases: []string{"view", "get"},
		Long: "Show one bank transaction. `suggestions` are the posted Books transactions that it can be matched to;\n" +
			"`match` and `categorization` say how a Reviewed transaction was handled.",
		Args:   bankTransactionArg(),
		Output: bankTransactionSchema(),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		return writeBankTransaction(cmd, c, o, args[0])
	})
}
