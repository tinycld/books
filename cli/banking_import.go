package cli

import (
	"encoding/json"
	"fmt"
	"maps"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/exitcode"
	"tinycld.org/cli/output"
)

const bankImportsCollection = "books_bank_imports"

// bankImportsResource is one import of lines of a bank file: the columns of a
// CSV file, and what Books made of the lines. `lines` is not a field here:
// it is a list of numbers, which the commands check themselves.
var bankImportsResource = resource{
	Name:       "bank imports",
	Singular:   "bank import",
	Summary:    "The imports of bank files",
	Collection: bankImportsCollection,
	Sort:       "-created,id",
	Fields: []field{
		{Name: "file", Type: typeID, ReadOnly: true, Ref: bankFilesRef, Help: "the file the lines came from"},
		{Name: "header_row", Type: typeBool, Help: "true when the first row of a CSV file holds the column names"},
		{Name: "date_column", Type: typeInteger, Help: "the column that holds the date, from 1"},
		{Name: "date_format", Type: typeString, Enum: []string{"MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YY", "DD/MM/YY"}, Help: "how the file writes a date"},
		{Name: "description_column", Type: typeInteger, Help: "the column that holds the description, from 1"},
		{Name: "amount_columns", Type: typeString, Enum: []string{"one", "two"}, Help: "one: one column holds a signed amount; two: money in and money out have a column each"},
		{Name: "amount_column", Type: typeInteger, Help: "for one: the column that holds the amount, from 1"},
		{Name: "money_in_column", Type: typeInteger, Help: "for two: the column that holds money in, from 1"},
		{Name: "money_out_column", Type: typeInteger, Help: "for two: the column that holds money out, from 1"},
		{Name: "amount_sign", Type: typeString, Enum: []string{"in_positive", "out_positive"}, Help: "for one: in_positive when money in is above 0 in the file (the default), out_positive when money out is"},
		{Name: "imported", Type: typeInteger, ReadOnly: true, Help: "the number of transactions the import made"},
		{Name: "duplicates", Type: typeInteger, ReadOnly: true, Help: "the number of chosen lines Books left out because it holds the same transaction"},
	},
}

// refuseStoredOf refuses an --id that a stored record of the collection has.
// It names what that record belongs to, because that can be another bank file
// or bank transaction than the one of this call.
func refuseStoredOf(cmd *cobra.Command, c *client.Client, collection, id, what, ownerField, owner string) error {
	if !cmd.Flags().Changed("id") {
		return nil
	}
	raw, err := client.GetRecord[rawRecord](cmd.Context(), c, collection, id)
	if err != nil {
		if exitcode.Of(exitcode.Classify(err)) == exitcode.NotFound {
			return nil
		}
		return err
	}
	return refusedf("%s %s already exists, for %s %s; nothing was written", what, id, owner, fmt.Sprint(raw[ownerField]))
}

// bankImportInputSchema is the --input of `banking import`: the columns of a
// CSV file, and the lines to import.
func bankImportInputSchema() map[string]any {
	schema := inputSchema(&bankImportsResource, true)
	schema["properties"].(map[string]any)["lines"] = map[string]any{
		"type":        "array",
		"items":       map[string]any{"type": "integer", "minimum": 1},
		"minItems":    1,
		"description": "the line numbers to import, as `banking rows` prints them. Left out: every row of the file, without the first one when header_row is true.",
	}
	return schema
}

// checkBankLines refuses a `lines` that is not a list of line numbers.
func checkBankLines(value any) error {
	list, ok := value.([]any)
	if !ok || len(list) == 0 {
		return usagef(`"lines" must be an array of line numbers, with one or more`)
	}
	for _, item := range list {
		number, ok := item.(json.Number)
		if !ok {
			return usagef(`"lines" must be an array of line numbers: each one a whole number`)
		}
		if n, err := number.Int64(); err != nil || n < 1 {
			return usagef(`"lines" must be an array of line numbers: %s is not a whole number from 1`, number)
		}
	}
	return nil
}

// everyBankLine is the line of every row of the file, without the header row
// of a CSV file.
func everyBankLine(rows []bankRow, header bool) []any {
	if header && len(rows) > 0 {
		rows = rows[1:]
	}
	lines := make([]any, len(rows))
	for i, row := range rows {
		lines[i] = row.Line
	}
	return lines
}

func newBankingImportCmd(c *client.Client) *cobra.Command {
	var input, chosen string
	cmd := newCommand(commandDef{
		Name:  "import",
		Short: "Import the rows of an uploaded bank file as bank transactions",
		Long: "Make bank transactions from the rows of an uploaded file. They are For review until you\n" +
			"categorize, match or exclude each one.\n\n" +
			"A CSV file needs --input: a JSON object that says which column holds the date, the description\n" +
			"and the amount (`banking rows` prints the columns). An OFX, QFX or QBO file needs no --input.\n" +
			"Without `lines`, every row is imported (not the first row of a CSV file whose header_row is true).\n" +
			"Books leaves out a row that it holds already. It refuses the whole import when it cannot read\n" +
			"one of the rows, and the message names the line: give `lines` without that line then.\n\n" +
			"`tinycld books schema banking import` prints the fields.",
		Args:   bankFileArg(),
		Input:  bankImportInputSchema(),
		Output: recordSchema(&bankImportsResource),
	}, func(cmd *cobra.Command, args []string, o output.Options, _ bool) error {
		if err := checkIDFlag(cmd, chosen); err != nil {
			return err
		}
		body := map[string]any{}
		if input != "" {
			given, err := readInput(cmd, input)
			if err != nil {
				return err
			}
			body = maps.Clone(given)
		}
		lines, hasLines := body["lines"]
		delete(body, "lines")
		if err := checkInput(&bankImportsResource, body, true); err != nil {
			return err
		}
		if hasLines {
			if err := checkBankLines(lines); err != nil {
				return err
			}
		}
		file, err := fetchRecord(cmd.Context(), c, &bankFilesResource, args[0])
		if err != nil {
			return err
		}
		csv := file.cell("format") == "csv"
		if csv && input == "" {
			return usagef("a CSV file needs --input with its columns: see `tinycld books schema banking import`, and `%s rows %s`", cmd.Parent().CommandPath(), args[0])
		}
		if !hasLines {
			rows, err := bankFileRows(cmd, c, args[0])
			if err != nil {
				return err
			}
			header, _ := body["header_row"].(bool)
			lines = everyBankLine(rows.Rows, csv && header)
			if len(lines.([]any)) == 0 {
				return refusedf("bank file %s has no row to import", args[0])
			}
		}
		id := chosenID(cmd, chosen)
		show := cmd.Parent().CommandPath() + " files"
		if err := refuseStoredOf(cmd, c, bankImportsCollection, id, bankImportsResource.Singular, "file", bankFilesResource.Singular); err != nil {
			return err
		}
		body["id"], body["file"], body["lines"] = id, args[0], lines
		send := func() error {
			_, err := client.CreateRecord[rawRecord](cmd.Context(), c, bankImportsCollection, body)
			return err
		}
		stored := func() (bool, error) { return recordExists(cmd.Context(), c, bankImportsCollection, id) }
		if err := sendResent(cmd.Context(), send, stored); err != nil {
			return prefixID(&bankFilesResource, args[0], explain(err, "the import "+id+" of bank file "+args[0], checkThenResend(show, id)))
		}
		rec, err := fetchRecord(cmd.Context(), c, &bankImportsResource, id)
		if err != nil {
			return err
		}
		o.Info(cmd.ErrOrStderr(), "imported %s of %s: %s new, %s already in Books; see them with `%s list`",
			strings.TrimSpace(file.cell("name")), args[0], rec.cell("imported"), rec.cell("duplicates"), cmd.Parent().CommandPath())
		return writeRecord(cmd, o, rec)
	})
	bindInput(cmd, &input)
	bindID(cmd, &chosen, "the id of the new import")
	return cmd
}
